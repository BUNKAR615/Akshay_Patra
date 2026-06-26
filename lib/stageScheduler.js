// ════════════════════════════════════════════════════════════════════════
//  Stage Scheduling System — the workflow engine for the 5-stage evaluation.
//
//  Stages:
//    1 Self Assessment   (employees)        → /api/assessment/submit
//    2 BM / HOD           (BMs & HODs)       → /api/branch-manager|hod/evaluate
//    3 Cluster Manager    (CMs)              → /api/cluster-manager/evaluate
//    4 HR Evaluation      (HR)               → /api/hr/evaluate
//    5 Results / Winners  (display only)     → no submissions
//
//  STATUS MODEL (per QuarterStage row):
//    SCHEDULED → ACTIVE → COMPLETED, with PAUSED as a manual side-state.
//
//  AUTOMATION — "lazy reconcile on read":
//    There is no always-on process (serverless). Instead, every read of stage
//    state (admin dashboard, submission gating, the cron-friendly /reconcile
//    endpoint) calls reconcileQuarter(), which derives the effective status
//    from each stage's schedule + the current time and PERSISTS any transition:
//      · SCHEDULED  → ACTIVE     when now ≥ scheduledStart       (AUTO_OPEN)
//      · ACTIVE     → COMPLETED  when now ≥ scheduledEnd         (AUTO_CLOSE)
//      · the next stage auto-advances the moment the current one ends, IF its
//        own scheduledStart has already begun                   (AUTO_OPEN)
//    PAUSED and COMPLETED are sticky: the scheduler NEVER auto-resumes a paused
//    stage nor reopens a completed one — only the admin can.
//
//  INVARIANT: at most ONE stage is ACTIVE at a time. Activating a stage
//  (manually or by auto-advance) pauses whatever else was active. This is the
//  core guarantee that a later stage never accepts entries while an earlier one
//  is still running.
//
//  SAFETY: every status change runs inside a DB transaction and appends a
//  StageStatusHistory row (full audit trail). All comparisons use absolute
//  UTC instants (DateTime), so there are no timezone ambiguities.
//
//  SERVER-ONLY: imports prisma. Never import from a "use client" component.
// ════════════════════════════════════════════════════════════════════════

import prisma from "./prisma";
import { readStageState as readLegacyStageState } from "./stageControl";

export const TOTAL_STAGES = 5; //          all stages, including Results
export const SUBMISSION_STAGES = 4; //      stages that accept evaluations (1..4)

export const STATUS = Object.freeze({
    SCHEDULED: "SCHEDULED",
    ACTIVE: "ACTIVE",
    PAUSED: "PAUSED",
    COMPLETED: "COMPLETED",
});

// Display metadata (kept in sync with the client StageControlPanel).
export const STAGE_META = [
    { stage: 1, label: "Self Assessment", who: "Employees submit self-assessments", submission: true },
    { stage: 2, label: "BM / HOD Evaluation", who: "Branch Managers & HODs evaluate", submission: true },
    { stage: 3, label: "Cluster Manager", who: "Cluster Managers evaluate", submission: true },
    { stage: 4, label: "HR Evaluation", who: "HR completes the final round", submission: true },
    { stage: 5, label: "Results / Winners", who: "Final winners are published — no evaluation", submission: false },
];

export function stageMeta(stageNumber) {
    return STAGE_META.find((s) => s.stage === stageNumber) || null;
}

// ── small helpers ────────────────────────────────────────────────────────
function now() {
    return new Date();
}
function asDate(v) {
    if (!v) return null;
    const d = v instanceof Date ? v : new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
}
function isPast(date, ref) {
    const d = asDate(date);
    return !!d && ref.getTime() >= d.getTime();
}

