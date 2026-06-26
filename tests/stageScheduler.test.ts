import { describe, it, expect } from "vitest";
import { planReconcile, planAction } from "../lib/stageScheduler";

// Pure decision-logic tests for the Stage Scheduling engine — no DB. The
// persistence wrappers (reconcileQuarter / applyAction) are thin transactions
// over these planners and are exercised at runtime.

const REF = new Date("2026-07-15T12:00:00.000Z");
const PAST = new Date("2026-07-10T09:00:00.000Z").toISOString();
const PAST2 = new Date("2026-07-12T09:00:00.000Z").toISOString();
const FUTURE = new Date("2026-07-20T18:00:00.000Z").toISOString();

// Build a 5-stage snapshot; overrides keyed by stageNumber.
function stages(overrides: Record<number, any> = {}) {
    return [1, 2, 3, 4, 5].map((n) => ({
        id: `s${n}`,
        stageNumber: n,
        status: "SCHEDULED",
        scheduledStart: null,
        scheduledEnd: null,
        actualStart: null,
        actualEnd: null,
        completedAt: null,
        ...(overrides[n] || {}),
    }));
}

describe("planReconcile — automatic transitions", () => {
    it("opens a scheduled stage once its start time has passed", () => {
        const plan = planReconcile(stages({ 1: { scheduledStart: PAST, scheduledEnd: FUTURE } }), REF);
        expect(plan).toHaveLength(1);
        expect(plan[0]).toMatchObject({ stageNumber: 1, to: "ACTIVE", event: "AUTO_OPEN" });
        expect(plan[0].patch.actualStart).toEqual(REF);
    });

    it("closes an active stage once its end time has passed", () => {
        const plan = planReconcile(stages({ 1: { status: "ACTIVE", scheduledEnd: PAST } }), REF);
        expect(plan).toHaveLength(1);
        expect(plan[0]).toMatchObject({ stageNumber: 1, to: "COMPLETED", event: "AUTO_CLOSE" });
    });

    it("auto-advances: closing stage 1 opens stage 2 in the same pass", () => {
        const plan = planReconcile(stages({
            1: { status: "ACTIVE", scheduledEnd: PAST },
            2: { scheduledStart: PAST2, scheduledEnd: FUTURE },
        }), REF);
        const byStage = Object.fromEntries(plan.map((c) => [c.stageNumber, c]));
        expect(byStage[1].to).toBe("COMPLETED");
        expect(byStage[2].to).toBe("ACTIVE");
        expect(byStage[2].event).toBe("AUTO_OPEN");
    });

    it("never opens a second stage while an earlier one is still active", () => {
        const plan = planReconcile(stages({
            1: { status: "ACTIVE", scheduledEnd: FUTURE }, // still running, no end reached
            2: { scheduledStart: PAST2, scheduledEnd: FUTURE },
        }), REF);
        expect(plan).toHaveLength(0); // stage 2 stays SCHEDULED
    });

    it("leaves PAUSED and COMPLETED stages untouched", () => {
        const plan = planReconcile(stages({
            1: { status: "PAUSED", scheduledStart: PAST, scheduledEnd: FUTURE },
            2: { status: "COMPLETED", scheduledStart: PAST, scheduledEnd: PAST },
        }), REF);
        expect(plan).toHaveLength(0);
    });

    it("closes out a scheduled stage whose whole window already elapsed", () => {
        const plan = planReconcile(stages({ 1: { scheduledStart: PAST, scheduledEnd: PAST2 } }), REF);
        expect(plan[0]).toMatchObject({ stageNumber: 1, to: "COMPLETED", event: "AUTO_CLOSE" });
    });
});

describe("planAction — manual control", () => {
    it("START_NOW activates a scheduled stage and pauses any other active one", () => {
        const r = planAction(stages({ 3: { status: "ACTIVE" } }), "START_NOW", { stage: 1 }, REF);
        expect(r.ok).toBe(true);
        const byStage = Object.fromEntries(r.ops!.map((o: any) => [o.stageNumber, o]));
        expect(byStage[1].patch.status).toBe("ACTIVE");
        expect(byStage[3].patch.status).toBe("PAUSED"); // single-active enforced
    });

    it("PAUSE only works on the active stage", () => {
        expect(planAction(stages({ 2: { status: "ACTIVE" } }), "PAUSE", { stage: 2 }, REF).ok).toBe(true);
        expect(planAction(stages(), "PAUSE", { stage: 2 }, REF).ok).toBe(false);
    });

    it("RESUME a paused stage makes it the sole active one", () => {
        const r = planAction(stages({ 1: { status: "PAUSED" }, 2: { status: "ACTIVE" } }), "RESUME", { stage: 1 }, REF);
        expect(r.ok).toBe(true);
        const byStage = Object.fromEntries(r.ops!.map((o: any) => [o.stageNumber, o]));
        expect(byStage[1].patch.status).toBe("ACTIVE");
        expect(byStage[1].patch.resumedAt).toEqual(REF);
        expect(byStage[2].patch.status).toBe("PAUSED");
    });

    it("RESUME refuses a stage that is not paused", () => {
        expect(planAction(stages({ 1: { status: "ACTIVE" } }), "RESUME", { stage: 1 }, REF).ok).toBe(false);
    });

    it("COMPLETE marks a stage completed with closure stamps", () => {
        const r = planAction(stages({ 1: { status: "ACTIVE", actualStart: PAST } }), "COMPLETE", { stage: 1 }, REF);
        expect(r.ok).toBe(true);
        expect(r.ops![0].patch).toMatchObject({ status: "COMPLETED", actualEnd: REF, completedAt: REF });
    });

    it("MOVE_NEXT completes this stage and activates the next", () => {
        const r = planAction(stages({ 1: { status: "ACTIVE" } }), "MOVE_NEXT", { stage: 1 }, REF);
        expect(r.ok).toBe(true);
        const byStage = Object.fromEntries(r.ops!.map((o: any) => [o.stageNumber, o]));
        expect(byStage[1].patch.status).toBe("COMPLETED");
        expect(byStage[2].patch.status).toBe("ACTIVE");
    });

    it("MOVE_NEXT is rejected on the final stage", () => {
        expect(planAction(stages({ 5: { status: "ACTIVE" } }), "MOVE_NEXT", { stage: 5 }, REF).ok).toBe(false);
    });

    it("START_NOW reopens a completed stage, clearing its closure stamps", () => {
        const r = planAction(stages({ 1: { status: "COMPLETED", actualStart: PAST, actualEnd: PAST2, completedAt: PAST2 } }), "START_NOW", { stage: 1 }, REF);
        expect(r.ok).toBe(true);
        expect(r.ops![0].patch).toMatchObject({ status: "ACTIVE", actualEnd: null, completedAt: null });
    });

    it("SCHEDULE sets the window and validates ordering", () => {
        const ok = planAction(stages(), "SCHEDULE", { stage: 2, scheduledStart: PAST, scheduledEnd: FUTURE }, REF);
        expect(ok.ok).toBe(true);
        expect(ok.ops![0].noStatusChange).toBe(true);

        const bad = planAction(stages(), "SCHEDULE", { stage: 2, scheduledStart: FUTURE, scheduledEnd: PAST }, REF);
        expect(bad.ok).toBe(false);
        expect(bad.error).toMatch(/after the start/i);
    });

    it("rejects out-of-range stages and unknown actions", () => {
        expect(planAction(stages(), "PAUSE", { stage: 9 }, REF).ok).toBe(false);
        expect(planAction(stages(), "WIGGLE", { stage: 1 }, REF).ok).toBe(false);
    });
});
