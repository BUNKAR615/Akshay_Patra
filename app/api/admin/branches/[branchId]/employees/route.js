export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../../../lib/prisma";
import { withRole } from "../../../../../../lib/withRole";
import { ok, serverError, notFound } from "../../../../../../lib/api-response";
import { requireBranchScope } from "../../../../../../lib/auth/requireBranchScope";

/**
 * GET /api/admin/branches/[branchId]/employees
 * Returns all users belonging to a branch (employees + branch staff).
 * Supports optional `role` query filter: EMPLOYEE | BRANCH_MANAGER | CLUSTER_MANAGER | HOD
 */
export const GET = withRole(["ADMIN"], async (request, { params, user }) => {
    try {
        const { branchId, error } = requireBranchScope(user, params);
        if (error) return error;

        const branch = await prisma.branch.findUnique({ where: { id: branchId } });
        if (!branch) return notFound("Branch not found");

        const { searchParams } = new URL(request.url);
        const roleFilter = searchParams.get("role");

        const where = {
            OR: [{ branchId }, { department: { branchId } }],
        };
        if (roleFilter) where.role = roleFilter;

        const users = await prisma.user.findMany({
            where,
            select: {
                id: true,
                empCode: true,
                name: true,
                mobile: true,
                designation: true,
                role: true,
                collarType: true,
                branchId: true,
                departmentId: true,
                department: { select: { id: true, name: true, collarType: true, branchId: true } },
                createdAt: true,
            },
            orderBy: [{ role: "asc" }, { name: "asc" }],
        });

        return ok({ employees: users, branch: { id: branch.id, name: branch.name, branchType: branch.branchType } });
    } catch (err) {
        console.error("[BRANCH-EMPLOYEES] Error:", err.message);
        return serverError();
    }
});
