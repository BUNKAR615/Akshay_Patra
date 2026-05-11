import { describe, expect, it } from "vitest";
import { getQuarterCountdownState, splitDuration } from "../lib/quarterCountdown";

describe("splitDuration", () => {
    it("splits milliseconds into day, hour, minute, and second parts", () => {
        const ms = (((2 * 24 + 3) * 60 + 4) * 60 + 5) * 1000;
        expect(splitDuration(ms)).toEqual({ days: 2, hours: 3, minutes: 4, seconds: 5 });
    });

    it("clamps negative durations to zero", () => {
        expect(splitDuration(-1000)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0 });
    });
});

describe("getQuarterCountdownState", () => {
    const quarter = {
        name: "Q1-2026",
        status: "ACTIVE",
        startDate: "2026-05-11T00:00:00.000Z",
        endDate: "2026-05-12T01:02:03.000Z",
    };

    it("uses the configured endDate as the countdown target", () => {
        const state = getQuarterCountdownState(quarter, "2026-05-11T00:00:00.000Z");
        expect(state.visible).toBe(true);
        expect(state.expired).toBe(false);
        expect(state.parts).toEqual({ days: 1, hours: 1, minutes: 2, seconds: 3 });
    });

    it("marks an active quarter expired after the configured endDate", () => {
        const state = getQuarterCountdownState(quarter, "2026-05-12T01:02:04.000Z");
        expect(state.visible).toBe(true);
        expect(state.expired).toBe(true);
        expect(state.parts).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0 });
    });

    it("does not render a live timer for closed quarters", () => {
        const state = getQuarterCountdownState({ ...quarter, status: "CLOSED" }, "2026-05-11T00:00:00.000Z");
        expect(state.visible).toBe(false);
    });
});
