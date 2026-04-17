import { describe, it, expect } from "vitest";
import {
    normalizeScore,
    calculateBranchStage2Score,
    calculateBranchFinalScore,
} from "../lib/scoreCalculator";

describe("normalizeScore", () => {
    it("returns 0 when there are no questions", () => {
        expect(normalizeScore(0, 0)).toBe(0);
    });

    it("maps a full-mark raw score (2 per question) to 100", () => {
        expect(normalizeScore(20, 10)).toBe(100);
    });

    it("rounds to two decimal places", () => {
        // 7 out of 20 max → 35.00
        expect(normalizeScore(7, 10)).toBe(35);
    });
});

describe("calculateBranchStage2Score (60 self / 40 evaluator)", () => {
    it("combines at full marks to 100", () => {
        const r = calculateBranchStage2Score(100, 100);
        expect(r.selfContribution).toBe(60);
        expect(r.evaluatorContribution).toBe(40);
        expect(r.combined).toBe(100);
    });

    it("applies 60/40 weights correctly", () => {
        const r = calculateBranchStage2Score(50, 80);
        // 50 * 0.6 = 30, 80 * 0.4 = 32, total 62
        expect(r.combined).toBe(62);
    });
});

describe("calculateBranchFinalScore (30/25/25/20)", () => {
    it("sums to 100 at full marks", () => {
        const r = calculateBranchFinalScore(100, 100, 100, 100);
        expect(r.finalScore).toBe(100);
    });

    it("respects the documented weights", () => {
        const r = calculateBranchFinalScore(100, 0, 0, 0);
        expect(r.finalScore).toBe(30);
        const r2 = calculateBranchFinalScore(0, 100, 0, 0);
        expect(r2.finalScore).toBe(25);
        const r3 = calculateBranchFinalScore(0, 0, 100, 0);
        expect(r3.finalScore).toBe(25);
        const r4 = calculateBranchFinalScore(0, 0, 0, 100);
        expect(r4.finalScore).toBe(20);
    });
});
