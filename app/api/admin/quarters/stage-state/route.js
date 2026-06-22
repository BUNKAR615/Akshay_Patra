export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../../lib/prisma";
import { withPermission } from "../../../../../lib/withPermission";
import { ok, fail, notFound, conflict, handleApiError } from "../../../../../lib/api-response";
import {
    readStageState,
    writeStageState,
    applyTransition,
    initialStageState,
    normalizeStageState,
    TOTAL_STAGES,
} from "../../../../../lib/stageControl";

/**
 * Stage pause/resume control for the active evaluation quarter.
 *
 * GET  /api/admin/quarters/stage-state
 *   → { quarter: {id,name,status} | null, state: {unlockedStage,activeStage} | null, enabled }
 *     `state` is null when stage control has never been enabled for the quarter
 *     (a quarter that began before this feature). `enabled` mirrors that.
 *
 * POST /api/admin/quarters/stage-state   body: { action, stage }
 *   action: "INIT"   — enable control on an in-flight quarter (Stage 1 active)
 *           "PAUSE"  — pause the active stage `stage`, unlocking the next
 *           "RESUME" — make `stage` the single active stage
 */

async function resolveDisplayQuarter() {
    // Prefer the active quarter; fall back to the most recent for a read-only view.
    let quarter = await prisma.quarter.findFirst({ where: { status: "ACTIVE" } });
    if (!quarter) quarter = await prisma.quarter.findFirst({ orderBy: { createdAt: "desc" } });
    return quarter;
}

export const GET = withPermission(["pipeline.view", "quarter.view"], async () => {
    try {
        const quarter = await resolveDisplayQuarter();
        if (!quarter) return ok({ quarter: null, state: null, enabled: false });

        const state = await readStageState(quarter.id);
        return ok({
            quarter: { id: quarter.id, name: quarter.name, status: quarter.status },
            state: state ? normalizeStageState(state) : null,
            enabled: !!state,
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

        // Stage control only ever applies to the ACTIVE quarter.
        const quarter = await prisma.quarter.findFirst({ where: { status: "ACTIVE" } });
        if (!quarter) return notFound("No active quarter. Start a quarter first.");

        const current = await readStageState(quarter.id);

        // INIT — enable sequential control on a quarter that doesn't have it yet
        // (e.g. one that began before this feature). New quarters get this
        // automatically at start, so this is only for the opt-in case.
        if (action === "INIT") {
            if (current) return conflict("Stage control is already enabled for this quarter.");
            const saved = await writeStageState(quarter.id, user.userId, initialStageState(), { event: "INIT" });
            return ok({
                quarter: { id: quarter.id, name: quarter.name, status: quarter.status },
                state: saved,
                enabled: true,
                message: "Stage control enabled. Stage 1 is now active.",
            });
        }

        if (!["PAUSE", "RESUME"].includes(action)) {
            return fail("action must be one of INIT, PAUSE, RESUME.");
        }
        if (!Number.isInteger(stage) || stage < 1 || stage > TOTAL_STAGES) {
            return fail(`stage must be an integer from 1 to ${TOTAL_STAGES}.`);
        }
        if (!current) {
            return fail("Stage control is not enabled for this quarter yet. Enable it first.");
        }

        const result = applyTransition(current, action, stage);
        if (!result.ok) return conflict(result.error);

        const saved = await writeStageState(quarter.id, user.userId, result.state, { event: action, stage });

        return ok({
            quarter: { id: quarter.id, name: quarter.name, status: quarter.status },
            state: saved,
            enabled: true,
            message: `${action === "PAUSE" ? "Paused" : "Resumed"} Stage ${stage}.`,
        });
    } catch (err) {
        return handleApiError(err, "STAGE-STATE-POST");
    }
});
