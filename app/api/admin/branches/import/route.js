export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import bcrypt from "bcryptjs";
import * as XLSX from "xlsx";
import prisma from "../../../../../lib/prisma";
import { withPermission } from "../../../../../lib/withPermission";
import { ok, fail, serverError } from "../../../../../lib/api-response";
import { defaultPasswordFor } from "../../../../../lib/auth/defaultPassword";
import { findRoleHolderConflicts } from "../../../../../lib/auth/bulkUploadDemotionGuard";
import { withDbRetry } from "../../../../../lib/http";

const SALT_ROUNDS = 10;

function normKey(k) {
    return String(k ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function cellStr(v) {
    if (v === null || v === undefined) return "";
    return String(v).trim();
}

/** Slugify a branch name → URL-safe segment (mirrors app/api/admin/branches/route.js). */
function slugify(name) {
    return String(name || "").trim().toLowerCase()
        .replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

const EMPCODE_KEYS  = ["empcode", "employeecode", "empid", "code"];
const NAME_KEYS     = ["name", "employeename", "fullname"];
const DEPT_KEYS     = ["department", "dept", "departmentname", "departmentdescription"];
const MOBILE_KEYS   = ["mobile", "mobileno", "mobilenumber", "phone", "contact"];
const DESIG_KEYS    = ["designation", "designationdescription", "position", "title"];
const LOCATION_KEYS = ["location", "locationdescription", "branch", "branchname", "branchlocation"];

// Any normalized header cell that proves row 0 is a header (not data).
const HEADER_HINTS = new Set([
    ...EMPCODE_KEYS, ...NAME_KEYS, ...DEPT_KEYS, ...MOBILE_KEYS, ...DESIG_KEYS, ...LOCATION_KEYS,
]);

// Fixed column order for headerless Jaipur-style tabs (e.g. "Vehicle-Hired Blue Collor").
const POSITIONAL_LAYOUT = [
    "empcode", "employeename", "doj", "departmentdescription",
    "designationdescription", "mobileno", "role",
];

// Small-branch collar rule: blue if designation contains one of these keywords.
const BLUE_KEYWORDS = ["helper", "security", "cook", "driver"];
function collarFromDesignation(designation) {
    const d = String(designation || "").toLowerCase();
    return BLUE_KEYWORDS.some((k) => d.includes(k)) ? "BLUE_COLLAR" : "WHITE_COLLAR";
}

// Jaipur tab collar rule: from the tab name wording.
function collarFromTab(sheetName) {
    const t = String(sheetName || "").toLowerCase();
    if (t.includes("blue")) return "BLUE_COLLAR";
    if (t.includes("white")) return "WHITE_COLLAR";
    return "WHITE_COLLAR";
}

function pick(obj, keys) {
    for (const k of keys) {
        const v = cellStr(obj[k]);
        if (v) return v;
    }
    return "";
}

/**
 * Parse every sheet of the workbook into normalized employee rows.
 * Handles both header sheets and headerless sheets (positional fallback).
 */
function extractRows(workbook) {
    const rows = [];
    let scannedRows = 0;

    for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: null });
        if (!Array.isArray(grid) || grid.length === 0) continue;

        // Is row 0 a header? Count cells that normalize to a known column key.
        const headerHits = (grid[0] || []).filter((c) => HEADER_HINTS.has(normKey(c))).length;
        const hasHeader = headerHits >= 2;

        const colMap = {};            // column index -> normalized key
        if (hasHeader) {
            (grid[0] || []).forEach((c, i) => { colMap[i] = normKey(c); });
        } else {
            POSITIONAL_LAYOUT.forEach((k, i) => { colMap[i] = k; });
        }

        const dataRows = hasHeader ? grid.slice(1) : grid;
        for (let i = 0; i < dataRows.length; i++) {
            const arr = dataRows[i] || [];
            const obj = {};
            arr.forEach((v, idx) => { if (colMap[idx]) obj[colMap[idx]] = v; });

            const empCode = pick(obj, EMPCODE_KEYS);
            const name = pick(obj, NAME_KEYS);
            if (!empCode && !name) continue; // genuinely empty row
            scannedRows++;

            rows.push({
                rowRef: `${sheetName}!${i + (hasHeader ? 2 : 1)}`,
                sheetName: sheetName.trim(),
                empCode,
                name,
                department: pick(obj, DEPT_KEYS),
                designation: pick(obj, DESIG_KEYS),
                mobile: pick(obj, MOBILE_KEYS),
                location: pick(obj, LOCATION_KEYS),
            });
        }
    }
    return { rows, scannedRows };
}

