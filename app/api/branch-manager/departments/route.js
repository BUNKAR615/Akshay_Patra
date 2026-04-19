export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../lib/prisma";
import { withRole } from "../../../../lib/withRole";
import { ok, notFound, fail, serverError } from "../../../../lib/api-response";

/**
 * GET /api/branch-manager/departments
 * Branch-scoped bootstrap for the BM dashboard.
 * Returns the BM's branch, the active quarter, and every department in that
 * branch with employee counts. Evaluation shortlist data lives in
 * /api/branch-manager/shortlist.
 */
export const GET = withRole(["BRANCH_MANAGER"], async (request, { user }) => {
    try {
        const activeQuarter = await prisma.quarter.findFirst({
            where: { status: "ACTIVE" },
            select: { id: true, name: true, startDate: true, endDate: true, status: true },
        });
        if (!activeQuarter) return notFound("No active quarter found");

        const bmUser = await prisma.user.findUnique({
            where: { id: user.userId },
            select: {
                department: {
                    select: {
                        branchId: true,
                        branch: { select: { id: true, name: true, branchType: true, location: true } },
                    },
                },
            },
        });
        const branch = bmUser?.department?.branch;
        if (!branch) return fail("Branch not found for this Branch Manager");

        const [depts, empGroups] = await Promise.all([
            prisma.department.findMany({
                where: { branchId: branch.id },
                select: { id: true, name: true, collarType: true },
                orderBy: { name: "asc" },
            }),
            prisma.user.groupBy({
                by: ["departmentId"],
                where: { role: "EMPLOYEE", department: { branchId: branch.id } },
                _count: { _all: true },
            }),
        ]);

        const countByDept = new Map(empGroups.map((g) => [g.departmentId, g._count._all]));
        const departments = depts.map((d) => ({
            id: d.id,
            name: d.name,
            collarType: d.collarType,
            employeeCount: countByDept.get(d.id) || 0,
        }));

        return ok({
            quarter: activeQuarter,
            branch,
            departments,
        });
    } catch (err) {
        console.error("BM departments error:", err);
        return serverError();
    }
});
