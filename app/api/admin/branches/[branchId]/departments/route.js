export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../../../lib/prisma";
import { withRole } from "../../../../../../lib/withRole";
import { ok, serverError, notFound } from "../../../../../../lib/api-response";
import { requireBranchScope } from "../../../../../../lib/auth/requireBranchScope";

/**
 * GET /api/admin/branches/[branchId]/departments
 * Returns departments under a branch with per-department counts.
 */
export const GET = withRole(["ADMIN"], async (request, { params, user }) => {
    try {
        const { branchId, error } = requireBranchScope(user, params);
        if (error) return error;

        const branch = await prisma.branch.findUnique({ where: { id: branchId } });
        if (!branch) return notFound("Branch not found");

        const departments = await prisma.department.findMany({
            where: { branchId },
            include: {
                _count: { select: { users: true } },
            },
            orderBy: { name: "asc" },
        });

        const withCounts = departments.map((d) => ({
            id: d.id,
            name: d.name,
            collarType: d.collarType,
            branchId: d.branchId,
            employeeCount: d._count.users,
            createdAt: d.createdAt,
        }));

        return ok({ departments: withCounts, branch: { id: branch.id, name: branch.name, branchType: branch.branchType } });
    } catch (err) {
        console.error("[BRANCH-DEPARTMENTS] Error:", err.message);
        return serverError();
    }
});
