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

describe("initialStageState", () => {
    it("opens Stage 1 and locks the rest", () => {
        expect(initialStageState()).toEqual({ unlockedStage: 1, activeStage: 1 });
    });
});

describe("stageAccepts", () => {
    it("is permissive when no state is recorded (pre-feature quarters)", () => {
        for (let n = 1; n <= 4; n++) expect(stageAccepts(null, n)).toBe(true);
    });

    it("accepts only the single active stage when state exists", () => {
        const state = { unlockedStage: 2, activeStage: 2 };
        expect(stageAccepts(state, 1)).toBe(false);
        expect(stageAccepts(state, 2)).toBe(true);
        expect(stageAccepts(state, 3)).toBe(false);
    });

    it("accepts nothing when no stage is active", () => {
        const state = { unlockedStage: 3, activeStage: 0 };
        for (let n = 1; n <= 4; n++) expect(stageAccepts(state, n)).toBe(false);
    });
});

describe("applyTransition — sequential happy path", () => {
    it("walks Stage 1 → 4 via pause/resume", () => {
        let s = initialStageState();

        let r = applyTransition(s, "PAUSE", 1);
        expect(r.ok).toBe(true);
        expect(r.state).toEqual({ unlockedStage: 2, activeStage: 0 });
        s = r.state!;

        r = applyTransition(s, "RESUME", 2);
        expect(r.ok).toBe(true);
        expect(r.state).toEqual({ unlockedStage: 2, activeStage: 2 });
        s = r.state!;

        r = applyTransition(s, "PAUSE", 2);
        expect(r.state).toEqual({ unlockedStage: 3, activeStage: 0 });
        s = r.state!;

        r = applyTransition(s, "RESUME", 3);
        expect(r.state).toEqual({ unlockedStage: 3, activeStage: 3 });
        s = r.state!;

        r = applyTransition(s, "PAUSE", 3);
        expect(r.state).toEqual({ unlockedStage: 4, activeStage: 0 });
        s = r.state!;

        r = applyTransition(s, "RESUME", 4);
        expect(r.state).toEqual({ unlockedStage: 4, activeStage: 4 });
        s = r.state!;

        // Pausing the last stage unlocks nothing beyond 4.
        r = applyTransition(s, "PAUSE", 4);
        expect(r.state).toEqual({ unlockedStage: 4, activeStage: 0 });
    });
});

describe("applyTransition — guards", () => {
    it("refuses to resume a locked (not-yet-unlocked) stage", () => {
        const r = applyTransition(initialStageState(), "RESUME", 3);
        expect(r.ok).toBe(false);
        expect(r.error).toMatch(/locked/i);
    });

    it("refuses to pause a stage that is not active", () => {
        const r = applyTransition({ unlockedStage: 2, activeStage: 0 }, "PAUSE", 2);
        expect(r.ok).toBe(false);
    });

    it("rejects out-of-range stages and unknown actions", () => {
        expect(applyTransition(initialStageState(), "PAUSE", 5).ok).toBe(false);
        expect(applyTransition(initialStageState(), "WIGGLE" as any, 1).ok).toBe(false);
    });
});

describe("applyTransition — resuming an earlier stage stops a later one", () => {
    it("makes the earlier stage the sole active one", () => {
        // Stage 3 is running; admin resumes Stage 1.
        const r = applyTransition({ unlockedStage: 3, activeStage: 3 }, "RESUME", 1);
        expect(r.ok).toBe(true);
        // unlockedStage is preserved (never decreases); only Stage 1 now accepts.
        expect(r.state).toEqual({ unlockedStage: 3, activeStage: 1 });
        expect(stageAccepts(r.state!, 3)).toBe(false);
        expect(stageAccepts(r.state!, 1)).toBe(true);
    });
});

describe("normalizeStageState", () => {
    it("clamps an active stage that exceeds the unlocked frontier", () => {
        expect(normalizeStageState({ unlockedStage: 1, activeStage: 4 }))
            .toEqual({ unlockedStage: 1, activeStage: 1 });
    });

    it("defaults garbage input to a safe Stage-1 frontier", () => {
        expect(normalizeStageState(undefined)).toEqual({ unlockedStage: 1, activeStage: 0 });
    });
});

describe("stageStatus", () => {
    it("labels active / paused / locked correctly", () => {
        const s = { unlockedStage: 2, activeStage: 2 };
        expect(stageStatus(s, 1)).toBe("PAUSED");
        expect(stageStatus(s, 2)).toBe("ACTIVE");
        expect(stageStatus(s, 3)).toBe("LOCKED");
    });
});
