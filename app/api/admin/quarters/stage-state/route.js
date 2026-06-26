export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../../lib/prisma";
import { withPermission } from "../../../../../lib/withPermission";
import { ok, fail, notFound, conflict, handleApiError } from "../../../../../lib/api-response";
import {
    reconcileQuarter,
    ensureStages,
    applyAction,
} from "../../../../../lib/stageScheduler";

/**
 * DEPRECATED — legacy pause/resume endpoint.
 *
 * The full stage scheduling engine now lives at /api/admin/quarters/stages.
 * This route is kept only for backward compatibility (older clients / links)
 * and DELEGATES to the same engine so it can never write divergent state.
 *
 *   GET  → { quarter, activeStage, enabled }
 *   POST → { action: "INIT"|"PAUSE"|"RESUME", stage }
 *          INIT   → initialise stage rows
 *          PAUSE  → pause the active stage
 *          RESUME → make `stage` the single active stage (START_NOW semantics)
 */

async function resolveDisplayQuarter() {
    let quarter = await prisma.quarter.findFirst({ where: { status: "ACTIVE" } });
    if (!quarter) quarter = await prisma.quarter.findFirst({ orderBy: { createdAt: "desc" } });
    return quarter;
}

export const GET = withPermission(["pipeline.view", "quarter.view"], async () => {
    try {
        const quarter = await resolveDisplayQuarter();
        if (!quarter) return ok({ quarter: null, activeStage: 0, enabled: false });

        const stages = quarter.status === "ACTIVE"
            ? await reconcileQuarter(quarter.id)
            : await prisma.quarterStage.findMany({ where: { quarterId: quarter.id }, orderBy: { stageNumber: "asc" } });
        const active = stages.find((s) => s.status === "ACTIVE");
        return ok({
            quarter: { id: quarter.id, name: quarter.name, status: quarter.status },
            activeStage: active ? active.stageNumber : 0,
            enabled: stages.length > 0,
        });
    } catch (err) {
        return handleApiError(err, "STAGE-STATE-GET");
    }
});

export const POST = withPermission("pipeline.edit", async (request, { user }) => {
    try {
        let body = {};
        try { body = await request.json(); } catch { /* empty body */ }

        const action = String(body.action || "").toUpperCase();
        const stage = Number(body.stage);

        const quarter = await prisma.quarter.findFirst({ where: { status: "ACTIVE" } });
        if (!quarter) return notFound("No active quarter. Start a quarter first.");

        if (action === "INIT") {
            await ensureStages(quarter.id, { actorId: user.userId });
            return ok({ message: "Stage scheduling is enabled. Use the Stage Scheduling panel to manage stages." });
        }

        if (!["PAUSE", "RESUME"].includes(action)) {
            return fail("action must be one of INIT, PAUSE, RESUME. For full control use /api/admin/quarters/stages.");
        }

        await ensureStages(quarter.id, { actorId: user.userId });
        // RESUME maps to START_NOW so it makes `stage` the single active stage.
        const result = await applyAction(quarter.id, action === "PAUSE" ? "PAUSE" : "START_NOW", { stage, actorId: user.userId });
        if (!result.ok) return conflict(result.error);
        return ok({ message: result.message });
    } catch (err) {
        return handleApiError(err, "STAGE-STATE-POST");
    }
});
