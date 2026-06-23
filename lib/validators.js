import { z } from "zod";

// ── Auth ──
export const loginSchema = z.object({
    empCode: z.string().min(1, "Employee Code is required").regex(/^\d+$/, "Employee Code must contain only digits").transform((v) => v.trim()),
    password: z.string().min(1, "Password is required"),
});

export const selectRoleSchema = z.object({
    // "OPERATOR" is a pseudo-role: a granted user choosing to open their named
    // admin "page role" (e.g. "HR Admin"). It maps to the user's base role + op
    // claim in /api/auth/select-role; it is never stored on User.role.
    role: z.enum(["EMPLOYEE", "HOD", "BRANCH_MANAGER", "CLUSTER_MANAGER", "HR", "COMMITTEE", "ADMIN", "OPERATOR"], {
        errorMap: () => ({ message: "Invalid role selected" }),
    }),
});

// ── Admin: reset an employee's password ──
export const resetPasswordSchema = z.object({
    newPassword: z
        .string()
        .min(8, "New password must be at least 8 characters")
        .max(128, "New password is too long"),
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
    bmQuestionCount: z.number().int().min(1).max(25).optional(),
    hodQuestionCount: z.number().int().min(1).max(25).optional(),
    cmQuestionCount: z.number().int().min(1).max(25).optional(),
    // AUTO: system picks a random, category-balanced set. MANUAL: use exactly
    // the admin-curated (includedInQuarter) questions. Defaults to AUTO.
    questionSelectionMode: z.enum(["AUTO", "MANUAL"]).optional(),
});

// ── Admin: Questions ──
// collarType targets the employee category a question applies to. The client
// sends "WHITE_COLLAR" / "BLUE_COLLAR", or "BOTH"/"" for a shared question
// (stored as null). preprocess maps the "both" forms to null but leaves an
// absent key as undefined, so PATCH/PUT calls that omit collarType don't wipe it.
const collarTypeField = z.preprocess(
    (v) => (v === "" || v === "BOTH" ? null : v),
    z.enum(["WHITE_COLLAR", "BLUE_COLLAR"], { errorMap: () => ({ message: "Invalid employee category" }) }).nullable()
).optional();

export const createQuestionSchema = z.object({
    text: z.string().min(5, "Question text must be at least 5 characters"),
    textHindi: z.string().default(""),
    // Category/topic is a removed legacy concept — optional and ignored by the
    // UI. Still accepted (and validated) if an old client sends it.
    category: z.enum(
        ["ATTENDANCE", "DISCIPLINE", "PRODUCTIVITY", "TEAMWORK", "INITIATIVE", "COMMUNICATION", "INTEGRITY"],
        { errorMap: () => ({ message: "Invalid category" }) }
    ).nullish(),
    level: z.enum(
        ["SELF", "HOD", "BRANCH_MANAGER", "CLUSTER_MANAGER", "HR"],
        { errorMap: () => ({ message: "Invalid level" }) }
    ),
    collarType: collarTypeField,
});

export const updateQuestionSchema = z.object({
    text: z.string().min(5, "Question text must be at least 5 characters").optional(),
    textHindi: z.string().optional(),
    category: z.enum(
        ["ATTENDANCE", "DISCIPLINE", "PRODUCTIVITY", "TEAMWORK", "INITIATIVE", "COMMUNICATION", "INTEGRITY"],
        { errorMap: () => ({ message: "Invalid category" }) }
    ).nullish(),
    level: z.enum(
        ["SELF", "HOD", "BRANCH_MANAGER", "CLUSTER_MANAGER", "HR"],
        { errorMap: () => ({ message: "Invalid level" }) }
    ).optional(),
    collarType: collarTypeField,
    isActive: z.boolean().optional(),
    includedInQuarter: z.boolean().optional(),
});

