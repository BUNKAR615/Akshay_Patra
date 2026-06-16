import { describe, it, expect } from "vitest";
import {
    initialStageState,
    normalizeStageState,
    stageAccepts,
    applyTransition,
    stageStatus,
} from "../lib/stageControl";

// These cover the PURE state-machine logic only (no DB). readStageState /
// writeStageState are thin AuditLog wrappers exercised at runtime.
//
// Control model: "free, single-active" — any stage can be paused/resumed in
// any order; at most one stage is active (accepting submissions) at a time.

describe("initialStageState", () => {
    it("starts with Stage 1 active", () => {
        expect(initialStageState()).toEqual({ activeStage: 1 });
    });
});

describe("stageAccepts", () => {
    it("is permissive when no state is recorded (pre-feature quarters)", () => {
        for (let n = 1; n <= 4; n++) expect(stageAccepts(null, n)).toBe(true);
    });

    it("accepts only the single active stage when state exists", () => {
        const state = { activeStage: 2 };
        expect(stageAccepts(state, 1)).toBe(false);
        expect(stageAccepts(state, 2)).toBe(true);
        expect(stageAccepts(state, 3)).toBe(false);
    });

    it("accepts nothing when no stage is active", () => {
        const state = { activeStage: 0 };
        for (let n = 1; n <= 4; n++) expect(stageAccepts(state, n)).toBe(false);
    });
});

describe("applyTransition — pause / resume any stage in any order", () => {
    it("resumes a stage directly, even out of sequence", () => {
        // From Stage 1 active, jump straight to Stage 4 — no locking.
        const r = applyTransition({ activeStage: 1 }, "RESUME", 4);
        expect(r.ok).toBe(true);
        expect(r.state).toEqual({ activeStage: 4 });
    });

    it("pauses the active stage, leaving none active", () => {
        const r = applyTransition({ activeStage: 3 }, "PAUSE", 3);
        expect(r.ok).toBe(true);
        expect(r.state).toEqual({ activeStage: 0 });
    });

    it("walks Stage 1 → 4 via pause then resume", () => {
        let s: any = initialStageState();
        for (let n = 1; n <= 4; n++) {
            let r = applyTransition(s, "PAUSE", n);
            expect(r.ok).toBe(true);
            expect(r.state).toEqual({ activeStage: 0 });
            s = r.state;
            if (n < 4) {
                r = applyTransition(s, "RESUME", n + 1);
                expect(r.ok).toBe(true);
                expect(r.state).toEqual({ activeStage: n + 1 });
                s = r.state;
            }
        }
    });
});

describe("applyTransition — guards", () => {
    it("refuses to pause a stage that is not active", () => {
        expect(applyTransition({ activeStage: 0 }, "PAUSE", 2).ok).toBe(false);
        expect(applyTransition({ activeStage: 1 }, "PAUSE", 2).ok).toBe(false);
    });

    it("refuses to resume a stage that is already active", () => {
        const r = applyTransition({ activeStage: 2 }, "RESUME", 2);
        expect(r.ok).toBe(false);
        expect(r.error).toMatch(/already active/i);
    });

    it("rejects out-of-range stages and unknown actions", () => {
        expect(applyTransition(initialStageState(), "PAUSE", 5).ok).toBe(false);
        expect(applyTransition(initialStageState(), "WIGGLE" as any, 1).ok).toBe(false);
    });
});

describe("applyTransition — resuming an earlier stage stops a later one", () => {
    it("makes the earlier stage the sole active one", () => {
        // Stage 3 is running; admin resumes Stage 1.
        const r = applyTransition({ activeStage: 3 }, "RESUME", 1);
        expect(r.ok).toBe(true);
        expect(r.state).toEqual({ activeStage: 1 });
        expect(stageAccepts(r.state!, 3)).toBe(false);
        expect(stageAccepts(r.state!, 1)).toBe(true);
    });
});

describe("normalizeStageState", () => {
    it("clamps an out-of-range active stage", () => {
        expect(normalizeStageState({ activeStage: 9 })).toEqual({ activeStage: 4 });
        expect(normalizeStageState({ activeStage: -3 })).toEqual({ activeStage: 0 });
    });

    it("ignores the legacy unlockedStage field on stored rows", () => {
        expect(normalizeStageState({ unlockedStage: 2, activeStage: 3 })).toEqual({ activeStage: 3 });
    });

    it("defaults garbage input to no active stage", () => {
        expect(normalizeStageState(undefined)).toEqual({ activeStage: 0 });
    });
});

describe("stageStatus", () => {
    it("labels active / paused correctly (never locked)", () => {
        const s = { activeStage: 2 };
        expect(stageStatus(s, 1)).toBe("PAUSED");
        expect(stageStatus(s, 2)).toBe("ACTIVE");
        expect(stageStatus(s, 3)).toBe("PAUSED");
    });
});
