export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../../lib/prisma";
import bcrypt from "bcryptjs";
import { withRole } from "../../../../../lib/withRole";
import { ok, fail, conflict, serverError } from "../../../../../lib/api-response";
import { applyBmAssignment } from "../../../../../lib/auth/bmAssignment";
import { defaultPasswordFor } from "../../../../../lib/auth/defaultPassword";
import * as XLSX from "xlsx";

const SALT_ROUNDS = 10;

/**
 * Normalize column header keys: strip spaces, lowercase, remove non-alphanumeric.
 */
function normRow(row) {
    const out = {};
    for (const [k, v] of Object.entries(row)) {
        out[String(k).trim().toLowerCase().replace(/[^a-z0-9]/g, "")] = typeof v === "string" ? v.trim() : v;
    }
    return out;
}

function pick(row, keys) {
    for (const k of keys) {
        if (row[k] !== undefined && row[k] !== "") return String(row[k]).trim();
    }
    return "";
}

const ROLE_MAP = {
    cluster_manager: "CLUSTER_MANAGER",
    clustermanager: "CLUSTER_MANAGER",
    cm: "CLUSTER_MANAGER",
    branch_manager: "BRANCH_MANAGER",
    branchmanager: "BRANCH_MANAGER",
    bm: "BRANCH_MANAGER",
    employee: "EMPLOYEE",
    emp: "EMPLOYEE",
};

const COLLAR_MAP = {
    blue_collar: "BLUE_COLLAR",
    bluecollar: "BLUE_COLLAR",
    blue: "BLUE_COLLAR",
    bc: "BLUE_COLLAR",
    white_collar: "WHITE_COLLAR",
    whitecollar: "WHITE_COLLAR",
    white: "WHITE_COLLAR",
    wc: "WHITE_COLLAR",
};

/**
 * POST /api/admin/branches/bulk-upload
 *
 * Single-sheet Excel upload that bootstraps a branch:
 *   CM row(s) → BM row(s) → EMPLOYEE rows
 *
 * Columns (case-insensitive): role, empCode, name, department, branch, branchType, collar, designation, mobile, password
 *
 * Creates/upserts Branch → CM → BM → Departments → Employees in a single prisma.$transaction.
 */