// ── Admin: Quarter ↔ Question membership ──
// Bulk add/remove questions from a specific quarter's locked set
// (QuarterQuestion). Used by the Questions page "Apply changes" flow.
export const quarterQuestionsUpdateSchema = z.object({
    add: z.array(z.string().min(1)).optional().default([]),
    remove: z.array(z.string().min(1)).optional().default([]),
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

// ── Branch Eval Config ──
export const branchEvalConfigSchema = z.object({
    branchId: z.string().min(1, "branchId is required"),
    quarterId: z.string().min(1, "quarterId is required"),
    stage1CutoffPct: z.number().min(0.1).max(1.0).default(0.5),
    stage2Limit: z.number().int().min(1).max(50).default(10),
    stage3Limit: z.number().int().min(1).max(25).default(5),
    stage4Limit: z.number().int().min(1).max(10).default(3),
});

// ── HOD Assignment (BM assigns HOD to department) ──
export const assignHodSchema = z.object({
    hodUserId: z.string().min(1, "hodUserId is required"),
    departmentId: z.string().min(1, "departmentId is required"),
});

// ── HR Evaluation ──
// `referenceSheetUrl` may be either:
//   * an absolute URL (http(s)://…) — when HR pasted an external link, OR
//   * a relative `/uploads/hr/reference/...` path — when HR uploaded a local
//     file via `/api/hr/upload` in a non-Vercel-Blob environment. Both forms
//     are produced by trusted, role-gated paths and stored as-is for display.
// The two UI inputs are kept independent on the client; on submit only one
// of them (link preferred over local file) is sent through this field.
// Accepts both the DB-backed file URL (/api/hr/file/<id>) returned by the
// current upload route and the legacy local /uploads/hr/<kind>/<file> path.
const HR_REF_LOCAL_PATH_RE = /^\/(uploads\/hr\/(reference|attendance|punctuality)|api\/hr\/file)\/[A-Za-z0-9._\-]+$/;
// Attendance / Punctuality PDFs (and the legacy reference sheet) share the same
// accepted shapes: empty, an absolute URL, or a trusted local /uploads path.
const hrFileUrl = z
    .union([
        z.string().length(0),
        z.string().url("File must be a valid URL"),
        z.string().regex(HR_REF_LOCAL_PATH_RE, "Invalid uploaded file path"),
    ])
    .optional();
// Same shapes but MANDATORY — must be a non-empty absolute URL or local path.
const hrFileUrlRequired = z.union([
    z.string().url("File must be a valid URL"),
    z.string().regex(HR_REF_LOCAL_PATH_RE, "Invalid uploaded file path"),
]);
export const hrEvaluateSchema = z.object({
    employeeId: z.string().min(1, "employeeId is required"),
    // Both percentages are derived on the client from day counts (present /
    // punctual / working) and re-validated here; the server bands them into marks.
    attendancePct: z.number().min(0, "Attendance % must be >= 0").max(100, "Attendance % must be <= 100"),
    punctualityPct: z.number().min(0, "Punctuality % must be >= 0").max(100, "Punctuality % must be <= 100"),
    // Raw day counts HR entered — persisted so they remain visible after submit.
    presentDays: z.number().int().min(0, "Present days must be >= 0"),
    punctualDays: z.number().int().min(0, "Punctual days must be >= 0"),
    workingDays: z.number().int().min(1, "Working days must be >= 1"),
    // Attendance & punctuality PDF proofs are mandatory.
    attendancePdfUrl: hrFileUrlRequired,
    punctualityPdfUrl: hrFileUrlRequired,
    referenceSheetUrl: hrFileUrl,
    notes: z.string().optional(),
});

// ── Collar Type Assignment ──
export const collarTypeSchema = z.object({
    userId: z.string().min(1, "userId is required"),
    collarType: z.enum(["WHITE_COLLAR", "BLUE_COLLAR"], {
        errorMap: () => ({ message: "Must be WHITE_COLLAR or BLUE_COLLAR" }),
    }),
});