// ════════════════════════════════════════════════════════════════════════
//  ensureStages — create the 5 stage rows for a quarter if they don't exist.
//
//  Brand-new quarters (started after this feature) seed Stage 1 = ACTIVE. For a
//  quarter that predates the feature we backfill from the legacy AuditLog stage
//  state so gating stays consistent across the upgrade: stages before the legacy
//  active stage become COMPLETED, the active one ACTIVE, the rest SCHEDULED.
//
//  Accepts an optional Prisma transaction client `tx` so it can be called
//  atomically from the quarter-start transaction. Idempotent.
// ════════════════════════════════════════════════════════════════════════
export async function ensureStages(quarterId, opts = {}) {
    if (!quarterId) return [];
    const db = opts.tx || prisma;
    const actorId = opts.actorId || null;

    const existing = await db.quarterStage.findMany({
        where: { quarterId },
        orderBy: { stageNumber: "asc" },
    });
    if (existing.length >= TOTAL_STAGES) return existing;
    if (existing.length > 0) {
        // Partial set (shouldn't happen) — create only the missing rows as SCHEDULED.
        const have = new Set(existing.map((s) => s.stageNumber));
        const created = [];
        for (let n = 1; n <= TOTAL_STAGES; n++) {
            if (have.has(n)) continue;
            created.push(await createStageRow(db, quarterId, n, STATUS.SCHEDULED, {}, actorId, "INIT"));
        }
        return [...existing, ...created].sort((a, b) => a.stageNumber - b.stageNumber);
    }

    // Decide which stage starts active. Default: Stage 1. For a pre-feature
    // quarter, read the legacy single-active stage so we don't reopen earlier work.
    let activeStage = Number(opts.activeStage) || 1;
    let seededFromLegacy = false;
    if (!opts.activeStage) {
        try {
            const legacy = await readLegacyStageState(quarterId);
            if (legacy && Number.isInteger(legacy.activeStage)) {
                activeStage = legacy.activeStage; // 0 = none active
                seededFromLegacy = true;
            }
        } catch { /* fail-open to Stage 1 */ }
    }

    const start = asDate(opts.quarterStart);
    const end = asDate(opts.quarterEnd);
    const ts = now();
    const rows = [];
    for (let n = 1; n <= TOTAL_STAGES; n++) {
        let status = STATUS.SCHEDULED;
        const data = {};
        if (seededFromLegacy) {
            if (n < activeStage) { status = STATUS.COMPLETED; data.actualStart = ts; data.actualEnd = ts; data.completedAt = ts; }
            else if (n === activeStage) { status = STATUS.ACTIVE; data.actualStart = ts; }
        } else if (n === activeStage) {
            status = STATUS.ACTIVE;
            data.actualStart = ts;
        }
        // Seed Stage 1's scheduled window from the quarter dates as a sensible
        // default the admin can immediately edit. Other stages start unscheduled.
        if (n === 1 && start) data.scheduledStart = start;
        if (n === 1 && end) data.scheduledEnd = end;
        rows.push(await createStageRow(db, quarterId, n, status, data, actorId, "INIT"));
    }
    return rows;
}

async function createStageRow(db, quarterId, stageNumber, status, data, actorId, event) {
    const row = await db.quarterStage.create({
        data: { quarterId, stageNumber, status, ...data },
    });
    await db.stageStatusHistory.create({
        data: {
            stageId: row.id, quarterId, stageNumber,
            fromStatus: null, toStatus: status,
            event, trigger: "system", actorId,
        },
    });
    return row;
}

