export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import prisma from "../../../../../lib/prisma";
import { withRole } from "../../../../../lib/withRole";
import { ok, notFound, serverError, validateBody } from "../../../../../lib/api-response";
import { submitSchema } from "../../../../../lib/examValidators";
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
            required: q.required,
            choices: q.choices.map((c) => ({ id: c.id, label: c.label })),
        }));

        const savedAnswers = Object.fromEntries(
            response.answers.map((a) => [a.questionId, { choiceIds: a.choiceIds, textValue: a.textValue, ratingValue: a.ratingValue }])
        );

        return ok({
            exam: { id: exam.id, title: exam.title, timeLimitMin: exam.timeLimitMin, passMark: exam.passMark },
            questions,
            savedAnswers,
            submitted: response.submittedAt != null,
        });
    } catch (err) {
        console.error("[GET /api/exam/:id/take] error:", err);
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

        return ok({ marks, answered: data.answers.length, total: exam.questions.length, passed: marks >= exam.passMark });
    } catch (err) {
        console.error("[POST /api/exam/:id/take] error:", err);
        return serverError();
    }
});
