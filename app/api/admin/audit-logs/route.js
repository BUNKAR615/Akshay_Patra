export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../lib/prisma";
import { withRole } from "../../../../lib/withRole";
import { ok, serverError } from "../../../../lib/api-response";

/**
 * GET /api/admin/audit-logs
 * Supports filtering by action, userId, date range.
 * Query params: page, limit, action, userId, from, to
 */
export const GET = withRole(["ADMIN"], async (request) => {
    try {
        const { searchParams } = new URL(request.url);
        const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
        const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));
        const action = searchParams.get("action");
        const userId = searchParams.get("userId");
        const from = searchParams.get("from"); // ISO date string
        const to = searchParams.get("to");     // ISO date string

        const where = {};
        if (action) where.action = action;
        if (userId) where.userId = userId;

        if (from || to) {
            where.createdAt = {};
            if (from) where.createdAt.gte = new Date(from);
            if (to) where.createdAt.lte = new Date(to);
        }

        const [logs, total] = await Promise.all([
            prisma.auditLog.findMany({
                where,
                orderBy: { createdAt: "desc" },
                skip: (page - 1) * limit,
                take: limit,
                include: { user: { select: { id: true, name: true, role: true } } },
            }),
            prisma.auditLog.count({ where }),
        ]);

        // Get distinct actions for filter dropdown
        const actions = await prisma.auditLog.findMany({
            distinct: ["action"],
            select: { action: true },
            orderBy: { action: "asc" },
        });

        return ok({
            logs,
            actions: actions.map((a) => a.action),
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
    } catch (err) {
        console.error("Audit logs error:", err);
        return serverError();
    }
});