// ════════════════════════════════════════════════════════════════════════
//  planReconcile — PURE. Given the stage rows and a reference instant, decide
//  which automatic transitions should happen. Returns an array of
//  { stageId, stageNumber, from, to, patch, event } — empty when nothing
//  changes. No DB, no mutation: trivially unit-testable.
//
//  Processes stages in order 1..5 so an auto-close cascades into the next
//  stage's auto-open within a single pass, while never leaving two stages
//  ACTIVE at once (single-active invariant).
// ════════════════════════════════════════════════════════════════════════
export function planReconcile(stages, ref = now()) {
    const ordered = [...stages].sort((a, b) => a.stageNumber - b.stageNumber);
    const changes = [];
    let activeTaken = false;

    for (const s of ordered) {
        let status = s.status;
        const patch = {};

        if (status === STATUS.ACTIVE) {
            if (isPast(s.scheduledEnd, ref)) {
                status = STATUS.COMPLETED;
                patch.status = status;
                patch.actualEnd = ref;
                patch.completedAt = ref;
                changes.push({ stageId: s.id, stageNumber: s.stageNumber, from: s.status, to: status, patch, event: "AUTO_CLOSE" });
            }
        } else if (status === STATUS.SCHEDULED) {
            if (isPast(s.scheduledEnd, ref)) {
                // Entire window already elapsed — close it out.
                status = STATUS.COMPLETED;
                patch.status = status;
                if (!s.actualStart) patch.actualStart = ref;
                patch.actualEnd = ref;
                patch.completedAt = ref;
                changes.push({ stageId: s.id, stageNumber: s.stageNumber, from: s.status, to: status, patch, event: "AUTO_CLOSE" });
            } else if (!activeTaken && isPast(s.scheduledStart, ref)) {
                // Open it — but only if nothing earlier is still ACTIVE.
                status = STATUS.ACTIVE;
                patch.status = status;
                if (!s.actualStart) patch.actualStart = ref;
                changes.push({ stageId: s.id, stageNumber: s.stageNumber, from: s.status, to: status, patch, event: "AUTO_OPEN" });
            }
        }
        // PAUSED & COMPLETED are sticky — no automatic change.

        if (status === STATUS.ACTIVE) activeTaken = true;
    }
    return changes;
}

// ════════════════════════════════════════════════════════════════════════
//  reconcileQuarter — apply planReconcile() and persist any transitions inside
//  a transaction, each with its history row. Idempotent; safe on every read.
// ════════════════════════════════════════════════════════════════════════
export async function reconcileQuarter(quarterId, opts = {}) {
    if (!quarterId) return [];
    let stages = await prisma.quarterStage.findMany({
        where: { quarterId },
        orderBy: { stageNumber: "asc" },
    });
    if (stages.length === 0) {
        if (opts.ensure === false) return [];
        stages = await ensureStages(quarterId);
    }

    const changes = planReconcile(stages, now());
    if (changes.length === 0) return stages;

    await prisma.$transaction(async (tx) => {
        for (const c of changes) {
            await tx.quarterStage.update({ where: { id: c.stageId }, data: c.patch });
            await tx.stageStatusHistory.create({
                data: {
                    stageId: c.stageId, quarterId, stageNumber: c.stageNumber,
                    fromStatus: c.from, toStatus: c.to,
                    event: c.event, trigger: "auto", actorId: null,
                },
            });
        }
    });

    return prisma.quarterStage.findMany({
        where: { quarterId },
        orderBy: { stageNumber: "asc" },
    });
}

// ════════════════════════════════════════════════════════════════════════
//  Submission gating
// ════════════════════════════════════════════════════════════════════════

// Friendly, user-facing message for a stage that is NOT open. Never leaks
// technical detail (spec §10).
function gateMessage(stage, label) {
    const name = `Stage ${stage?.stageNumber || ""}${label ? ` (${label})` : ""}`.trim();
    switch (stage?.status) {
        case STATUS.PAUSED:
            return "This evaluation has been temporarily paused by the administrator. Please try again later.";
        case STATUS.COMPLETED:
            return "This evaluation has been completed.";
        case STATUS.SCHEDULED:
            return "This evaluation has not started yet.";
        default:
            return `${name} is not available at this time.`;
    }
}

/**
 * Gate a submission for `stageNum`. Reconciles first, then returns
 *   { open: boolean, status: StageStatus|null, message?: string }
 * Fail-OPEN: any DB hiccup, or a quarter that somehow has no stage rows,
 * returns open:true so a transient error never blocks a legitimate evaluation.
 */
export async function stageGate(quarterId, stageNum) {
    if (!quarterId) return { open: true, status: null };
    try {
        const stages = await reconcileQuarter(quarterId);
        if (!stages.length) return { open: true, status: null };
        const stage = stages.find((s) => s.stageNumber === stageNum);
        if (!stage) return { open: true, status: null };
        if (stage.status === STATUS.ACTIVE) return { open: true, status: STATUS.ACTIVE };
        const meta = stageMeta(stageNum);
        return { open: false, status: stage.status, message: gateMessage(stage, meta?.label) };
    } catch (err) {
        console.error("[STAGE-SCHEDULER] stageGate failed (fail-open):", err);
        return { open: true, status: null };
    }
}

