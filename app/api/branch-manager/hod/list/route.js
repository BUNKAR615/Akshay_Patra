export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../../lib/prisma";
import { withRole } from "../../../../../lib/withRole";
import { ok, fail, serverError } from "../../../../../lib/api-response";
import { resolveScopeBranch } from "../../../../../lib/auth/resolveScopeBranch";

/**
 * GET /api/branch-manager/hod/list
 * BM lists all HOD assignments for their branch in the active quarter.
 */
export const GET = withRole(["BRANCH_MANAGER"], async (request, { user }) => {
    try {
        const { branchId } = await resolveScopeBranch(user);
        if (!branchId) return fail("Could not determine your branch");

        const quarter = await prisma.quarter.findFirst({ where: { status: "ACTIVE" } });
        if (!quarter) return fail("No active quarter");

        const assignments = await prisma.hodAssignment.findMany({
            where: { branchId, quarterId: quarter.id },
            include: {
                hod: { select: { id: true, name: true, empCode: true, designation: true } },
                department: { select: { id: true, name: true } },
            },
            orderBy: { department: { name: "asc" } }
        });

        return ok({ assignments, quarterId: quarter.id, branchId });
    } catch (err) {
        console.error("[HOD-LIST] Error:", err.message);
        return serverError();
    }
});
