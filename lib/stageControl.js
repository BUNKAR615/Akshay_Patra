// Sequential stage pause/resume control for an evaluation quarter.
//
// The four evaluation stages run strictly one-at-a-time:
//   Stage 1 — Self Assessment      (employees)          → /api/assessment/submit
//   Stage 2 — BM / HOD Evaluation  (BMs & HODs)         → /api/branch-manager|hod/evaluate
//   Stage 3 — Cluster Manager      (CMs)                → /api/cluster-manager/evaluate
//   Stage 4 — HR Evaluation        (HR)                 → /api/hr/evaluate
//
// State is persisted as AuditLog rows (action = QUARTER_STAGE_STATE) so the
// feature needs NO schema migration — it behaves identically on a fresh local
// DB and on Vercel/Neon the moment the code deploys, with zero risk of a
// column-vs-client mismatch. The most-recent row for a quarter is the live
// state. Shape stored in AuditLog.details:
//
//   { quarterId, unlockedStage: 1..4, activeStage: 0..4, event?, stage? }
//
//   unlockedStage — the furthest stage reached. Advances by exactly one when
//                   the current frontier stage is paused; never decreases. This
//                   gates how far the admin can jump (no skipping ahead).
//   activeStage   — the single stage currently ACCEPTING submissions, or 0 if
//                   none. At most one stage is ever active, which enforces
//                   "a later stage cannot run while an earlier one is active"
//                   and "resuming an earlier stage stops a later one".
//
// NOTE: this module imports prisma and is SERVER-ONLY. Do not import it from a
// "use client" component — the small amount of pure UI logic it would need
// (per-stage status, labels) is mirrored locally in StageControlPanel.jsx.

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

// Clamp + sanitise a raw object into a valid { unlockedStage, activeStage }.
export function normalizeStageState(raw) {
    let unlockedStage = toInt(raw?.unlockedStage, 1);
    let activeStage = toInt(raw?.activeStage, 0);
    if (unlockedStage < 1) unlockedStage = 1;
    if (unlockedStage > TOTAL_STAGES) unlockedStage = TOTAL_STAGES;
    if (activeStage < 0) activeStage = 0;
    if (activeStage > TOTAL_STAGES) activeStage = TOTAL_STAGES;
    // The active stage can never be beyond what's been unlocked.
    if (activeStage > unlockedStage) activeStage = unlockedStage;
    return { unlockedStage, activeStage };
}

// The state a brand-new quarter starts in: Stage 1 open, Stages 2-4 locked.
export function initialStageState() {
    return { unlockedStage: 1, activeStage: 1 };
}

// Read the live stage state for a quarter, or null if none was ever recorded
// (e.g. a quarter that began before this feature shipped). Reads are
// FAIL-OPEN: any DB hiccup returns null, so submission gating never blocks a
// legitimate evaluation because of a transient read error.
//
// State rows are tiny and few (~a handful per quarter); the active quarter's
// rows are always the newest, so scanning the most-recent slice by the indexed
// `action` column and matching quarterId in JS is both correct and portable
// (no reliance on JSON-path query semantics).
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
// { ok, state?, error? } and never mutates the input.
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
        return {
            ok: true,
            state: {
                // Pausing the frontier unlocks the next stage (capped at the last).
                unlockedStage: Math.max(cur.unlockedStage, Math.min(n + 1, TOTAL_STAGES)),
                activeStage: 0,
            },
        };
    }

    if (action === "RESUME") {
        if (n > cur.unlockedStage) {
            return { ok: false, error: `Stage ${n} is locked. Pause Stage ${n - 1} first.` };
        }
        if (cur.activeStage === n) {
            return { ok: false, error: `Stage ${n} is already active.` };
        }
        // Single-active rule: activating this stage deactivates whatever else
        // was running, so resuming an earlier stage stops a later one from
        // accepting. unlockedStage is left untouched (it never decreases).
        return { ok: true, state: { unlockedStage: cur.unlockedStage, activeStage: n } };
    }

    return { ok: false, error: `Unknown action "${action}".` };
}

// Per-stage status for the UI: "ACTIVE" | "PAUSED" | "LOCKED".
export function stageStatus(state, stageNum) {
    const cur = normalizeStageState(state);
    if (cur.activeStage === stageNum) return "ACTIVE";
    if (stageNum <= cur.unlockedStage) return "PAUSED";
    return "LOCKED";
}
