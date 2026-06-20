export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import prisma from "../../../../../lib/prisma";
import { withRole } from "../../../../../lib/withRole";
import { ok, notFound, serverError, validateBody } from "../../../../../lib/api-response";
import { submitSchema, draftSchema } from "../../../../../lib/examValidators";
import { gradeExam } from "../../../../../lib/examScore";

const ALL_ROLES = ["EMPLOYEE", "SUPERVISOR", "HOD", "BRANCH_MANAGER", "CLUSTER_MANAGER", "HR", "COMMITTEE", "ADMIN"];

/**
 * GET /api/exam/:id/take — load the exam for the signed-in employee. Choices are
 * returned WITHOUT the isCorrect flag. Creates/loads the employee's response
 * (marks the invite STARTED) so progress can resume.
 */
export const GET = withRole(ALL_ROLES, async (request, { params, user }) => {
    try {
        const { id } = await params;
        const exam = await prisma.exam.findUnique({
            where: { id },
            include: { questions: { orderBy: { order: "asc" }, include: { choices: { orderBy: { order: "asc" } } } } },
        });
        if (!exam) return notFound("Exam not found");

        const response = await prisma.examResponse.upsert({
            where: { examId_employeeId: { examId: id, employeeId: user.userId } },
            update: {},
            create: { examId: id, employeeId: user.userId },
            include: { answers: true },
        });

        // Mark the invite STARTED (only if one exists and isn't already completed).
        await prisma.examInvite.updateMany({
            where: { examId: id, employeeId: user.userId, status: "INVITED" },
            data: { status: "STARTED" },
        });

        const questions = exam.questions.map((q) => ({
            id: q.id,
            type: q.type,
            text: q.text,
            hint: q.hint,
            imageUrl: q.imageUrl,
            required: q.required,
            choices: q.choices.map((c) => ({ id: c.id, label: c.label, imageUrl: c.imageUrl })),
        }));

        const savedAnswers = Object.fromEntries(
            response.answers.map((a) => [a.questionId, { choiceIds: a.choiceIds, textValue: a.textValue, ratingValue: a.ratingValue }])
        );

        const submitted = response.submittedAt != null;
        return ok({
            exam: {
                id: exam.id,
                title: exam.title,
                description: exam.description,
                timeLimitMin: exam.timeLimitMin,
                passMark: exam.passMark,
                showResults: exam.showResults,
                questionCount: questions.length,
            },
            questions,
            savedAnswers,
            startedAt: response.startedAt,
            submitted,
            // Only reveal the score when the exam allows it.
            result: submitted && exam.showResults
                ? { marks: response.marks, rank: response.rank, passed: (response.marks ?? 0) >= exam.passMark, passMark: exam.passMark }
                : null,
        });
    } catch (err) {
        console.error("[GET /api/exam/:id/take] error:", err);
        return serverError();
    }
});

/**
 * PATCH /api/exam/:id/take — autosave in-progress answers (draft). Persists
 * answers WITHOUT submitting or grading so the participant can resume later.
 * No-ops once the response is already submitted.
 */
export const PATCH = withRole(ALL_ROLES, async (request, { params, user }) => {
    try {
        const { id } = await params;
        const exam = await prisma.exam.findUnique({ where: { id }, select: { id: true } });
        if (!exam) return notFound("Exam not found");

        const { data, error } = await validateBody(request, draftSchema);
        if (error) return error;

        const response = await prisma.examResponse.upsert({
            where: { examId_employeeId: { examId: id, employeeId: user.userId } },
            update: {},
            create: { examId: id, employeeId: user.userId },
        });
        if (response.submittedAt) return ok({ savedAt: null, locked: true });

        await prisma.$transaction(async (tx) => {
            await tx.examAnswer.deleteMany({ where: { responseId: response.id } });
            const rows = (data.answers || []).filter(
                (a) => (a.choiceIds && a.choiceIds.length) || a.textValue || a.ratingValue != null
            );
            if (rows.length) {
                await tx.examAnswer.createMany({
                    data: rows.map((a) => ({
                        responseId: response.id,
                        questionId: a.questionId,
                        choiceIds: a.choiceIds || [],
                        textValue: a.textValue || null,
                        ratingValue: a.ratingValue ?? null,
                    })),
                });
            }
        });

        return ok({ savedAt: new Date().toISOString() });
    } catch (err) {
        console.error("[PATCH /api/exam/:id/take] error:", err);
        return serverError();
    }
});

/**
 * POST /api/exam/:id/take — submit answers. Auto-grades SINGLE/MULTIPLE,
 * stores marks, marks the response submitted and the invite COMPLETED.
 */
export const POST = withRole(ALL_ROLES, async (request, { params, user }) => {
    try {
        const { id } = await params;
        const exam = await prisma.exam.findUnique({
            where: { id },
            include: { questions: { include: { choices: true } } },
        });
        if (!exam) return notFound("Exam not found");

        const { data, error } = await validateBody(request, submitSchema);
        if (error) return error;

        const answersByQ = {};
        for (const a of data.answers) answersByQ[a.questionId] = { choiceIds: a.choiceIds || [] };
        const { marks } = gradeExam(exam.questions, answersByQ);

        await prisma.$transaction(async (tx) => {
            const response = await tx.examResponse.upsert({
                where: { examId_employeeId: { examId: id, employeeId: user.userId } },
                update: { submittedAt: new Date(), marks, timeTakenSec: data.timeTakenSec ?? null },
                create: { examId: id, employeeId: user.userId, submittedAt: new Date(), marks, timeTakenSec: data.timeTakenSec ?? null },
            });

            await tx.examAnswer.deleteMany({ where: { responseId: response.id } });
            if (data.answers.length) {
                await tx.examAnswer.createMany({
                    data: data.answers.map((a) => ({
                        responseId: response.id,
                        questionId: a.questionId,
                        choiceIds: a.choiceIds || [],
                        textValue: a.textValue || null,
                        ratingValue: a.ratingValue ?? null,
                    })),
                });
            }

            await tx.examInvite.updateMany({
                where: { examId: id, employeeId: user.userId },
                data: { status: "COMPLETED" },
            });
        });

        return ok({ marks, answered: data.answers.length, total: exam.questions.length, passed: marks >= exam.passMark, passMark: exam.passMark, showResults: exam.showResults });
    } catch (err) {
        console.error("[POST /api/exam/:id/take] error:", err);
        return serverError();
    }
});
