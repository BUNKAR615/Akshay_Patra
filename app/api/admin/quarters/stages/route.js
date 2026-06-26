export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../../lib/prisma";
import { withPermission } from "../../../../../lib/withPermission";
import { ok, fail, notFound, conflict, handleApiError } from "../../../../../lib/api-response";
import {
    reconcileQuarter,
    ensureStages,
    applyAction,
    STAGE_META,
    TOTAL_STAGES,
} from "../../../../../lib/stageScheduler";

/**
 * Stage Scheduling — admin management API.
 *
 * GET  /api/admin/quarters/stages
 *   → { quarter, enabled, activeStage, serverNow, stages: [...] }
 *     Reconciles the resolved quarter (auto open/close/advance) before
 *     returning, so the dashboard always shows the latest status.
 *
 * POST /api/admin/quarters/stages   body: { action, stage, scheduledStart?, scheduledEnd? }
 *   action ∈ START_NOW | PAUSE | RESUME | COMPLETE | MOVE_NEXT | SCHEDULE
 *   → the refreshed payload (same shape as GET).
 */

async function resolveQuarter() {
    let quarter = await prisma.quarter.findFirst({ where: { status: "ACTIVE" } });
    if (!quarter) quarter = await prisma.quarter.findFirst({ orderBy: { createdAt: "desc" } });
    return quarter;
}

// Per-stage response progress for the management cards (§12).
async function buildMetrics(quarterId) {
    const [
        totalEmployees,
        s1Submitted,
        s2Cohort, s2Bm, s2Hod,
        s3Cohort, s3Cm,
        s4Cohort, s4Hr,
        winners,
    ] = await Promise.all([
        prisma.user.count({ where: { role: "EMPLOYEE" } }),
        prisma.selfAssessment.count({ where: { quarterId } }),
        prisma.branchShortlistStage1.count({ where: { quarterId } }),
        prisma.branchManagerEvaluation.findMany({ where: { quarterId }, select: { employeeId: true }, distinct: ["employeeId"] }),
        prisma.hodEvaluation.findMany({ where: { quarterId }, select: { employeeId: true }, distinct: ["employeeId"] }),
        prisma.branchShortlistStage2.count({ where: { quarterId } }),
        prisma.clusterManagerEvaluation.findMany({ where: { quarterId }, select: { employeeId: true }, distinct: ["employeeId"] }),
        prisma.branchShortlistStage3.count({ where: { quarterId } }),
        prisma.hrEvaluation.findMany({ where: { quarterId }, select: { employeeId: true }, distinct: ["employeeId"] }),
        prisma.branchBestEmployee.count({ where: { quarterId } }),
    ]);

    const stage2Done = new Set([...s2Bm, ...s2Hod].map((r) => r.employeeId)).size;
    const stage3Done = new Set(s3Cm.map((r) => r.employeeId)).size;
    const stage4Done = new Set(s4Hr.map((r) => r.employeeId)).size;

    const pack = (submitted, total) => ({
        submitted,
        total,
        remaining: Math.max(total - submitted, 0),
        percentage: total > 0 ? Math.round((submitted / total) * 100) : 0,
    });

    return {
        1: pack(s1Submitted, totalEmployees),
        2: pack(stage2Done, s2Cohort),
        3: pack(stage3Done, s3Cohort),
        4: pack(stage4Done, s4Cohort),
        // Stage 5 is display-only: "done" = winners published.
        5: pack(winners, winners),
    };
}

function shape(quarter, stages, metrics) {
    const active = stages.find((s) => s.status === "ACTIVE");
    return {
        quarter: quarter ? { id: quarter.id, name: quarter.name, status: quarter.status } : null,
        enabled: stages.length > 0,
        activeStage: active ? active.stageNumber : 0,
        serverNow: new Date().toISOString(),
        stages: stages.map((s) => {
            const meta = STAGE_META.find((m) => m.stage === s.stageNumber) || {};
            return {
                stageNumber: s.stageNumber,
                label: meta.label || `Stage ${s.stageNumber}`,
                who: meta.who || "",
                submission: meta.submission !== false,
                status: s.status,
                scheduledStart: s.scheduledStart,
                scheduledEnd: s.scheduledEnd,
                actualStart: s.actualStart,
                actualEnd: s.actualEnd,
                pausedAt: s.pausedAt,
                resumedAt: s.resumedAt,
                completedAt: s.completedAt,
                metrics: metrics[s.stageNumber] || { submitted: 0, total: 0, remaining: 0, percentage: 0 },
            };
        }),
    };
}

export const GET = withPermission(["pipeline.view", "quarter.view"], async () => {
    try {
        const quarter = await resolveQuarter();
        if (!quarter) return ok({ quarter: null, enabled: false, activeStage: 0, serverNow: new Date().toISOString(), stages: [] });

        // Closed quarters are read-only — reconcile only for ACTIVE ones so we
        // never resurrect a stage on an archived quarter.
        let stages;
        if (quarter.status === "ACTIVE") {
            stages = await reconcileQuarter(quarter.id);
        } else {
            stages = await prisma.quarterStage.findMany({ where: { quarterId: quarter.id }, orderBy: { stageNumber: "asc" } });
        }
        const metrics = await buildMetrics(quarter.id);
        return ok(shape(quarter, stages, metrics));
    } catch (err) {
        return handleApiError(err, "STAGES-GET");
    }
});

export const POST = withPermission(["quarter.pause", "quarter.start"], async (request, { user }) => {
    try {
        let body = {};
        try { body = await request.json(); } catch { /* empty */ }

        const action = String(body.action || "").toUpperCase();
        const stage = Number(body.stage);

        const quarter = await prisma.quarter.findFirst({ where: { status: "ACTIVE" } });
        if (!quarter) return notFound("No active quarter to control. Start a quarter first.");

        if (!Number.isInteger(stage) || stage < 1 || stage > TOTAL_STAGES) {
            return fail(`stage must be an integer from 1 to ${TOTAL_STAGES}.`);
        }

        // Make sure the stage rows exist (covers pre-feature quarters).
        await ensureStages(quarter.id, { actorId: user.userId });

        const result = await applyAction(quarter.id, action, {
            stage,
            actorId: user.userId,
            scheduledStart: body.scheduledStart,
            scheduledEnd: body.scheduledEnd,
        });
        if (!result.ok) return conflict(result.error);

        const stages = await reconcileQuarter(quarter.id);
        const metrics = await buildMetrics(quarter.id);
        return ok({ ...shape(quarter, stages, metrics), message: result.message });
    } catch (err) {
        return handleApiError(err, "STAGES-POST");
    }
});