// Back-compat boolean gate used by existing routes.
export async function isStageOpen(quarterId, stageNum) {
    const g = await stageGate(quarterId, stageNum);
    return g.open;
}

// ════════════════════════════════════════════════════════════════════════
//  Manual admin actions
// ════════════════════════════════════════════════════════════════════════

export const ACTIONS = ["START_NOW", "PAUSE", "RESUME", "COMPLETE", "MOVE_NEXT", "SCHEDULE"];

/**
 * planAction — PURE. Validate a manual action against the given stage rows and
 * return { ok, error?, ops?, message? } without touching the DB.
 *
 *  ops: [{ stageId, stageNumber, from, event, trigger, patch, noStatusChange? }]
 *
 *  action:
 *    SCHEDULE   — set scheduledStart / scheduledEnd (any status; metadata only)
 *    START_NOW  — force a stage ACTIVE now (reopens a completed stage)
 *    PAUSE      — pause the ACTIVE stage
 *    RESUME     — resume a PAUSED stage
 *    COMPLETE   — finish a stage early
 *    MOVE_NEXT  — complete this stage and activate the next one
 *
 *  Activating any stage pauses whatever else was ACTIVE (single-active rule).
 */
export function planAction(stages, action, opts = {}, ref = now()) {
    const stageNum = Number(opts.stage);
    const act = String(action || "").toUpperCase();

    if (!ACTIONS.includes(act)) return { ok: false, error: `Unknown action "${action}".` };
    if (!Number.isInteger(stageNum) || stageNum < 1 || stageNum > TOTAL_STAGES) {
        return { ok: false, error: `Stage must be an integer from 1 to ${TOTAL_STAGES}.` };
    }
    if (act === "MOVE_NEXT" && stageNum >= TOTAL_STAGES) {
        return { ok: false, error: "There is no stage after Stage 5." };
    }
    if (!stages.length) return { ok: false, error: "Stage control is not initialised for this quarter." };
    const target = stages.find((s) => s.stageNumber === stageNum);
    if (!target) return { ok: false, error: `Stage ${stageNum} not found.` };

    const ops = [];
    // Pause every other ACTIVE stage (single-active enforcement). Excludes any
    // stage numbers already receiving an op this pass (e.g. the stage being
    // completed in MOVE_NEXT), so a stage is never given two conflicting ops.
    const pauseOthers = (...except) => {
        const skip = new Set(except);
        for (const s of stages) {
            if (skip.has(s.stageNumber)) continue;
            if (s.status === STATUS.ACTIVE) {
                ops.push({ stageId: s.id, stageNumber: s.stageNumber, from: s.status, event: "PAUSE", trigger: "system", patch: { status: STATUS.PAUSED, pausedAt: ref } });
            }
        }
    };
    const activate = (s, event) => {
        const patch = { status: STATUS.ACTIVE };
        if (!s.actualStart) patch.actualStart = ref;
        if (s.status === STATUS.COMPLETED) { patch.actualEnd = null; patch.completedAt = null; }
        if (s.status === STATUS.PAUSED) patch.resumedAt = ref;
        ops.push({ stageId: s.id, stageNumber: s.stageNumber, from: s.status, event, trigger: "manual", patch });
    };

    switch (act) {
        case "SCHEDULE": {
            const patch = {};
            if (opts.scheduledStart !== undefined) patch.scheduledStart = opts.scheduledStart === null ? null : asDate(opts.scheduledStart);
            if (opts.scheduledEnd !== undefined) patch.scheduledEnd = opts.scheduledEnd === null ? null : asDate(opts.scheduledEnd);
            const effStart = "scheduledStart" in patch ? patch.scheduledStart : target.scheduledStart;
            const effEnd = "scheduledEnd" in patch ? patch.scheduledEnd : target.scheduledEnd;
            if (effStart && effEnd && asDate(effEnd).getTime() <= asDate(effStart).getTime()) {
                return { ok: false, error: "End date/time must be after the start date/time." };
            }
            if (Object.keys(patch).length === 0) return { ok: false, error: "No schedule changes provided." };
            ops.push({ stageId: target.id, stageNumber: target.stageNumber, from: target.status, event: "SCHEDULE_EDIT", trigger: "manual", patch, noStatusChange: true });
            break;
        }
        case "START_NOW": {
            if (target.status === STATUS.ACTIVE) return { ok: false, error: `Stage ${stageNum} is already active.` };
            pauseOthers(stageNum);
            activate(target, "START_NOW");
            break;
        }
        case "RESUME": {
            if (target.status !== STATUS.PAUSED) return { ok: false, error: `Stage ${stageNum} is not paused, so it cannot be resumed.` };
            pauseOthers(stageNum);
            activate(target, "RESUME");
            break;
        }
        case "PAUSE": {
            if (target.status !== STATUS.ACTIVE) return { ok: false, error: `Stage ${stageNum} is not active, so it cannot be paused.` };
            ops.push({ stageId: target.id, stageNumber: target.stageNumber, from: target.status, event: "PAUSE", trigger: "manual", patch: { status: STATUS.PAUSED, pausedAt: ref } });
            break;
        }
        case "COMPLETE": {
            if (target.status === STATUS.COMPLETED) return { ok: false, error: `Stage ${stageNum} is already completed.` };
            ops.push({ stageId: target.id, stageNumber: target.stageNumber, from: target.status, event: "COMPLETE", trigger: "manual", patch: { status: STATUS.COMPLETED, actualEnd: ref, completedAt: ref, actualStart: target.actualStart || ref } });
            break;
        }
        case "MOVE_NEXT": {
            const next = stages.find((s) => s.stageNumber === stageNum + 1);
            if (!next) return { ok: false, error: `Stage ${stageNum + 1} not found.` };
            if (target.status !== STATUS.COMPLETED) {
                ops.push({ stageId: target.id, stageNumber: target.stageNumber, from: target.status, event: "MOVE_NEXT", trigger: "manual", patch: { status: STATUS.COMPLETED, actualEnd: ref, completedAt: ref, actualStart: target.actualStart || ref } });
            }
            // Exclude both the stage we just completed and the one we're opening.
            pauseOthers(stageNum, stageNum + 1);
            activate(next, "MOVE_NEXT");
            break;
        }
        default:
            return { ok: false, error: `Unsupported action "${act}".` };
    }

    if (ops.length === 0) return { ok: false, error: "Nothing to change." };
    return { ok: true, ops, message: actionMessage(act, stageNum) };
}

