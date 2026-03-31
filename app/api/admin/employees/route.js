export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../lib/prisma";
import { withRole } from "../../../../lib/withRole";
import { NextResponse } from "next/server";

/**
 * GET /api/admin/employees
 * Returns paginated, searchable employee list for the admin directory.
 * Backward-compatible with the existing admin tab (flat department string).
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

        if (department) {
            where.department = { name: department };
        }

        if (role) {
            where.role = role;
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

        // Map employees to include BOTH a flat "department" string (for existing admin tab)
        // AND the full department object (for new standalone page)
        const employees = rawEmployees.map((u) => ({
            id: u.id,
            empCode: u.empCode,
            name: u.name,
            email: u.email,
            role: u.role,
            designation: u.designation || "—",
            department: u.department?.name || "—",         // flat string for backward compat
            departmentObj: u.department || null,            // object for new page
        }));

        // Fetch department stats and role stats in parallel
        const [departmentsData, roleStatsRaw] = await Promise.all([
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
        ]);

        const roleStats = {};
        for (const r of roleStatsRaw) {
            roleStats[r.role] = r._count.id;
        }

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
