export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import bcrypt from "bcryptjs";
import * as XLSX from "xlsx";
import prisma from "../../../../../../../lib/prisma";
import { withRole } from "../../../../../../../lib/withRole";
import { ok, fail, conflict, serverError, notFound } from "../../../../../../../lib/api-response";
import { requireBranchScope } from "../../../../../../../lib/auth/requireBranchScope";
import { resolveBranch } from "../../../../../../../lib/resolveBranch";
import { defaultPasswordFor } from "../../../../../../../lib/auth/defaultPassword";
import { findRoleHolderConflicts, buildRoleHolderConflictMessage } from "../../../../../../../lib/auth/bulkUploadDemotionGuard";

const SALT_ROUNDS = 10;

function normKey(k) {
    return String(k).trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normRow(row) {
    const out = {};
    for (const [k, v] of Object.entries(row)) {
        out[normKey(k)] = typeof v === "string" ? v.trim() : v;
    }
    return out;
}

function pick(row, keys) {
    for (const k of keys) {
        if (row[k] !== undefined && row[k] !== null && row[k] !== "") return String(row[k]).trim();
    }
    return "";
}

const COLLAR_MAP = {
    blue_collar: "BLUE_COLLAR", bluecollar: "BLUE_COLLAR", blue: "BLUE_COLLAR", bc: "BLUE_COLLAR",
    white_collar: "WHITE_COLLAR", whitecollar: "WHITE_COLLAR", white: "WHITE_COLLAR", wc: "WHITE_COLLAR",
};

const EMPCODE_KEYS    = ["empcode", "employeecode", "empid", "code"];
const NAME_KEYS       = ["name", "employeename", "fullname"];
const DEPT_KEYS       = ["department", "dept", "departmentname", "departmentdescription"];
const MOBILE_KEYS     = ["mobile", "mobileno", "phone", "contact"];
const DESIG_KEYS      = ["designation", "designationdescription", "position", "title"];
const COLLAR_KEYS     = ["collar", "collartype"];
const LOCATION_KEYS   = ["location", "locationdescription", "branch", "branchname"];
const DIVISION_KEYS   = ["division", "divisiondescription"];

function deriveCollar(row, sheetName) {
    const explicit = pick(row, COLLAR_KEYS).toLowerCase().replace(/[^a-z_]/g, "");
    if (explicit && COLLAR_MAP[explicit]) return COLLAR_MAP[explicit];

    const division = pick(row, DIVISION_KEYS).toLowerCase();
    if (division.includes("worker")) return "BLUE_COLLAR";
    if (division.includes("management") || division.includes("staff")) return "WHITE_COLLAR";

    const tab = String(sheetName || "").toLowerCase();
    if (/\bblue\s*coll/.test(tab) || tab.includes("blue collar")) return "BLUE_COLLAR";
    if (/\bwhite\s*coll/.test(tab) || tab.includes("white collar")) return "WHITE_COLLAR";

    return "WHITE_COLLAR";
}

/**
 * POST /api/admin/branches/[branchId]/employees/bulk-upload
 *
 * Admin-scoped, branch-targeted employees-only Excel upload.
 *
 * Accepts both formats:
 *   • Jaipur-style: multi-tab workbook, one tab per (sub-)department; each
 *     sheet has columns EmpCode, Employee_Name, Department_Description,
 *     Designation_Description, MobileNo (and other fields we ignore).
 *   • Small-branch style: single tab with all employees mixed across multiple
 *     branches; carries Location_Description per row. Upload the same file
 *     once per branch URL — rows for other locations are silently skipped.
 *
 * Branch is determined ONLY by the URL `branchId`. Per-row Location_Description
 * (when present) is used as a filter, never to override the URL branch.
 *
 * Extra columns (Role, DOJ, Supervisors, Branch Managers, Cluster Managers,
 * Division_Description, etc.) are silently ignored.
 *
 * Safety:
 *   • Existing ADMIN users are silently skipped (never demoted).
 *   • Existing BM/CM/HR/Committee role-holders cause the upload to be rejected
 *     (use Org Structure to unassign first).
 */
export const POST = withRole(["ADMIN"], async (request, { params, user }) => {
    try {
        const { branchId: slugOrId, error } = requireBranchScope(user, params);
        if (error) return error;

        const branch = await resolveBranch(slugOrId);
        if (!branch) return notFound("Branch not found");
        const branchId = branch.id;
        const targetBranchKey = branch.name.trim().toLowerCase();

        const formData = await request.formData();
        const file = formData.get("file");
        if (!file) return fail("No file uploaded");

        // Opt-in replace-mode: when "replace", every active EMPLOYEE/HOD in this
        // branch whose empCode is NOT in the uploaded sheet is archived (moved
        // to ArchivedEmployee + deleted), and every department in this branch
        // that the uploaded sheet doesn't resolve to is hard-deleted. Default
        // ("merge") keeps the historical upsert-only behavior.
        const modeRaw = formData.get("mode");
        const replaceMode = String(modeRaw || "").trim().toLowerCase() === "replace";

        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: "array" });
        if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
            return fail("Excel file has no sheets");
        }

        const rows = [];
        const errors = [];
        const skipped = [];
        let scannedRows = 0;

        for (const sheetName of workbook.SheetNames) {
            const sheet = workbook.Sheets[sheetName];
            const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
            if (!Array.isArray(rawRows) || rawRows.length === 0) continue;

            for (let i = 0; i < rawRows.length; i++) {
                scannedRows++;
                const r = normRow(rawRows[i]);
                const rowRef = `${sheetName}!${i + 2}`;

                const empCode = pick(r, EMPCODE_KEYS);
                const name = pick(r, NAME_KEYS);
                if (!empCode && !name) continue; // empty row — common in multi-tab sheets
                if (!empCode) { errors.push(`${rowRef}: missing empCode`); continue; }
                if (!name) { errors.push(`${rowRef}: missing name`); continue; }

                // Per-row branch filter — only rows for this URL branch get imported.
                const location = pick(r, LOCATION_KEYS);
                if (location && location.trim().toLowerCase() !== targetBranchKey) {
                    skipped.push({ rowRef, empCode, reason: `belongs to branch "${location}"` });
                    continue;
                }

                const department = pick(r, DEPT_KEYS);
                if (!department) { errors.push(`${rowRef}: missing department`); continue; }

                const collarType = deriveCollar(r, sheetName);
                const designation = pick(r, DESIG_KEYS);
                const mobile = pick(r, MOBILE_KEYS);

                rows.push({
                    rowRef,
                    sheetName,
                    empCode: String(empCode),
                    name,
                    department,
                    collarType,
                    designation,
                    mobile,
                });
            }
        }

        if (rows.length === 0) {
            return fail(
                skipped.length > 0
                    ? `No employee rows for "${branch.name}". ${skipped.length} row(s) belonged to other branches.`
                    : "No valid rows to process",
                400
            );
        }

        // De-duplicate within the upload itself — last occurrence wins.
        const seen = new Map();
        for (const r of rows) seen.set(r.empCode, r);
        const dedupedRows = [...seen.values()];
        const dupedOut = rows.length - dedupedRows.length;

        // Build the set of (department-name, collar) pairs that need a target dept.
        // Real-world departments often have BOTH a blue-collar variant (workers)
        // AND a white-collar variant (supervisors / managers) — e.g. Jaipur has
        // both "Distribution" (BLUE_COLLAR) and "Distribution White Collar" (WHITE_COLLAR).
        // The Excel sheet uses the SAME `Department_Description` value ("Distribution")
        // for both groups, so dept lookup must be done by (name, collar) PAIR, not name alone.
        const deptKeyOf = (name, collar) => `${name}::${collar}`;
        const deptPairs = new Set();
        for (const r of dedupedRows) deptPairs.add(deptKeyOf(r.department, r.collarType));

        // ── Safety: never demote an ADMIN user. Silently filter ADMIN rows out.
        const adminUsers = await prisma.user.findMany({
            where: { empCode: { in: dedupedRows.map((r) => r.empCode) }, role: "ADMIN" },
            select: { empCode: true, name: true },
        });
        const adminCodes = new Set(adminUsers.map((u) => u.empCode));
        let importableRows = dedupedRows.filter((r) => {
            if (adminCodes.has(r.empCode)) {
                skipped.push({ rowRef: r.rowRef, empCode: r.empCode, reason: "preserved as ADMIN" });
                return false;
            }
            return true;
        });

        // ── Safety: refuse-to-demote guard for BM/CM/HR/Committee.
        // Merge mode: reject the entire upload (caller must unassign first).
        // Replace mode: silently skip the conflicting rows — the role-holders
        // stay in place untouched, and (since the archive query only targets
        // role IN [EMPLOYEE, HOD]) they will not be archived either.
        const guardRows = importableRows.map((r) => ({ rowNum: r.rowRef, empCode: r.empCode }));
        const { blocked, offendingRows } = await findRoleHolderConflicts(guardRows);
        if (blocked.length > 0) {
            if (!replaceMode) {
                return conflict(buildRoleHolderConflictMessage(blocked, offendingRows));
            }
            const blockedRoleByCode = new Map(blocked.map((u) => [u.empCode, u.role]));
            importableRows = importableRows.filter((r) => {
                if (blockedRoleByCode.has(r.empCode)) {
                    skipped.push({
                        rowRef: r.rowRef,
                        empCode: r.empCode,
                        reason: `preserved as ${blockedRoleByCode.get(r.empCode)}`,
                    });
                    return false;
                }
                return true;
            });
        }

        if (importableRows.length === 0) {
            return ok({
                branch: { id: branch.id, name: branch.name },
                mode: replaceMode ? "replace" : "merge",
                departmentsCreated: [],
                employeesCreated: 0,
                employeesUpdated: 0,
                archivedEmployees: [],
                removedDepartments: [],
                scannedRows,
                duplicatesInFile: dupedOut,
                skipped,
                errors,
            });
        }

        // Pre-hash default passwords. EMPLOYEE → empCode (per spec).
        const hashes = new Map();
        for (const r of importableRows) {
            const plain = defaultPasswordFor({ role: "EMPLOYEE", empCode: r.empCode, name: r.name });
            hashes.set(r.empCode, await bcrypt.hash(plain, SALT_ROUNDS));
        }

        const result = await prisma.$transaction(async (tx) => {
            // Collar-aware department resolution. For each (deptName, collar) pair:
            //   1. Exact match (name = deptName, collarType = collar)            → use it
            //   2. Pre-seeded suffix variant ("Distribution White Collar" etc.,
            //      starts-with deptName, collarType matches)                     → use it
            //   3. Same-name dept regardless of collar (single-collar dept)      → use it
            //   4. Create. If a same-name dept of a DIFFERENT collar already
            //      exists, append " White Collar" / " Blue Collar" suffix to
            //      avoid the @@unique([name, branchId]) constraint.
            const deptMap = new Map();           // (name, collar) → dept.id
            const deptsCreated = [];
            const deptResolutionLog = [];        // for response/audit
            const collarSuffix = (c) => c === "WHITE_COLLAR" ? "White Collar" : "Blue Collar";

            for (const key of deptPairs) {
                const [deptName, collarType] = key.split("::");

                // 1) exact (name, collar) match
                let dept = await tx.department.findFirst({
                    where: { branchId, name: deptName, collarType },
                });
                let resolvedVia = "exact-name-collar";

                // 2) pre-seeded suffix variant
                if (!dept) {
                    dept = await tx.department.findFirst({
                        where: {
                            branchId,
                            collarType,
                            name: { startsWith: deptName, mode: "insensitive" },
                        },
                    });
                    if (dept) resolvedVia = "suffix-variant";
                }

                // 3) any-collar same-name fallback (single-collar dept exists).
                //    Skipped in replace mode — the sheet is the source of truth
                //    for collar, so an unsplit dept of a different collar should
                //    not absorb a row tagged with the opposite collar. Step 4
                //    will create the missing collar variant (suffix-named) so
                //    both Maintenance/Security blue and white end up distinct.
                if (!dept && !replaceMode) {
                    dept = await tx.department.findFirst({
                        where: { branchId, name: deptName },
                    });
                    if (dept) resolvedVia = "name-only-fallback";
                }

                // 4) create
                if (!dept) {
                    const sameNameOtherCollar = await tx.department.findFirst({
                        where: { branchId, name: deptName },
                    });
                    const finalName = sameNameOtherCollar
                        ? `${deptName} ${collarSuffix(collarType)}`
                        : deptName;
                    dept = await tx.department.create({
                        data: { name: finalName, branchId, collarType },
                    });
                    deptsCreated.push(finalName);
                    resolvedVia = "created";
                }

                deptMap.set(key, dept.id);
                deptResolutionLog.push({ deptName, collarType, resolvedTo: dept.name, deptCollar: dept.collarType, via: resolvedVia });
            }

            let createdCount = 0, updatedCount = 0;
            for (const r of importableRows) {
                const departmentId = deptMap.get(deptKeyOf(r.department, r.collarType));
                const existing = await tx.user.findUnique({ where: { empCode: r.empCode } });
                if (existing) {
                    await tx.user.update({
                        where: { empCode: r.empCode },
                        data: {
                            name: r.name, role: "EMPLOYEE", branchId, departmentId,
                            collarType: r.collarType,
                            designation: r.designation || null, mobile: r.mobile || null,
                        },
                    });
                    updatedCount++;
                } else {
                    await tx.user.create({
                        data: {
                            empCode: r.empCode, name: r.name, role: "EMPLOYEE",
                            password: hashes.get(r.empCode),
                            branchId, departmentId, collarType: r.collarType,
                            designation: r.designation || null, mobile: r.mobile || null,
                        },
                    });
                    createdCount++;
                }
            }

            // ── Replace-mode cleanup (opt-in) ──────────────────────────────
            // Runs only when the caller explicitly sent mode=replace. Archives
            // EMPLOYEE/HOD users in this branch that the sheet didn't cover,
            // then hard-deletes departments in this branch the sheet didn't
            // resolve to. Role-holders (ADMIN/BM/CM/HR/COMMITTEE/SUPERVISOR)
            // are deliberately excluded by the role filter — never demoted,
            // never archived by an import. Every kept user is already pointed
            // at a dept in keptDeptIds by the upsert above, so deleting stale
            // depts cannot orphan a live employee.
            const archivedEmployees = [];
            const removedDepartments = [];
            if (replaceMode) {
                const keptEmpCodes = new Set(importableRows.map((r) => r.empCode));
                const keptDeptIds  = new Set(deptMap.values());

                const staleUsers = await tx.user.findMany({
                    where: {
                        AND: [
                            { OR: [{ branchId }, { department: { branchId } }] },
                            { role: { in: ["EMPLOYEE", "HOD"] } },
                            { empCode: { not: null } },
                            { empCode: { notIn: [...keptEmpCodes] } },
                        ],
                    },
                    select: {
                        id: true, empCode: true, name: true, mobile: true,
                        designation: true, createdAt: true,
                        department: { select: { name: true } },
                    },
                });

                for (const u of staleUsers) {
                    await tx.archivedEmployee.create({
                        data: {
                            empCode: u.empCode,
                            name: u.name,
                            mobile: u.mobile,
                            designation: u.designation,
                            department: u.department?.name || "Unknown",
                            joiningDate: u.createdAt,
                            reasonLeaving: `Replaced by bulk upload (${branch.name})`,
                            archivedBy: user.empCode,
                            originalUserId: u.id,
                        },
                    });
                    await tx.user.delete({ where: { id: u.id } });
                    archivedEmployees.push({ empCode: u.empCode, name: u.name });
                }

                const staleDepts = await tx.department.findMany({
                    where: { branchId, id: { notIn: [...keptDeptIds] } },
                    select: { id: true, name: true, collarType: true },
                });
                for (const d of staleDepts) {
                    await tx.department.delete({ where: { id: d.id } });
                    removedDepartments.push({ name: d.name, collarType: d.collarType });
                }
            }

            return {
                deptsCreated, deptResolutionLog,
                employeesCreated: createdCount, employeesUpdated: updatedCount,
                archivedEmployees, removedDepartments,
            };
        });

        // Per-department row count (using the resolved dept name) — useful for
        // verifying the imported counts match the source sheet.
        const importedByDept = {};
        for (const r of importableRows) {
            const deptId = result.deptResolutionLog.find(
                (e) => e.deptName === r.department && e.collarType === r.collarType
            )?.resolvedTo || `${r.department} (${r.collarType})`;
            importedByDept[deptId] = (importedByDept[deptId] || 0) + 1;
        }

        await prisma.auditLog.create({
            data: {
                userId: user.userId,
                action: "ADMIN_BRANCH_EMPLOYEE_BULK_UPLOAD",
                details: {
                    branchId, branchName: branch.name,
                    mode: replaceMode ? "replace" : "merge",
                    sheetsRead: workbook.SheetNames.length,
                    scannedRows,
                    deptsCreated: result.deptsCreated.length,
                    employeesCreated: result.employeesCreated,
                    employeesUpdated: result.employeesUpdated,
                    archivedEmployees: result.archivedEmployees.length,
                    removedDepartments: result.removedDepartments.length,
                    duplicatesInFile: dupedOut,
                    skipped: skipped.length,
                    errorCount: errors.length,
                },
            },
        }).catch(() => {});

        return ok({
            branch: { id: branch.id, name: branch.name },
            mode: replaceMode ? "replace" : "merge",
            sheetsRead: workbook.SheetNames.length,
            scannedRows,
            departmentsCreated: result.deptsCreated,
            departmentResolution: result.deptResolutionLog,
            employeesCreated: result.employeesCreated,
            employeesUpdated: result.employeesUpdated,
            archivedEmployees: result.archivedEmployees,
            removedDepartments: result.removedDepartments,
            importedByDepartment: importedByDept,
            duplicatesInFile: dupedOut,
            skipped,
            errors,
        });
    } catch (err) {
        console.error("[ADMIN-BRANCH-BULK-UPLOAD] Error:", err.message);
        return serverError();
    }
});