/**
 * Apply a manual admin action: reconcile, plan (pure), then persist the ops
 * inside a transaction with full history. Returns { ok, message?, error? }.
 */
export async function applyAction(quarterId, action, opts = {}) {
    const actorId = opts.actorId || null;

    // Work from a reconciled snapshot so manual actions act on current state.
    await reconcileQuarter(quarterId);
    const stages = await prisma.quarterStage.findMany({
        where: { quarterId },
        orderBy: { stageNumber: "asc" },
    });

    const plan = planAction(stages, action, opts, now());
    if (!plan.ok) return plan;

    await prisma.$transaction(async (tx) => {
        for (const op of plan.ops) {
            await tx.quarterStage.update({ where: { id: op.stageId }, data: op.patch });
            await tx.stageStatusHistory.create({
                data: {
                    stageId: op.stageId, quarterId, stageNumber: op.stageNumber,
                    fromStatus: op.from,
                    toStatus: op.noStatusChange ? op.from : op.patch.status,
                    event: op.event, trigger: op.trigger || "manual", actorId,
                    detail: op.noStatusChange ? { scheduledStart: op.patch.scheduledStart ?? undefined, scheduledEnd: op.patch.scheduledEnd ?? undefined } : undefined,
                },
            });
        }
    });

    return { ok: true, message: plan.message };
}

function actionMessage(act, stageNum) {
    switch (act) {
        case "SCHEDULE": return `Stage ${stageNum} schedule updated.`;
        case "START_NOW": return `Stage ${stageNum} started.`;
        case "PAUSE": return `Stage ${stageNum} paused.`;
        case "RESUME": return `Stage ${stageNum} resumed.`;
        case "COMPLETE": return `Stage ${stageNum} completed.`;
        case "MOVE_NEXT": return `Moved to Stage ${stageNum + 1}.`;
        default: return "Updated.";
    }
}
