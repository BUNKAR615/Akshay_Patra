export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../lib/prisma";
import { ok, forbidden, handleApiError } from "../../../../lib/api-response";
import { reconcileQuarter } from "../../../../lib/stageScheduler";

/**
 * GET /api/cron/reconcile-stages
 *
 * Cron-friendly backstop for the lazy-reconcile model. The effective stage
 * status is already recomputed on every read (dashboard polling, submission
 * gating), so this endpoint exists only to advance stages during fully-idle
 * periods when no one is looking. Idempotent and safe to call as often as you
 * like.
 *
 * Auth: this path is public in middleware (a cron has no session JWT). When
 * CRON_SECRET is set, the request must carry `Authorization: Bearer <secret>`
 * (Vercel Cron sends this automatically). When it is unset, the endpoint is
 * open — it only performs schedule-driven transitions, so there is nothing
 * sensitive to leak or damage.
 *
 * To enable it on Vercel, add to vercel.json (cadence per your plan):
 *   "crons": [{ "path": "/api/cron/reconcile-stages", "schedule": "0 * * * *" }]
 */
export async function GET(request) {
    try {
        const secret = process.env.CRON_SECRET;
        if (secret) {
            const auth = request.headers.get("authorization") || "";
            const provided = auth.replace(/^Bearer\s+/i, "");
            if (provided !== secret) return forbidden("Invalid cron secret.");
        }

        // Reconcile every ACTIVE quarter (normally just one).
        const active = await prisma.quarter.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true } });
        const results = [];
        for (const q of active) {
            try {
                const stages = await reconcileQuarter(q.id);
                const activeStage = stages.find((s) => s.status === "ACTIVE");
                results.push({ quarterId: q.id, name: q.name, activeStage: activeStage ? activeStage.stageNumber : 0 });
            } catch (e) {
                console.error(`[CRON-RECONCILE] quarter ${q.id} failed:`, e);
                results.push({ quarterId: q.id, name: q.name, error: true });
            }
        }
        return ok({ reconciled: results.length, results, at: new Date().toISOString() });
    } catch (err) {
        return handleApiError(err, "CRON-RECONCILE");
    }
}
