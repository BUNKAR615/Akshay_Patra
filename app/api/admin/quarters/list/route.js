export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../../lib/prisma";
import { withRole } from "../../../../../lib/withRole";
import { ok, fail, serverError } from "../../../../../lib/api-response";
import { isTransientDbError } from "../../../../../lib/http";

/**
 * GET /api/admin/quarters/list
 *
 * Returns every quarter ever created, newest first, for the admin dashboard's
 * quarter selector. `status === "CLOSED"` means the quarter is archived and
 * should be presented read-only on the client.
 */
export const GET = withRole(["ADMIN"], async () => {
    try {
        const quarters = await prisma.quarter.findMany({
            orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
            select: {
                id: true,
                name: true,
                status: true,
                startDate: true,
                endDate: true,
                questionCount: true,
            },
        });

        const activeQuarter = quarters.find((q) => q.status === "ACTIVE") || null;

        return ok({
            quarters,
            activeQuarterId: activeQuarter?.id || null,
        });
    } catch (err) {
        console.error("[QUARTERS-LIST] Error:", err.message);
        if (isTransientDbError(err)) {
            return fail("Service is starting up. Please try again in a moment.", 503);
        }
        return serverError();
    }
});