export const POST = withRole(["ADMIN"], async (request, { user }) => {
    try {
        const formData = await request.formData();
        const file = formData.get("file");
        if (!file) return fail("No file uploaded");

        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: "array" });
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) return fail("Excel file has no sheets");

        const sheet = workbook.Sheets[sheetName];
        const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
        if (!Array.isArray(rawRows) || rawRows.length === 0) return fail("Excel file has no data rows");

        // Parse and validate rows
        const rows = [];
        const errors = [];
        let seenEmployee = false;

        for (let i = 0; i < rawRows.length; i++) {
            const r = normRow(rawRows[i]);
            const rowNum = i + 2;

            const roleRaw = pick(r, ["role"]).toLowerCase().replace(/[^a-z_]/g, "");
            const role = ROLE_MAP[roleRaw];
            if (!role) { errors.push(`Row ${rowNum}: unknown role "${pick(r, ["role"])}"`); continue; }

            const empCode = pick(r, ["empcode", "employeecode", "empid", "code"]);
            const name = pick(r, ["name", "fullname", "employeename"]);
            if (!empCode) { errors.push(`Row ${rowNum}: missing empCode`); continue; }
            if (!name) { errors.push(`Row ${rowNum}: missing name`); continue; }

            const branchName = pick(r, ["branch", "branchname"]);
            const branchType = (pick(r, ["branchtype", "type"]).toUpperCase() === "BIG") ? "BIG" : "SMALL";
            if (!branchName) { errors.push(`Row ${rowNum}: missing branch name`); continue; }

            // Enforce order: CM/BM before EMPLOYEE
            if (role === "EMPLOYEE") {
                seenEmployee = true;
            } else if (seenEmployee) {
                errors.push(`Row ${rowNum}: CM/BM rows must appear before EMPLOYEE rows`);
                continue;
            }

            const department = pick(r, ["department", "dept", "departmentname"]);
            const collarRaw = pick(r, ["collar", "collartype"]).toLowerCase().replace(/[^a-z_]/g, "");
            const collarType = COLLAR_MAP[collarRaw] || null;
            const designation = pick(r, ["designation", "position", "title"]);
            const mobile = pick(r, ["mobile", "phone", "contact"]);
            const password = pick(r, ["password", "pwd"]);

            if (role === "EMPLOYEE") {
                if (!department) { errors.push(`Row ${rowNum}: EMPLOYEE row missing department`); continue; }
                if (!collarType) { errors.push(`Row ${rowNum}: EMPLOYEE row missing collar type`); continue; }
            }

            rows.push({ rowNum, role, empCode: String(empCode), name, branchName, branchType, department, collarType, designation, mobile, password });
        }

        if (rows.length === 0) return fail("No valid rows to process", 400);

        // All rows should reference the same branch
        const branchNames = [...new Set(rows.map(r => r.branchName))];
        if (branchNames.length > 1) return fail(`Multiple branch names found: ${branchNames.join(", ")}. Upload one branch per sheet.`, 400);

        const branchName = rows[0].branchName;
        const branchType = rows[0].branchType;

        const cmRows = rows.filter(r => r.role === "CLUSTER_MANAGER");
        const bmRows = rows.filter(r => r.role === "BRANCH_MANAGER");
        const empRows = rows.filter(r => r.role === "EMPLOYEE");

        // Pre-hash passwords using the shared default-password rule:
        //   EMPLOYEE                  → empCode
        //   BRANCH/CLUSTER MANAGER    → `${Firstname}_${last 2 digits of empCode}`
        // An explicit value in the `password` column always wins over the default.
        const passwordHashes = new Map();
        for (const r of [...cmRows, ...bmRows]) {
            const plain = r.password || defaultPasswordFor({ role: r.role, empCode: r.empCode, name: r.name });
            passwordHashes.set(r.empCode, await bcrypt.hash(plain, SALT_ROUNDS));
        }
        for (const r of empRows) {
            const plain = r.password || defaultPasswordFor({ role: r.role, empCode: r.empCode, name: r.name });
            passwordHashes.set(r.empCode, await bcrypt.hash(plain, SALT_ROUNDS));
        }

        // Validate department collar consistency
        const deptCollarMap = new Map();
        for (const r of empRows) {
            const existing = deptCollarMap.get(r.department);
            if (existing && existing !== r.collarType) {
                return fail(`Department "${r.department}" has mixed collar types (${existing} and ${r.collarType}). Each department must have one collar type.`, 400);
            }
            deptCollarMap.set(r.department, r.collarType);
        }

        // ── Spec rule: only ONE Branch Manager per branch, only ONE branch
        //    per BM user. Reject the WHOLE upload upfront if any rule fails.
        if (bmRows.length > 1) {
            return conflict(
                `Excel contains ${bmRows.length} BRANCH_MANAGER rows for "${branchName}" — only one is allowed per branch. Conflicting rows: ${bmRows.map(r => `row ${r.rowNum} (${r.empCode})`).join(", ")}.`
            );
        }
        // Also reject duplicate CM rows targeting the same branch in this upload.
        if (cmRows.length > 1) {
            return conflict(
                `Excel contains ${cmRows.length} CLUSTER_MANAGER rows for "${branchName}" — only one is allowed per branch. Conflicting rows: ${cmRows.map(r => `row ${r.rowNum} (${r.empCode})`).join(", ")}.`
            );
        }
        if (bmRows.length === 1) {
            const bmRow = bmRows[0];
            const existingBmUser = await prisma.user.findUnique({
                where: { empCode: bmRow.empCode },
                select: { id: true, bmAssignment: { select: { branchId: true, branch: { select: { name: true } } } } },
            });
            // The user is already BM somewhere — reject unless it is the SAME branch.
            if (existingBmUser?.bmAssignment) {
                const sourceBranch = await prisma.branch.findUnique({ where: { name: branchName }, select: { id: true } });
                if (!sourceBranch || existingBmUser.bmAssignment.branchId !== sourceBranch.id) {
                    return conflict("This user is already assigned as Branch Manager in another branch.");
                }
            }
            // Branch already has a different BM — reject.
            const sourceBranch = await prisma.branch.findUnique({ where: { name: branchName }, select: { id: true } });
            if (sourceBranch) {
                const branchBm = await prisma.branchManagerAssignment.findUnique({
                    where: { branchId: sourceBranch.id },
                    select: { bm: { select: { empCode: true } } },
                });
                if (branchBm && branchBm.bm.empCode !== bmRow.empCode) {
                    return conflict("This branch already has a Branch Manager assigned.");
                }
            }
        }
        if (cmRows.length === 1) {
            const cmRow = cmRows[0];
            const sourceBranch = await prisma.branch.findUnique({ where: { name: branchName }, select: { id: true } });
            if (sourceBranch) {
                const branchCm = await prisma.clusterManagerBranchAssignment.findFirst({
                    where: { branchId: sourceBranch.id },
                    select: { cm: { select: { empCode: true } } },
                });
                if (branchCm && branchCm.cm.empCode !== cmRow.empCode) {
                    return conflict("This branch already has a Cluster Manager assigned.");
                }
            }
        }

        // Execute in a transaction
        const result = await prisma.$transaction(async (tx) => {
            // 1. Upsert Branch
            const branch = await tx.branch.upsert({
                where: { name: branchName },
                update: { branchType },
                create: { name: branchName, location: branchName, branchType },
            });

            // 2. Upsert CM users + maintain ClusterManagerBranchAssignment row
            const cmResult = [];
            for (const r of cmRows) {
                const u = await tx.user.upsert({
                    where: { empCode: r.empCode },
                    update: { name: r.name, role: "CLUSTER_MANAGER", branchId: branch.id, departmentId: null, designation: r.designation || "CM", mobile: r.mobile || null },
                    create: {
                        empCode: r.empCode, name: r.name, role: "CLUSTER_MANAGER",
                        password: passwordHashes.get(r.empCode),
                        branchId: branch.id, designation: r.designation || "CM", mobile: r.mobile || null,
                    },
                });
                // Enforce one-CM-per-branch via the assignment table (the new
                // @@unique([branchId]) backs this up).
                await tx.clusterManagerBranchAssignment.upsert({
                    where: { branchId: branch.id },
                    update: { cmUserId: u.id, assignedBy: user.userId, assignedAt: new Date() },
                    create: { cmUserId: u.id, branchId: branch.id, assignedBy: user.userId },
                });
                cmResult.push({ empCode: u.empCode, name: u.name, id: u.id });
            }

            // 3. Upsert BM users + maintain BranchManagerAssignment row
            const bmResult = [];
            for (const r of bmRows) {
                const u = await tx.user.upsert({
                    where: { empCode: r.empCode },
                    update: { name: r.name, role: "BRANCH_MANAGER", branchId: branch.id, departmentId: null, designation: r.designation || "BM", mobile: r.mobile || null },
                    create: {
                        empCode: r.empCode, name: r.name, role: "BRANCH_MANAGER",
                        password: passwordHashes.get(r.empCode),
                        branchId: branch.id, designation: r.designation || "BM", mobile: r.mobile || null,
                    },
                });
                // Enforce one-BM-per-branch and one-branch-per-BM via the new
                // BranchManagerAssignment table (unique on branchId AND bmUserId).
                await applyBmAssignment(tx, {
                    userId: u.id,
                    branchId: branch.id,
                    assignedBy: user.userId,
                });
                bmResult.push({ empCode: u.empCode, name: u.name, id: u.id });
            }

            // 4. Upsert Departments
            const deptMap = new Map();
            const deptsCreated = [];
            for (const [deptName, collarType] of deptCollarMap) {
                let dept = await tx.department.findFirst({ where: { name: deptName, branchId: branch.id } });
                if (!dept) {
                    dept = await tx.department.create({ data: { name: deptName, branchId: branch.id, collarType } });
                    deptsCreated.push(deptName);
                }
                deptMap.set(deptName, dept.id);
            }

            // 5. Upsert Employee users
            let employeesCreated = 0;
            let employeesUpdated = 0;
            for (const r of empRows) {
                const departmentId = deptMap.get(r.department);
                const existing = await tx.user.findUnique({ where: { empCode: r.empCode } });
                if (existing) {
                    await tx.user.update({
                        where: { empCode: r.empCode },
                        data: {
                            name: r.name, role: "EMPLOYEE", branchId: branch.id, departmentId,
                            collarType: r.collarType, designation: r.designation || null, mobile: r.mobile || null,
                        },
                    });
                    employeesUpdated++;
                } else {
                    await tx.user.create({
                        data: {
                            empCode: r.empCode, name: r.name, role: "EMPLOYEE",
                            password: passwordHashes.get(r.empCode),
                            branchId: branch.id, departmentId, collarType: r.collarType,
                            designation: r.designation || null, mobile: r.mobile || null,
                        },
                    });
                    employeesCreated++;
                }
            }

            return { branch, cm: cmResult, bm: bmResult, departmentsCreated: deptsCreated, employeesCreated, employeesUpdated };
        });

        // Audit log (non-blocking)
        await prisma.auditLog.create({
            data: {
                userId: user.userId,
                action: "BRANCH_BULK_UPLOAD",
                details: {
                    branchId: result.branch.id,
                    branchName: result.branch.name,
                    cmCount: result.cm.length,
                    bmCount: result.bm.length,
                    deptsCreated: result.departmentsCreated.length,
                    employeesCreated: result.employeesCreated,
                    employeesUpdated: result.employeesUpdated,
                    errorCount: errors.length,
                },
            },
        }).catch(() => {});

        return ok({
            branch: { id: result.branch.id, name: result.branch.name, branchType: result.branch.branchType },
            cm: result.cm,
            bm: result.bm,
            departmentsCreated: result.departmentsCreated,
            employeesCreated: result.employeesCreated,
            employeesUpdated: result.employeesUpdated,
            errors,
        });
    } catch (err) {
        // Belt-and-braces concurrency safeguard: if another upload (or a
        // parallel admin call) inserts a conflicting BM/CM row mid-transaction,
        // the new unique indexes raise P2002 — translate to spec messages.
        if (err && err.code === "P2002") {
            const target = err.meta?.target;
            if (Array.isArray(target)) {
                if (target.includes("bm_user_id")) {
                    return conflict("This user is already assigned as Branch Manager in another branch.");
                }
                if (target.some((t) => String(t).includes("branch_id"))) {
                    if (String(err.meta?.modelName || "").toLowerCase().includes("clustermanager")) {
                        return conflict("This branch already has a Cluster Manager assigned.");
                    }
                    return conflict("This branch already has a Branch Manager assigned.");
                }
            }
        }
        console.error("[BRANCH-BULK-UPLOAD] Error:", err.message);
        return serverError();
    }
});
