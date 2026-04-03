export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../lib/prisma";
import { withRole } from "../../../../lib/withRole";
import { NextResponse } from "next/server";

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

        if (search) {
            where.OR = [
                { name: { contains: search, mode: "insensitive" } },
                { empCode: { contains: search, mode: "insensitive" } },
                { designation: { contains: search, mode: "insensitive" } },
            ];
        }

        // Role filtering: check both User.role AND departmentRoleMapping
        if (role === "EMPLOYEE") {
            // Only regular employees (no evaluator mappings, not ADMIN)
            where.role = "EMPLOYEE";
            where.departmentRoles = { none: {} };
        } else if (role === "ADMIN") {
            where.role = "ADMIN";
        } else if (role === "EVALUATOR") {
            // Any user who has at least one evaluator role mapping
            where.departmentRoles = { some: {} };
        } else if (role === "SUPERVISOR" || role === "BRANCH_MANAGER" || role === "CLUSTER_MANAGER") {
            where.departmentRoles = { some: { role } };
        }

        // Department filtering: match employee's department OR departments they evaluate
        if (department) {
            where.OR = [
                ...(where.OR || []),
                { department: { name: department } },
                { departmentRoles: { some: { department: { name: department } } } },
            ];
            // If we already had a search OR, merge them with AND
            if (search && department) {
                const searchOR = [
                    { name: { contains: search, mode: "insensitive" } },
                    { empCode: { contains: search, mode: "insensitive" } },
                    { designation: { contains: search, mode: "insensitive" } },
                ];
                delete where.OR;
                where.AND = [
                    { OR: searchOR },
                    { OR: [
                        { department: { name: department } },
                        { departmentRoles: { some: { department: { name: department } } } },
                    ]},
                ];
            }
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
                department: u.department?.name || "—",
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
