export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../../lib/prisma";
import { withRole } from "../../../../../lib/withRole";
import { ok, serverError } from "../../../../../lib/api-response";
import { getClientIp } from "../../../../../lib/http";

/**
 * POST /api/admin/maintenance/prune-blacklist
 *
 * Deletes BlacklistedToken rows whose expiresAt is in the past.
 * Safe to run manually or from a Vercel Cron. Admin-only.
 */
export const POST = withRole(["ADMIN"], async (request, { user }) => {
    try {
        const result = await prisma.blacklistedToken.deleteMany({
            where: { expiresAt: { lt: new Date() } },
        });

        await prisma.auditLog.create({
            data: {
                userId: user.userId,
                action: "PRUNE_BLACKLIST",
                ipAddress: getClientIp(request),
                details: { deleted: result.count },
            },
        }).catch(() => {});

        return ok({ deleted: result.count });
    } catch (err) {
        console.error("[PRUNE_BLACKLIST] Error:", err?.code, err?.message);
        return serverError();
    }
});
