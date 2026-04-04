export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../lib/prisma";
import bcrypt from "bcryptjs";
import { withRole } from "../../../../lib/withRole";
import { NextResponse } from "next/server";

// Only these two empCodes can add/remove employees
const HR_ALLOWED = ["1800349", "5100029"]; // Rishpal Kumar (ADMIN), Chetan Singh Bhati (HR_ADMIN)

/**
 * GET /api/admin/employees
 * Returns paginated, searchable employee list for the admin directory.
 * Includes evaluator role mappings so filtering by SUPERVISOR/BM/CM works.
 */
export const GET = withRole(["ADMIN"], async (request) => {
    try {
        const { searchParams } = new URL(request.url);
        const search = searchParams.get("search") ?? "";
        const department = searchParams.get("department") ?? "";
        const role = searchParams.get("role") ?? "";
        const page = parseInt(searchParams.get("page") ?? "1");
        const limit = 50;

        const where = {};
        const andConditions = [];

        if (search) {
            andConditions.push({
                OR: [
                    { name: { contains: search, mode: "insensitive" } },
                    { empCode: { contains: search, mode: "insensitive" } },
                    { designation: { contains: search, mode: "insensitive" } },
                ],
            });
        }

        const isEvalRole = role === "SUPERVISOR" || role === "BRANCH_MANAGER" || role === "CLUSTER_MANAGER";

        if (department && isEvalRole) {
            // Combined: find users who hold this specific role in this specific department
            andConditions.push({
                departmentRoles: { some: { role, department: { name: department } } },
            });
        } else if (department && role === "EVALUATOR") {
            andConditions.push({
                departmentRoles: { some: { department: { name: department } } },
            });
        } else if (department && role === "EMPLOYEE") {
            andConditions.push({ department: { name: department } });
            where.role = "EMPLOYEE";
            where.departmentRoles = { none: {} };
        } else {
            // Department only or role only
            if (department) {
                andConditions.push({
                    OR: [
                        { department: { name: department } },
                        { departmentRoles: { some: { department: { name: department } } } },
                    ],
                });
            }
            if (role === "EMPLOYEE") {
                where.role = "EMPLOYEE";
                where.departmentRoles = { none: {} };
            } else if (role === "ADMIN") {
                where.role = "ADMIN";
            } else if (role === "EVALUATOR") {
                where.departmentRoles = { some: {} };
            } else if (isEvalRole) {
                where.departmentRoles = { some: { role } };
            }
        }

        if (department && role === "ADMIN") {
            where.role = "ADMIN";
        }

        if (andConditions.length > 0) {
            where.AND = andConditions;
        }

        const [rawEmployees, total] = await Promise.all([
            prisma.user.findMany({
                where,
                select: {
                    id: true,
                    empCode: true,
                    name: true,
                    email: true,
                    role: true,
                    designation: true,
                    department: { select: { id: true, name: true } },
                    departmentRoles: {
                        select: {
                            role: true,
                            department: { select: { name: true } },
                        },
                    },
                },
                orderBy: [
                    { department: { name: "asc" } },
                    { name: "asc" },
                ],
                skip: (page - 1) * limit,
                take: limit,
            }),
            prisma.user.count({ where }),
        ]);

        const employees = rawEmployees.map((u) => {
            // Build effective roles list
            const roles = [];
            if (u.role === "ADMIN") roles.push("ADMIN");
            if (u.department) roles.push("EMPLOYEE");
            for (const dr of u.departmentRoles) {
                if (!roles.includes(dr.role)) roles.push(dr.role);
            }
            if (roles.length === 0) roles.push("EMPLOYEE");

            // Build evaluator info
            const evaluatorRoles = u.departmentRoles.map((dr) => ({
                role: dr.role,
                department: dr.department.name,
            }));

            return {
                id: u.id,
                empCode: u.empCode,
                name: u.name,
                email: u.email,
                role: u.role,
                roles,
                designation: u.designation || "—",
                department: u.department?.name || (u.departmentRoles.length > 0 ? u.departmentRoles[0].department.name : "—"),
                departmentObj: u.department || null,
                evaluatorRoles,
            };
        });

        // Fetch department stats and role stats
        const [departmentsData, roleStatsRaw, evaluatorStats] = await Promise.all([
            prisma.department.findMany({
                select: {
                    name: true,
                    _count: { select: { users: true } },
                },
                orderBy: { name: "asc" },
            }),
            prisma.user.groupBy({
                by: ["role"],
                _count: { id: true },
            }),
            prisma.departmentRoleMapping.groupBy({
                by: ["role"],
                _count: { userId: true },
            }),
        ]);

        const roleStats = {};
        for (const r of roleStatsRaw) {
            roleStats[r.role] = r._count.id;
        }
        // Add evaluator role counts from departmentRoleMapping
        let totalEvaluators = 0;
        for (const r of evaluatorStats) {
            roleStats[`MAPPED_${r.role}`] = r._count.userId;
            totalEvaluators += r._count.userId;
        }
        roleStats.EVALUATOR_TOTAL = totalEvaluators;

        // Count unique evaluators
        const uniqueEvaluators = await prisma.departmentRoleMapping.findMany({
            select: { userId: true },
            distinct: ["userId"],
        });
        roleStats.UNIQUE_EVALUATORS = uniqueEvaluators.length;

        return NextResponse.json({
            success: true,
            data: {
                employees,
                total,
                page,
                totalPages: Math.ceil(total / limit),
                departments: departmentsData.map((d) => d.name),
                departmentStats: departmentsData.map((d) => ({
                    name: d.name,
                    count: d._count.users,
                })),
                roleStats,
            },
        });
    } catch (err) {
        console.error("[ADMIN EMPLOYEES] Error:", err);
        return NextResponse.json(
            { success: false, message: "Server error" },
            { status: 500 }
        );
    }
});