/**
 * Fully replace one branch's employees + departments with `branchRows`.
 *
 * The whole replace runs as ONE atomic transaction: if any step fails the
 * branch is rolled back to its previous state — it can never be left with its
 * departments dropped but not recreated. The transaction is only a handful of
 * set-based statements (`deleteMany` / `createMany`), so it completes well
 * within the transaction window even for a 300+ employee branch. Default
 * passwords are hashed BEFORE the transaction opens (CPU work, kept out of the
 * DB transaction), and the whole transaction is retried via `withDbRetry` on
 * transient Neon connection errors. Idempotent — safe to re-run.
 *
 * Each row carries: empCode, name, deptName, employeeCollar, designation, mobile.
 */
async function replaceBranch(branch, branchRows, adminEmpCode) {
    const branchId = branch.id;

    // ── Department set: one per distinct deptName; collar = majority of its
    //    employees' collar (tie → WHITE_COLLAR). ──
    const deptTally = new Map();      // deptName -> { blue, white }
    for (const r of branchRows) {
        if (!r.deptName) continue;
        const t = deptTally.get(r.deptName) || { blue: 0, white: 0 };
        if (r.employeeCollar === "BLUE_COLLAR") t.blue++; else t.white++;
        deptTally.set(r.deptName, t);
    }
    const deptDefs = [...deptTally.entries()].map(([name, t]) => ({
        name,
        collarType: t.blue > t.white ? "BLUE_COLLAR" : "WHITE_COLLAR",
    }));

    const keptCodes = [...new Set(branchRows.map((r) => r.empCode))];

    // ── Hash default passwords BEFORE the transaction (CPU work, not DB). ──
    const passwords = await Promise.all(branchRows.map((r) =>
        bcrypt.hash(defaultPasswordFor({ role: "EMPLOYEE", empCode: r.empCode, name: r.name }), SALT_ROUNDS)
    ));

    // ── Atomic replace. Retried as a whole on transient connection errors. ──
    return withDbRetry(() => prisma.$transaction(async (tx) => {
        // Snapshot the employees who are leaving (in this branch, not in the
        // sheet) before any delete. Role-holders are excluded by the filter.
        const staleUsers = await tx.user.findMany({
            where: {
                AND: [
                    { OR: [{ branchId }, { department: { branchId } }] },
                    { role: { in: ["EMPLOYEE", "HOD"] } },
                    { empCode: { not: null } },
                    { empCode: { notIn: keptCodes } },
                ],
            },
            select: {
                id: true, empCode: true, name: true, mobile: true,
                designation: true, createdAt: true,
                department: { select: { name: true } },
            },
        });
        if (staleUsers.length > 0) {
            await tx.archivedEmployee.createMany({
                data: staleUsers.map((u) => ({
                    empCode: u.empCode,
                    name: u.name,
                    mobile: u.mobile,
                    designation: u.designation,
                    department: u.department?.name || "Unknown",
                    joiningDate: u.createdAt,
                    reasonLeaving: `Replaced by branch sheet import (${branch.name})`,
                    archivedBy: adminEmpCode,
                    originalUserId: u.id,
                })),
            });
        }

        // Delete every EMPLOYEE/HOD of this branch (stale + continuing), plus
        // anyone elsewhere holding an imported empCode (branch movers) so the
        // recreate below cannot hit the empCode unique constraint. Cascades
        // clear their dependent rows.
        await tx.user.deleteMany({
            where: {
                role: { in: ["EMPLOYEE", "HOD"] },
                OR: [
                    { branchId },
                    { department: { branchId } },
                    { empCode: { in: keptCodes } },
                ],
            },
        });

        // Drop and recreate this branch's departments.
        await tx.department.deleteMany({ where: { branchId } });
        if (deptDefs.length > 0) {
            await tx.department.createMany({
                data: deptDefs.map((d) => ({ name: d.name, branchId, collarType: d.collarType })),
            });
        }
        const freshDepts = await tx.department.findMany({
            where: { branchId }, select: { id: true, name: true },
        });
        const deptIdByName = new Map(freshDepts.map((d) => [d.name, d.id]));

        // Recreate every imported employee.
        await tx.user.createMany({
            data: branchRows.map((r, i) => ({
                empCode: r.empCode,
                name: r.name,
                password: passwords[i],
                role: "EMPLOYEE",
                branchId,
                departmentId: r.deptName ? (deptIdByName.get(r.deptName) || null) : null,
                collarType: r.employeeCollar,
                designation: r.designation || null,
                mobile: r.mobile || null,
            })),
            skipDuplicates: true,
        });

        return {
            departmentsCreated: deptDefs.map((d) => `${d.name} (${d.collarType})`),
            employeesImported: branchRows.length,
            archivedEmployees: staleUsers.map((u) => ({ empCode: u.empCode, name: u.name })),
        };
    }, { timeout: 60000, maxWait: 15000 }));
}

