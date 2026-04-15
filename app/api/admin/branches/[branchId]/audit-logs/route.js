export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../../../lib/prisma";
import { withRole } from "../../../../../../lib/withRole";
import { ok, serverError, notFound } from "../../../../../../lib/api-response";
import { requireBranchScope } from "../../../../../../lib/auth/requireBranchScope";

/**
 * GET /api/admin/branches/[branchId]/audit-logs
 * Returns audit logs authored by users belonging to the given branch,
 * plus any ADMIN-authored log whose details.branchId matches.
 *
 * Query params:
 *   ?limit=100 (default 100, max 500)
 *   ?action=FOO
 */
export const GET = withRole(["ADMIN"], async (request, { params, user }) => {
    try {
        const { branchId, error } = requireBranchScope(user, params);
        if (error) return error;

        const branch = await prisma.branch.findUnique({ where: { id: branchId } });
        if (!branch) return notFound("Branch not found");

        const { searchParams } = new URL(request.url);
        const limitRaw = parseInt(searchParams.get("limit") || "100", 10);
        const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 100, 1), 500);
        const action = searchParams.get("action");

        // 1. Users who belong to this branch (either directly or via department)
        const branchUsers = await prisma.user.findMany({
            where: { OR: [{ branchId }, { department: { branchId } }] },
            select: { id: true },
        });
        const userIds = branchUsers.map((u) => u.id);

        // 2. Fetch logs by those users, OR admin logs whose details.branchId === this branch
        const where = {
            OR: [
                { userId: { in: userIds } },
                { details: { path: ["branchId"], equals: branchId } },
            ],
        };
        if (action) where.action = action;

        const logs = await prisma.auditLog.findMany({
            where,
            include: {
                user: { select: { id: true, empCode: true, name: true, role: true } },
            },
            orderBy: { createdAt: "desc" },
            take: limit,
        });

        return ok({ logs, count: logs.length });
    } catch (err) {
        console.error("[BRANCH-AUDIT] Error:", err.message);
        return serverError();
    }
});
