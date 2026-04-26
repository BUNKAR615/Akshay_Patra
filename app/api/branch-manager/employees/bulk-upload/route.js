export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../../lib/prisma";
import bcrypt from "bcryptjs";
import { withRole } from "../../../../../lib/withRole";
import { ok, fail, serverError } from "../../../../../lib/api-response";
import { defaultPasswordFor } from "../../../../../lib/auth/defaultPassword";
import * as XLSX from "xlsx";

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

/**
 * POST /api/branch-manager/employees/bulk-upload
 *
 * BM-scoped employee-only upload. Locked to BM's own branch.
 * Upserts EMPLOYEE users; creates missing departments within the branch.
 * Never touches CM/BM/branch shape.
 */
export const POST = withRole(["ADMIN", "BRANCH_MANAGER"], async (request, { user }) => {
    try {
        const branchId = user.branchId;
        if (!branchId) return fail("No branch scope assigned", 403);

        const branch = await prisma.branch.findUnique({ where: { id: branchId } });
        if (!branch) return fail("Branch not found", 404);

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

        const rows = [];
        const errors = [];

        for (let i = 0; i < rawRows.length; i++) {
            const r = normRow(rawRows[i]);
            const rowNum = i + 2;

            const empCode = pick(r, ["empcode", "employeecode", "empid", "code"]);
            const name = pick(r, ["name", "fullname", "employeename"]);
            const department = pick(r, ["department", "dept", "departmentname"]);
            const collarRaw = pick(r, ["collar", "collartype"]).toLowerCase().replace(/[^a-z_]/g, "");
            const collarType = COLLAR_MAP[collarRaw] || null;
            const designation = pick(r, ["designation", "position", "title"]);
            const mobile = pick(r, ["mobile", "phone", "contact"]);

            if (!empCode) { errors.push(`Row ${rowNum}: missing empCode`); continue; }
            if (!name) { errors.push(`Row ${rowNum}: missing name`); continue; }
            if (!department) { errors.push(`Row ${rowNum}: missing department`); continue; }
            if (!collarType) { errors.push(`Row ${rowNum}: missing or invalid collar type`); continue; }

            rows.push({ rowNum, empCode: String(empCode), name, department, collarType, designation, mobile });
        }

        if (rows.length === 0) return fail("No valid rows to process");

        // Validate collar consistency
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
            // Upsert departments
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

            let created = 0, updated = 0;
            for (const r of rows) {
                const departmentId = deptMap.get(r.department);
                const existing = await tx.user.findUnique({ where: { empCode: r.empCode } });
                if (existing) {
                    await tx.user.update({
                        where: { empCode: r.empCode },
                        data: {
                            name: r.name, role: "EMPLOYEE", branchId, departmentId,
                            collarType: r.collarType, designation: r.designation || null, mobile: r.mobile || null,
                        },
                    });
                    updated++;
                } else {
                    await tx.user.create({
                        data: {
                            empCode: r.empCode, name: r.name, role: "EMPLOYEE",
                            password: hashes.get(r.empCode),
                            branchId, departmentId, collarType: r.collarType,
                            designation: r.designation || null, mobile: r.mobile || null,
                        },
                    });
                    created++;
                }
            }

            return { deptsCreated, employeesCreated: created, employeesUpdated: updated };
        });

        await prisma.auditLog.create({
            data: {
                userId: user.userId,
                action: "BM_EMPLOYEE_BULK_UPLOAD",
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
        console.error("[BM-BULK-UPLOAD] Error:", err.message);
        return serverError();
    }
});
