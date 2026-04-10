export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../../lib/prisma";
import bcrypt from "bcryptjs";
import { withRole } from "../../../../../lib/withRole";
import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

const HR_ALLOWED = ["1800349", "5100029"];

/**
 * POST /api/admin/employees/bulk-upload
 * Accepts a multipart form upload with an Excel file. Each row creates an employee.
 * Expected columns (case-insensitive, flexible order):
 *   - empCode / "Emp Code" / "Employee Code"
 *   - name / "Name" / "Full Name"
 *   - department / "Department"
 *   - branch / "Branch" (optional — used to disambiguate if dept name exists in multiple branches)
 *   - designation / "Designation" (optional)
 *   - mobile / "Mobile" (optional)
 *   - collar / "Collar Type" — WHITE_COLLAR | BLUE_COLLAR (optional)
 */
export const POST = withRole(["ADMIN"], async (request, { user }) => {
    try {
        if (!HR_ALLOWED.includes(user.empCode)) {
            return NextResponse.json(
                { success: false, message: "You are not authorized to bulk upload employees" },
                { status: 403 }
            );
        }

        const formData = await request.formData();
        const file = formData.get("file");
        if (!file) {
            return NextResponse.json({ success: false, message: "No file uploaded" }, { status: 400 });
        }

        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: "array" });
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) {
            return NextResponse.json({ success: false, message: "Excel file has no sheets" }, { status: 400 });
        }
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

        if (!Array.isArray(rows) || rows.length === 0) {
            return NextResponse.json({ success: false, message: "Excel file has no data rows" }, { status: 400 });
        }

        // Normalize column keys for each row
        const normRow = (row) => {
            const out = {};
            for (const [k, v] of Object.entries(row)) {
                out[String(k).trim().toLowerCase().replace(/[^a-z0-9]/g, "")] = typeof v === "string" ? v.trim() : v;
            }
            return out;
        };

        const pick = (row, keys) => {
            for (const k of keys) {
                if (row[k] !== undefined && row[k] !== "") return row[k];
            }
            return "";
        };

        // Preload all departments (with branch) to resolve department names
        const allDepts = await prisma.department.findMany({
            select: { id: true, name: true, collarType: true, branch: { select: { id: true, name: true } } },
        });

        const results = { created: [], failed: [], skipped: [] };

        for (let i = 0; i < rows.length; i++) {
            const raw = rows[i];
            const r = normRow(raw);
            const rowNum = i + 2; // account for header row

            try {
                const empCode = String(pick(r, ["empcode", "employeecode", "code"]) || "").trim();
                const name = String(pick(r, ["name", "fullname", "employeename"]) || "").trim();
                const deptName = String(pick(r, ["department", "dept", "departmentname"]) || "").trim();
                const branchName = String(pick(r, ["branch", "branchname"]) || "").trim();
                const designation = String(pick(r, ["designation", "title", "role"]) || "").trim();
                const mobile = String(pick(r, ["mobile", "phone", "contact"]) || "").trim();
                const collarRaw = String(pick(r, ["collar", "collartype"]) || "").trim().toUpperCase();
                let collarType = null;
                if (collarRaw.startsWith("WHITE")) collarType = "WHITE_COLLAR";
                else if (collarRaw.startsWith("BLUE")) collarType = "BLUE_COLLAR";

                if (!name || !deptName) {
                    results.failed.push({ row: rowNum, reason: "Missing name or department", data: raw });
                    continue;
                }

                // Resolve department — prefer exact name+branch match
                let dept;
                if (branchName) {
                    dept = allDepts.find(
                        d => d.name.toLowerCase() === deptName.toLowerCase() &&
                             d.branch.name.toLowerCase() === branchName.toLowerCase()
                    );
                } else {
                    const matches = allDepts.filter(d => d.name.toLowerCase() === deptName.toLowerCase());
                    if (matches.length > 1) {
                        results.failed.push({ row: rowNum, reason: `Department "${deptName}" exists in multiple branches — please specify Branch column`, data: raw });
                        continue;
                    }
                    dept = matches[0];
                }

                if (!dept) {
                    results.failed.push({ row: rowNum, reason: `Department "${deptName}"${branchName ? ` in branch "${branchName}"` : ""} not found`, data: raw });
                    continue;
                }

                // Skip if empCode already exists
                if (empCode) {
                    const existing = await prisma.user.findUnique({ where: { empCode } });
                    if (existing) {
                        results.skipped.push({ row: rowNum, reason: `Employee code "${empCode}" already exists`, name });
                        continue;
                    }
                }

                // Generate default password
                const firstName = name.split(/\s+/)[0] || "User";
                const codeSuffix = empCode ? empCode.slice(-2) : String(Date.now()).slice(-2);
                const rawPassword = `${firstName}_${codeSuffix}`;
                const hashedPassword = await bcrypt.hash(rawPassword, 10);

                const newUser = await prisma.user.create({
                    data: {
                        empCode: empCode || null,
                        name: name.toUpperCase(),
                        password: hashedPassword,
                        role: "EMPLOYEE",
                        departmentId: dept.id,
                        collarType: collarType || dept.collarType || null,
                        designation: designation || null,
                        mobile: mobile || null,
                    },
                    select: { id: true, empCode: true, name: true },
                });

                results.created.push({
                    row: rowNum,
                    id: newUser.id,
                    empCode: newUser.empCode,
                    name: newUser.name,
                    department: dept.name,
                    branch: dept.branch.name,
                    defaultPassword: rawPassword,
                });
            } catch (rowErr) {
                console.error(`[BULK UPLOAD] Row ${rowNum} error:`, rowErr.message);
                results.failed.push({ row: rowNum, reason: rowErr.message || "Unknown error", data: raw });
            }
        }

        // Audit log
        await prisma.auditLog.create({
            data: {
                userId: user.userId,
                action: "EMPLOYEE_BULK_UPLOAD",
                details: {
                    totalRows: rows.length,
                    created: results.created.length,
                    failed: results.failed.length,
                    skipped: results.skipped.length,
                    uploadedBy: user.empCode,
                },
            },
        }).catch(() => {});

        return NextResponse.json({
            success: true,
            data: {
                totalRows: rows.length,
                createdCount: results.created.length,
                failedCount: results.failed.length,
                skippedCount: results.skipped.length,
                created: results.created,
                failed: results.failed,
                skipped: results.skipped,
            },
        });
    } catch (err) {
        console.error("[BULK UPLOAD] Error:", err);
        return NextResponse.json(
            { success: false, message: err.message || "Server error" },
            { status: 500 }
        );
    }
}, { allowedEmpCodes: HR_ALLOWED });
