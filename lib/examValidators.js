// Zod schemas for the Online Exam API. Mirrors the existing validators.js style
// (used via validateBody in lib/api-response.js).

import { z } from "zod";

export const EXAM_STATUSES = ["DRAFT", "SCHEDULED", "ACTIVE", "COMPLETED"];
export const QUESTION_TYPES = ["SINGLE", "MULTIPLE", "SHORT", "LONG", "RATING", "TRUE_FALSE", "LIKERT", "RANKING", "POLL", "WORD_CLOUD", "PICTURE"];
// Types backed by selectable options.
export const CHOICE_TYPES = ["SINGLE", "MULTIPLE", "TRUE_FALSE", "POLL", "PICTURE", "RANKING"];
// Types that carry correct answers and contribute to the score.
export const GRADABLE_TYPES = ["SINGLE", "MULTIPLE", "TRUE_FALSE", "PICTURE"];
export const AUDIENCE_MODES = ["ALL", "BRANCH", "DEPT", "BM", "RM", "RANDOM", "CUSTOM"];
export const PARTICIPATION_MODES = ["INTERNAL", "INTERNAL_EXTERNAL", "OPEN", "CUSTOM"];

export const createExamSchema = z.object({
    title: z.string().trim().min(1, "Title is required").max(160),
    description: z.string().trim().max(2000).optional().nullable(),
});

export const updateExamSchema = z
    .object({
        title: z.string().trim().min(1).max(160).optional(),
        description: z.string().trim().max(2000).optional().nullable(),
        status: z.enum(EXAM_STATUSES).optional(),
        timeLimitMin: z.number().int().min(0).max(600).optional().nullable(),
        passMark: z.number().int().min(0).max(100).optional(),
        dueDate: z.string().datetime().optional().nullable(),
        shuffle: z.boolean().optional(),
        showResults: z.boolean().optional(),
        requireCompletion: z.boolean().optional(),
        participationMode: z.enum(PARTICIPATION_MODES).optional(),
        // Phase B — external registration & access control.
        externalEmailRequired: z.boolean().optional(),
        externalMobileRequired: z.boolean().optional(),
        externalEmpCodeRequired: z.boolean().optional(),
        externalApprovalMode: z.enum(["AUTO", "MANUAL"]).optional(),
        allowReattempts: z.boolean().optional(),
    })
    .refine((d) => Object.keys(d).length > 0, { message: "No fields to update" });

// Public external-registration submission. Required-ness of email/mobile/empCode
// is enforced in the route against the exam's settings (it's dynamic).
export const registrationSchema = z.object({
    name: z.string().trim().min(1, "Full name is required").max(160),
    empCode: z.string().trim().max(40).optional().nullable(),
    email: z.union([z.string().trim().email("Enter a valid email").max(160), z.literal("")]).optional().nullable(),
    mobile: z.string().trim().max(20).optional().nullable(),
    department: z.string().trim().max(120).optional().nullable(),
    branch: z.string().trim().max(120).optional().nullable(),
    designation: z.string().trim().max(120).optional().nullable(),
});

export const registrantReviewSchema = z.object({
    registrantId: z.string().trim().min(1),
    status: z.enum(["PENDING", "APPROVED", "REJECTED"]),
});

// Reusable saved audience (Phase A): filters snapshot + resolved employee set.
export const audienceTemplateSchema = z.object({
    name: z.string().trim().min(1, "Template name is required").max(120),
    mode: z.enum(PARTICIPATION_MODES).optional().default("CUSTOM"),
    filters: z.any().optional().nullable(),
    employeeIds: z.array(z.string().trim()).max(20000).optional().default([]),
    count: z.number().int().min(0).optional().default(0),
});

export const audienceTemplateUpdateSchema = z
    .object({
        name: z.string().trim().min(1).max(120).optional(),
        mode: z.enum(PARTICIPATION_MODES).optional(),
        filters: z.any().optional().nullable(),
        employeeIds: z.array(z.string().trim()).max(20000).optional(),
        count: z.number().int().min(0).optional(),
    })
    .refine((d) => Object.keys(d).length > 0, { message: "No fields to update" });

const choiceSchema = z.object({
    label: z.string().trim().min(1).max(400),
    imageUrl: z.string().trim().max(2000).optional().nullable(),
    isCorrect: z.boolean().optional().default(false),
});

const questionSchema = z.object({
    type: z.enum(QUESTION_TYPES),
    text: z.string().trim().min(1).max(1000),
    hint: z.string().trim().max(500).optional().nullable(),
    imageUrl: z.string().trim().max(2000).optional().nullable(),
    required: z.boolean().optional().default(true),
    points: z.number().int().min(0).max(100).optional().default(0),
    choices: z.array(choiceSchema).max(12).optional().default([]),
});

export const questionsSchema = z.object({
    questions: z.array(questionSchema).max(100),
});

export const audienceSchema = z.object({
    mode: z.enum(AUDIENCE_MODES),
    branchId: z.string().trim().optional().nullable(),
    departmentId: z.string().trim().optional().nullable(),
    role: z.string().trim().optional().nullable(),
    randomCount: z.number().int().min(0).max(10000).optional().nullable(),
    customRules: z.any().optional().nullable(),
});

const answerItemSchema = z.object({
    questionId: z.string().trim().min(1),
    choiceIds: z.array(z.string().trim()).optional().default([]),
    textValue: z.string().trim().max(5000).optional().nullable(),
    ratingValue: z.number().int().min(1).max(5).optional().nullable(),
});

export const submitSchema = z.object({
    timeTakenSec: z.number().int().min(0).optional(),
    answers: z.array(answerItemSchema).max(100),
});

// Autosave draft — every field optional; used to persist in-progress answers so
// the participant can resume. Does not submit or grade.
export const draftSchema = z.object({
    timeTakenSec: z.number().int().min(0).optional(),
    answers: z.array(answerItemSchema).max(200).optional().default([]),
});