/**
 * POST /api/admin/branches/import
 *
 * Full branch-data replacement importer. Accepts an employee Excel workbook
 * and, for every branch it covers, replaces ALL existing employees and
 * departments with the sheet's contents (the sheet is the source of truth).
 *
 * Two workbook shapes are auto-detected:
 *   • Jaipur tab style — no Location column; ONE department per sheet tab,
 *     collar from the tab name. Target branch = the `branchName` form field.
 *   • Small-branch style — rows carry Location_Description; departments come
 *     from the Department_Description column, employee collar from designation.
 *     Each location is replaced independently; a branch named in the sheet but
 *     missing from the system is created (as SMALL).
 *
 * Body (multipart/form-data): `file` (required), `branchName` (required only
 * for the no-Location Jaipur file).
 */
export const POST = withPermission("branches.add", async (request, { user }) => {
    try {
        const formData = await request.formData();
        const file = formData.get("file");
        if (!file || typeof file.arrayBuffer !== "function") return fail("No file uploaded");
        const branchNameInput = cellStr(formData.get("branchName"));

        const workbook = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array" });
        if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
            return fail("Excel file has no sheets");
        }

        const { rows: rawRows, scannedRows } = extractRows(workbook);
        if (rawRows.length === 0) return fail("No employee rows found in the file");

        // ── Backfill slugs for every branch missing one (fixes branch links). ──
        const slugless = await withDbRetry(() => prisma.branch.findMany({
            where: { slug: null }, select: { id: true, name: true },
        }));
        if (slugless.length > 0) {
            const taken = new Set(
                (await withDbRetry(() => prisma.branch.findMany({
                    where: { slug: { not: null } }, select: { slug: true },
                }))).map((b) => b.slug)
            );
            for (const b of slugless) {
                let s = slugify(b.name) || `branch-${b.id.slice(-6)}`;
                let candidate = s, n = 2;
                while (taken.has(candidate)) candidate = `${s}-${n++}`;
                taken.add(candidate);
                await withDbRetry(() => prisma.branch.update({ where: { id: b.id }, data: { slug: candidate } }));
            }
        }

        // ── Validate rows; skip rows with no empCode / no name. ──
        const errors = [];
        const skipped = [];
        const validRows = [];
        for (const r of rawRows) {
            if (!r.empCode) { errors.push(`${r.rowRef}: missing employee code — row skipped`); continue; }
            if (!r.name) { errors.push(`${r.rowRef}: missing name (required field) — row skipped`); continue; }
            validRows.push(r);
        }
        if (validRows.length === 0) return fail("No importable rows (every row was missing empCode/name)");

        // ── File shape: Location column present → small-branch mode. ──
        const smallMode = validRows.some((r) => r.location);

        // ── Per-row department + collar, per the confirmed rules. ──
        for (const r of validRows) {
            if (smallMode) {
                r.deptName = r.department;                       // Department_Description column
                r.employeeCollar = collarFromDesignation(r.designation);
            } else {
                r.deptName = r.sheetName;                        // the tab IS the department
                r.employeeCollar = collarFromTab(r.sheetName);
            }
        }

        // ── Global dedupe by empCode — last occurrence wins. ──
        const seen = new Map();
        for (const r of validRows) seen.set(r.empCode, r);
        const dedupedRows = [...seen.values()];
        const duplicatesInFile = validRows.length - dedupedRows.length;

        // ── Safety: never demote/replace an ADMIN or a current BM/CM/HR/Committee. ──
        const allCodes = dedupedRows.map((r) => r.empCode);
        const adminUsers = await withDbRetry(() => prisma.user.findMany({
            where: { empCode: { in: allCodes }, role: "ADMIN" },
            select: { empCode: true },
        }));
        const adminCodes = new Set(adminUsers.map((u) => u.empCode));
        const { blocked } = await findRoleHolderConflicts(
            dedupedRows.map((r) => ({ rowNum: r.rowRef, empCode: r.empCode }))
        );
        const blockedCodes = new Set(blocked.map((u) => u.empCode));

        const importableRows = dedupedRows.filter((r) => {
            if (adminCodes.has(r.empCode)) {
                skipped.push({ rowRef: r.rowRef, empCode: r.empCode, reason: "preserved as ADMIN" });
                return false;
            }
            if (blockedCodes.has(r.empCode)) {
                skipped.push({ rowRef: r.rowRef, empCode: r.empCode, reason: "preserved as current role-holder" });
                return false;
            }
            return true;
        });

        // ── Group rows by branch. ──
        const groups = new Map();   // key -> { label, rows }
        if (smallMode) {
            for (const r of importableRows) {
                if (!r.location) {
                    errors.push(`${r.rowRef}: missing location — cannot assign to a branch, row skipped`);
                    continue;
                }
                const key = r.location.trim().toLowerCase();
                if (!groups.has(key)) groups.set(key, { label: r.location.trim(), rows: [] });
                groups.get(key).rows.push(r);
            }
        } else {
            if (!branchNameInput) {
                return fail("This file has no Location column — select the target branch before importing.");
            }
            groups.set(branchNameInput.toLowerCase(), { label: branchNameInput, rows: importableRows });
        }
        if (groups.size === 0) return fail("No rows could be assigned to a branch");

        // ── Resolve / create each branch, then replace. ──
        const allBranches = await withDbRetry(() => prisma.branch.findMany({
            select: { id: true, name: true, slug: true, branchType: true },
        }));
        const takenSlugs = new Set(allBranches.map((b) => b.slug).filter(Boolean));
        const findBranch = (label) =>
            allBranches.find((b) => b.name.trim().toLowerCase() === label.trim().toLowerCase());

        const branchResults = [];
        for (const { label, rows } of groups.values()) {
            let branch = findBranch(label);
            let created = false;
            if (!branch) {
                let s = slugify(label) || `branch-${Date.now()}`;
                let candidate = s, n = 2;
                while (takenSlugs.has(candidate)) candidate = `${s}-${n++}`;
                takenSlugs.add(candidate);
                branch = await withDbRetry(() => prisma.branch.create({
                    data: { name: label, location: label, branchType: "SMALL", slug: candidate },
                    select: { id: true, name: true, slug: true, branchType: true },
                }));
                allBranches.push(branch);
                created = true;
            }

            const result = await replaceBranch(branch, rows, user.empCode);
            branchResults.push({
                branch: { id: branch.id, name: branch.name, slug: branch.slug },
                branchCreated: created,
                rowsForBranch: rows.length,
                ...result,
            });
        }

        await prisma.auditLog.create({
            data: {
                userId: user.userId,
                action: "ADMIN_BRANCH_SHEET_IMPORT",
                details: {
                    mode: smallMode ? "small-branch" : "jaipur-tabs",
                    sheetsRead: workbook.SheetNames.length,
                    scannedRows,
                    branchesProcessed: branchResults.map((b) => b.branch.name),
                    branchesCreated: branchResults.filter((b) => b.branchCreated).map((b) => b.branch.name),
                    employeesImported: branchResults.reduce((s, b) => s + b.employeesImported, 0),
                    archivedEmployees: branchResults.reduce((s, b) => s + b.archivedEmployees.length, 0),
                    duplicatesInFile,
                    skipped: skipped.length,
                    errorCount: errors.length,
                },
            },
        }).catch(() => {});

        return ok({
            mode: smallMode ? "small-branch" : "jaipur-tabs",
            sheetsRead: workbook.SheetNames.length,
            scannedRows,
            duplicatesInFile,
            branches: branchResults,
            skipped,
            errors,
        });
    } catch (err) {
        console.error("[ADMIN-BRANCH-SHEET-IMPORT] Error:", err);
        return serverError();
    }
});
