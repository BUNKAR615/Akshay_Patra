import { describe, it, expect } from "vitest";
import { evaluateSchema, submitAssessmentSchema } from "../lib/validators";

const body = (score: number) => ({ employeeId: "e1", answers: [{ questionId: "q1", score }] });

describe("evaluateSchema (Stage 2 / Stage 3 evaluators) — 1..5 marks", () => {
    it("accepts 1, 2, 3, 4 and 5", () => {
        for (const k of [1, 2, 3, 4, 5]) {
            expect(evaluateSchema.safeParse(body(k)).success).toBe(true);
        }
    });

    it("rejects the old -2..0 values, 6 and non-integers", () => {
        for (const k of [-2, -1, 0, 6, 2.5]) {
            expect(evaluateSchema.safeParse(body(k)).success).toBe(false);
        }
    });
});

describe("submitAssessmentSchema (Stage 1 self) — unchanged -2..+2", () => {
    it("still accepts -2..+2 and rejects 3", () => {
        const one = (score: number) => ({ answers: [{ questionId: "q1", score }] });
        for (const k of [-2, -1, 0, 1, 2]) expect(submitAssessmentSchema.safeParse(one(k)).success).toBe(true);
        expect(submitAssessmentSchema.safeParse(one(3)).success).toBe(false);
    });
});