/**
 * POST /api/admin/employees
 * Add a new employee. Only Rishpal Kumar and Chetan Singh Bhati can do this.
 */
export const POST = withRole(["ADMIN", "HR_ADMIN"], async (request, { user }) => {
    try {
        if (!HR_ALLOWED.includes(user.empCode)) {
            return NextResponse.json(
                { success: false, message: "You are not authorized to add employees" },
                { status: 403 }
            );
        }

        const body = await request.json();
        const { name, mobile, departmentName, joiningDate, reason, empCode, designation } = body;

        if (!name || !departmentName) {
            return NextResponse.json(
                { success: false, message: "Name and department are required" },
                { status: 400 }
            );
        }

        // Find department
        const dept = await prisma.department.findFirst({ where: { name: departmentName } });
        if (!dept) {
            return NextResponse.json(
                { success: false, message: `Department "${departmentName}" not found` },
                { status: 400 }
            );
        }

        // Check empCode uniqueness if provided
        if (empCode) {
            const existing = await prisma.user.findUnique({ where: { empCode } });
            if (existing) {
                return NextResponse.json(
                    { success: false, message: `Employee code "${empCode}" already exists` },
                    { status: 409 }
                );
            }
        }

        // Generate email from name
        const emailBase = name.toLowerCase().replace(/\s+/g, ".").replace(/[^a-z.]/g, "");
        const email = `${emailBase}.${Date.now()}@akshayapatra.org`;

        // Generate default password: FirstName_lastTwoDigitsOfEmpCode
        const firstName = name.split(" ")[0];
        const codeSuffix = empCode ? empCode.slice(-2) : String(Date.now()).slice(-2);
        const rawPassword = `${firstName}_${codeSuffix}`;
        const hashedPassword = await bcrypt.hash(rawPassword, 10);

        const newUser = await prisma.user.create({
            data: {
                empCode: empCode || null,
                name: name.toUpperCase(),
                email,
                password: hashedPassword,
                role: "EMPLOYEE",
                departmentId: dept.id,
                designation: designation || null,
                mobile: mobile || null,
            },
            select: {
                id: true, empCode: true, name: true, email: true,
                role: true, designation: true, mobile: true,
                department: { select: { name: true } },
            },
        });

        // Audit log
        await prisma.auditLog.create({
            data: {
                userId: user.userId,
                action: "EMPLOYEE_ADDED",
                details: {
                    newEmployeeId: newUser.id,
                    name: newUser.name,
                    department: departmentName,
                    joiningDate: joiningDate || null,
                    reason: reason || null,
                    addedBy: user.empCode,
                },
            },
        }).catch(() => {});

        return NextResponse.json({
            success: true,
            data: {
                employee: newUser,
                defaultPassword: rawPassword,
            },
        }, { status: 201 });
    } catch (err) {
        console.error("[ADD EMPLOYEE] Error:", err);
        return NextResponse.json(
            { success: false, message: "Server error" },
            { status: 500 }
        );
    }
});
