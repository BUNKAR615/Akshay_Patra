import { z } from "zod";

// ── Auth ──
export const loginSchema = z.object({
    empCode: z.string().min(1, "Employee Code is required").regex(/^\d+$/, "Employee Code must contain only digits").transform((v) => v.trim()),
    password: z.string().min(1, "Password is required"),
});

export const selectRoleSchema = z.object({
    role: z.enum(["EMPLOYEE", "SUPERVISOR", "BRANCH_MANAGER", "CLUSTER_MANAGER", "ADMIN"], {
        errorMap: () => ({ message: "Invalid role selected" }),
    }),
});

// ── Admin: Quarters ──
export const startQuarterSchema = z.object({
    quarterName: z.string().min(1, "Quarter name is required (e.g. Q1-2025)"),
    dateRange: z.object({
        startDate: z.string().min(1, "Start date is required (ISO format)"),
        endDate: z.string().min(1, "End date is required (ISO format)"),
    }),
    questionCount: z
        .number()
        .int()
        .min(10, "Minimum 10 questions")
        .max(25, "Maximum 25 questions"),
});

// ── Admin: Questions ──
export const createQuestionSchema = z.object({
    text: z.string().min(5, "Question text must be at least 5 characters"),
    textHindi: z.string().default(""),
    category: z.enum(
        ["ATTENDANCE", "DISCIPLINE", "PRODUCTIVITY", "TEAMWORK", "INITIATIVE", "COMMUNICATION", "INTEGRITY"],
        { errorMap: () => ({ message: "Invalid category" }) }
    ),
    level: z.enum(
        ["SELF", "SUPERVISOR", "BRANCH_MANAGER", "CLUSTER_MANAGER"],
        { errorMap: () => ({ message: "Invalid level" }) }
    ),
});

export const updateQuestionSchema = z.object({
    text: z.string().min(5, "Question text must be at least 5 characters").optional(),
    textHindi: z.string().optional(),
    category: z.enum(
        ["ATTENDANCE", "DISCIPLINE", "PRODUCTIVITY", "TEAMWORK", "INITIATIVE", "COMMUNICATION", "INTEGRITY"],
        { errorMap: () => ({ message: "Invalid category" }) }
    ).optional(),
    level: z.enum(
        ["SELF", "SUPERVISOR", "BRANCH_MANAGER", "CLUSTER_MANAGER"],
        { errorMap: () => ({ message: "Invalid level" }) }
    ).optional(),
    isActive: z.boolean().optional(),
});

// ── Answers: -2 to +2 scale ──
const answerItemSchema = z.object({
    questionId: z.string().min(1, "questionId is required"),
    score: z
        .number()
        .int("Score must be a whole number")
        .min(-2, "Score must be at least -2")
        .max(2, "Score must be at most +2"),
});

export const submitAssessmentSchema = z.object({
    answers: z
        .array(answerItemSchema)
        .min(1, "At least one answer is required"),
});

export const evaluateSchema = z.object({
    employeeId: z.string().min(1, "employeeId is required"),
    answers: z
        .array(answerItemSchema)
        .min(1, "At least one answer is required"),
});
