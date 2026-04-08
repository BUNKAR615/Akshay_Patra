export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../../lib/prisma";
import { withRole } from "../../../../../lib/withRole";
import { ok, fail, serverError } from "../../../../../lib/api-response";

/**
 * GET /api/branch-manager/hod/list
 * BM lists all HOD assignments for their branch in the active quarter.
 */
export const GET = withRole(["BRANCH_MANAGER", "ADMIN"], async (request, { user }) => {
    try {
        const bmUser = await prisma.user.findUnique({
            where: { id: user.userId },
            select: { department: { select: { branchId: true } } }
        });
        const branchId = user.role === "ADMIN" ? (new URL(request.url).searchParams.get("branchId") || bmUser?.department?.branchId) : bmUser?.department?.branchId;
        if (!branchId) return fail("Could not determine branch");

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
