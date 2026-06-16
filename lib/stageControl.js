// Stage pause/resume control for an evaluation quarter.
//
// The four evaluation stages:
//   Stage 1 — Self Assessment      (employees)          → /api/assessment/submit
//   Stage 2 — BM / HOD Evaluation  (BMs & HODs)         → /api/branch-manager|hod/evaluate
//   Stage 3 — Cluster Manager      (CMs)                → /api/cluster-manager/evaluate
//   Stage 4 — HR Evaluation        (HR)                 → /api/hr/evaluate
//
// CONTROL MODEL — "free, single-active":
//   * Every stage can be paused or resumed at ANY time, in ANY order — there
//     are no locked stages, so all four Pause/Resume buttons always work.
//   * At most ONE stage is active (accepting submissions) at a time. Resuming
//     a stage makes it the sole active stage and pauses whatever was active;
//     pausing the active stage leaves none active. This preserves the core
//     guarantee that a later stage never accepts entries while an earlier one
//     is running, without forcing a rigid pause-then-unlock sequence.
//
// State is persisted as AuditLog rows (action = QUARTER_STAGE_STATE) so the
// feature needs NO schema migration. The most-recent row for a quarter is the
// live state. Shape stored in AuditLog.details:
//   { quarterId, activeStage: 0..4, event?, stage? }
//   activeStage — the single stage currently accepting submissions, or 0 if none.
//
// NOTE: this module imports prisma and is SERVER-ONLY. Do not import it from a
// "use client" component — the tiny per-stage status helper it would need is
// mirrored locally in StageControlPanel.jsx.

import prisma from "./prisma";

export const STAGE_STATE_ACTION = "QUARTER_STAGE_STATE";
export const TOTAL_STAGES = 4;

// Display metadata for the four stages (kept in sync with StageControlPanel).
export const STAGE_META = [
    { stage: 1, label: "Self Assessment", who: "Employees submit self-assessments" },
    { stage: 2, label: "BM / HOD Evaluation", who: "Branch Managers & HODs evaluate" },
    { stage: 3, label: "Cluster Manager", who: "Cluster Managers evaluate" },
    { stage: 4, label: "HR Evaluation", who: "HR completes the final round" },
];

function toInt(v, fallback) {
    const n = Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

// Clamp + sanitise a raw object into a valid { activeStage }. Older rows may
// carry an extra `unlockedStage` field from the previous sequential model — it
// is simply ignored here, so the change is backward-compatible with stored state.
export function normalizeStageState(raw) {
    let activeStage = toInt(raw?.activeStage, 0);
    if (activeStage < 0) activeStage = 0;
    if (activeStage > TOTAL_STAGES) activeStage = TOTAL_STAGES;
    return { activeStage };
}

// The state a brand-new quarter starts in: Stage 1 active.
export function initialStageState() {
    return { activeStage: 1 };
}

// Read the live stage state for a quarter, or null if none was ever recorded
// (e.g. a quarter that began before this feature shipped). Reads are
// FAIL-OPEN: any DB hiccup returns null, so submission gating never blocks a
// legitimate evaluation because of a transient read error.
export async function readStageState(quarterId) {
    if (!quarterId) return null;
    try {
        const rows = await prisma.auditLog.findMany({
            where: { action: STAGE_STATE_ACTION },
            orderBy: { createdAt: "desc" },
            take: 200,
            select: { details: true },
        });
        const row = rows.find((r) => r?.details && r.details.quarterId === quarterId);
        return row ? normalizeStageState(row.details) : null;
    } catch (err) {
        console.error("[STAGE-CONTROL] readStageState failed:", err);
        return null;
    }
}

// Persist a new stage state as an audit row. Returns the normalized state.
export async function writeStageState(quarterId, userId, state, extra = {}) {
    const norm = normalizeStageState(state);
    await prisma.auditLog.create({
        data: {
            userId,
            action: STAGE_STATE_ACTION,
            details: { quarterId, ...norm, ...extra },
        },
    });
    return norm;
}

// Does `stageNum` currently accept submissions?
//   - No recorded state (null) → permissive TRUE, so quarters that predate this
//     feature keep working untouched.
//   - Recorded state → only the single active stage accepts.
export function stageAccepts(state, stageNum) {
    if (!state) return true;
    return state.activeStage === stageNum;
}

// Convenience for API routes: read + predicate in one call (fail-open).
export async function isStageOpen(quarterId, stageNum) {
    const state = await readStageState(quarterId);
    return stageAccepts(state, stageNum);
}

// Apply a PAUSE / RESUME transition. PURE function — returns
// { ok, state?, error? } and never mutates the input. Any stage can be
// paused (when it is the active one) or resumed (always) — no locking.
export function applyTransition(state, action, stageNum) {
    const cur = normalizeStageState(state);
    const n = toInt(stageNum, 0);
    if (n < 1 || n > TOTAL_STAGES) {
        return { ok: false, error: `Invalid stage ${stageNum}.` };
    }

    if (action === "PAUSE") {
        if (cur.activeStage !== n) {
            return { ok: false, error: `Stage ${n} is not currently active, so it cannot be paused.` };
        }
        return { ok: true, state: { activeStage: 0 } };
    }

    if (action === "RESUME") {
        if (cur.activeStage === n) {
            return { ok: false, error: `Stage ${n} is already active.` };
        }
        // Single-active rule: activating this stage deactivates whatever else
        // was running, so only one stage ever accepts submissions at a time.
        return { ok: true, state: { activeStage: n } };
    }

    return { ok: false, error: `Unknown action "${action}".` };
}

// Per-stage status for the UI: "ACTIVE" | "PAUSED". (No stage is ever locked.)
export function stageStatus(state, stageNum) {
    const cur = normalizeStageState(state);
    return cur.activeStage === stageNum ? "ACTIVE" : "PAUSED";
}
