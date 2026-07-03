import { describe, it, expect } from "vitest";
import {
    normalizeScore,
    calculateBranchStage2Score,
    calculateBranchStage3Score,
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

describe("fixed stage weightage — independent of question count", () => {
    // The admin may configure any number of questions per stage; the total
    // stage weightage must not change. Each question automatically carries
    // stageWeight/questionCount marks.
    const COUNTS = [5, 8, 10, 12, 15, 20];

    it("identical per-question performance yields the same normalized score at any count", () => {
        for (const n of COUNTS) {
            expect(normalizeScore(2 * n, n)).toBe(100); // all "Strongly Agree" (+2)
            expect(normalizeScore(1 * n, n)).toBe(50);  // all "Agree" (+1)
            expect(normalizeScore(0, n)).toBe(0);       // all "Neutral" (0)
            expect(normalizeScore(-2 * n, n)).toBe(-100); // all "Strongly Disagree" (-2)
        }
    });

    it("Stage 2 total stays at its fixed 60/40 weightage for any question count", () => {
        for (const selfN of COUNTS) {
            for (const evalN of COUNTS) {
                const r = calculateBranchStage2Score(
                    normalizeScore(2 * selfN, selfN),
                    normalizeScore(2 * evalN, evalN)
                );
                expect(r.combined).toBe(100); // 60 + 40, regardless of counts
            }
        }
    });

    it("Stage 3 total stays at its fixed 40/30/30 weightage for any question count", () => {
        for (const n of COUNTS) {
            const full = normalizeScore(2 * n, n);
            const r = calculateBranchStage3Score(full, full, full);
            expect(r.combined).toBe(100); // 40 + 30 + 30, regardless of counts
        }
    });

    it("a single answered question is worth exactly stageWeight/questionCount marks", () => {
        // One "+2" answer among n questions (rest Neutral) → the self stage's
        // 60-mark Stage-2 share contributes 60/n marks.
        for (const n of COUNTS) {
            const selfNorm = normalizeScore(2, n); // one +2, rest 0
            const r = calculateBranchStage2Score(selfNorm, 0);
            expect(r.selfContribution).toBeCloseTo(60 / n, 1);
        }
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
