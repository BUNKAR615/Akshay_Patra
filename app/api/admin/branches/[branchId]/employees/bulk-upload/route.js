export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import bcrypt from "bcryptjs";
import * as XLSX from "xlsx";
import prisma from "../../../../../../../lib/prisma";
import { withRole } from "../../../../../../../lib/withRole";
import { ok, fail, serverError, notFound } from "../../../../../../../lib/api-response";
import { requireBranchScope } from "../../../../../../../lib/auth/requireBranchScope";
import { resolveBranch } from "../../../../../../../lib/resolveBranch";
import { defaultPasswordFor } from "../../../../../../../lib/auth/defaultPassword";

const SALT_ROUNDS = 10;

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

const COLLAR_MAP = {
    blue_collar: "BLUE_COLLAR", bluecollar: "BLUE_COLLAR", blue: "BLUE_COLLAR", bc: "BLUE_COLLAR",
    white_collar: "WHITE_COLLAR", whitecollar: "WHITE_COLLAR", white: "WHITE_COLLAR", wc: "WHITE_COLLAR",
};

const ALLOWED_HEADERS = {
    empcode:     "empCode",
    name:        "name",
    department:  "department",
    collar:      "collar",
    designation: "designation",
    mobile:      "mobile",
};
const REQUIRED_HEADERS = ["empcode", "name", "department", "collar"];

/**
 * POST /api/admin/branches/[branchId]/employees/bulk-upload
 *
 * Admin-scoped, branch-targeted employees-only Excel upload. The branchId
 * is resolved from the URL segment (not the caller's token), so admins can
 * upload into any branch. Upserts EMPLOYEE users and creates missing
 * departments within the targeted branch. Never modifies CM/BM or branch shape.
 *
 * Required columns: empCode, name, department, collar (WHITE_COLLAR | BLUE_COLLAR)
 * Optional: designation, mobile
 */
export const POST = withRole(["ADMIN"], async (request, { params, user }) => {
    try {
        const { branchId: slugOrId, error } = requireBranchScope(user, params);
        if (error) return error;

        const branch = await resolveBranch(slugOrId);
        if (!branch) return notFound("Branch not found");
        const branchId = branch.id;

        const formData = await request.formData();
        const file = formData.get("file");
        if (!file) return fail("No file uploaded");

        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: "array" });
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) return fail("Excel file has no sheets");

        const sheet = workbook.Sheets[sheetName];
        const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
        if (!Array.isArray(rawRows) || rawRows.length === 0) return fail("No data rows");

        const headerRow = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" })[0] || [];
        const normalizedHeaders = headerRow
            .map(h => String(h).trim())
            .filter(h => h.length > 0)
            .map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ""));

        const unknown = normalizedHeaders.filter(h => !(h in ALLOWED_HEADERS));
        const missingRequired = REQUIRED_HEADERS.filter(h => !normalizedHeaders.includes(h));

        if (missingRequired.length || unknown.length) {
            const parts = [];
            if (missingRequired.length) {
                parts.push(`missing required column(s): ${missingRequired.map(h => ALLOWED_HEADERS[h]).join(", ")}`);
            }
            if (unknown.length) {
                parts.push(`unexpected column(s): ${unknown.join(", ")}`);
            }
            return fail(
                `Invalid columns — ${parts.join("; ")}. Expected exactly: empCode, name, department, collar, designation, mobile (designation and mobile optional). Header casing does not matter.`,
                400
            );
        }

        const rows = [];
        const errors = [];

        for (let i = 0; i < rawRows.length; i++) {
            const r = normRow(rawRows[i]);
            const rowNum = i + 2;

            const empCode = pick(r, ["empcode"]);
            const name = pick(r, ["name"]);
            const department = pick(r, ["department"]);
            const collarRaw = pick(r, ["collar"]).toLowerCase().replace(/[^a-z_]/g, "");
            const collarType = COLLAR_MAP[collarRaw] || null;
            const designation = pick(r, ["designation"]);
            const mobile = pick(r, ["mobile"]);

            if (!empCode) { errors.push(`Row ${rowNum}: missing empCode`); continue; }
            if (!name) { errors.push(`Row ${rowNum}: missing name`); continue; }
            if (!department) { errors.push(`Row ${rowNum}: missing department`); continue; }
            if (!collarType) { errors.push(`Row ${rowNum}: missing or invalid collar type`); continue; }

            rows.push({ rowNum, empCode: String(empCode), name, department, collarType, designation, mobile });
        }

        if (rows.length === 0) return fail("No valid rows to process");

        // Validate collar consistency per department within this file
        const deptCollarMap = new Map();
        for (const r of rows) {
            const existing = deptCollarMap.get(r.department);
            if (existing && existing !== r.collarType) {
                return fail(`Department "${r.department}" has mixed collar types`, 400);
            }
            deptCollarMap.set(r.department, r.collarType);
        }

        // Pre-hash default passwords. EMPLOYEE → empCode (per spec).
        const hashes = new Map();
        for (const r of rows) {
            const plain = defaultPasswordFor({ role: "EMPLOYEE", empCode: r.empCode, name: r.name });
            hashes.set(r.empCode, await bcrypt.hash(plain, SALT_ROUNDS));
        }

        const result = await prisma.$transaction(async (tx) => {
            const deptMap = new Map();
            const deptsCreated = [];
            for (const [deptName, collarType] of deptCollarMap) {
                let dept = await tx.department.findFirst({ where: { name: deptName, branchId } });
                if (!dept) {
                    dept = await tx.department.create({ data: { name: deptName, branchId, collarType } });
                    deptsCreated.push(deptName);
                }
                deptMap.set(deptName, dept.id);
            }

            let createdCount = 0, updatedCount = 0;
            for (const r of rows) {
                const departmentId = deptMap.get(r.department);
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

            return { deptsCreated, employeesCreated: createdCount, employeesUpdated: updatedCount };
        });

        await prisma.auditLog.create({
            data: {
                userId: user.userId,
                action: "ADMIN_BRANCH_EMPLOYEE_BULK_UPLOAD",
                details: {
                    branchId, branchName: branch.name,
                    deptsCreated: result.deptsCreated.length,
                    employeesCreated: result.employeesCreated,
                    employeesUpdated: result.employeesUpdated,
                    errorCount: errors.length,
                },
            },
        }).catch(() => {});

        return ok({
            branch: { id: branch.id, name: branch.name },
            departmentsCreated: result.deptsCreated,
            employeesCreated: result.employeesCreated,
            employeesUpdated: result.employeesUpdated,
            errors,
        });
    } catch (err) {
        console.error("[ADMIN-BRANCH-BULK-UPLOAD] Error:", err.message);
        return serverError();
    }
});
