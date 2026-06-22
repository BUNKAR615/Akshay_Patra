export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../../lib/prisma";
import { withPermission } from "../../../../../lib/withPermission";
import { NextResponse } from "next/server";

/**
 * GET /api/admin/employees/history
 * Returns the role/department/branch change log written by PATCH
 * /api/admin/employees/[id].
 *
 * Optional filters:
 *   ?branchId — match either oldBranchId or newBranchId
 *   ?userId   — match the source user
 *   ?empCode  — match the snapshot empCode (still works for removed users)
 *   ?page=1, ?limit=50
 */
export const GET = withPermission("employees.view", async (request) => {
    try {
        const { searchParams } = new URL(request.url);
        const branchId = searchParams.get("branchId");
        const userId = searchParams.get("userId");
        const empCode = searchParams.get("empCode");
        const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
        const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));

        const where = {};
        if (branchId) {
            where.OR = [
                { oldBranchId: branchId },
                { newBranchId: branchId },
            ];
        }
        if (userId) where.userId = userId;
        if (empCode) where.empCode = empCode;

        const [history, total] = await Promise.all([
            prisma.employeeAssignmentHistory.findMany({
                where,
                orderBy: { changedAt: "desc" },
                skip: (page - 1) * limit,
                take: limit,
            }),
            prisma.employeeAssignmentHistory.count({ where }),
        ]);

        return NextResponse.json({
            success: true,
            data: { history, total, page, limit, totalPages: Math.ceil(total / limit) },
        });
    } catch (err) {
        console.error("[EMPLOYEE HISTORY] Error:", err);
        return NextResponse.json(
            { success: false, message: "Server error" },
            { status: 500 }
        );
    }
});
