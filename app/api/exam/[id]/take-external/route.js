export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import prisma from "../../../../../lib/prisma";
import { ok, fail, notFound, serverError, validateBody } from "../../../../../lib/api-response";
import { submitSchema, draftSchema } from "../../../../../lib/examValidators";
import { gradeExam } from "../../../../../lib/examScore";

// Resolve the external taker from the ?token= query param. Returns the
// approved registrant or null. The exam itself is returned too (with questions
// for POST grading) to avoid a second query.
async function resolveTaker(request, examId, withQuestions) {
    const token = new URL(request.url).searchParams.get("token");
    if (!token) return { error: fail("Missing access token.", 401) };
    const registrant = await prisma.externalRegistrant.findFirst({
        where: { examId, accessToken: token, status: "APPROVED" },
        select: { id: true },
    });
    if (!registrant) return { error: fail("This access link is invalid or no longer active.", 401) };
    const exam = await prisma.exam.findUnique({
        where: { id: examId },
        include: withQuestions ? { questions: { orderBy: { order: "asc" }, include: { choices: { orderBy: { order: "asc" } } } } } : undefined,
    });
    if (!exam) return { error: notFound("Exam not found") };
    return { registrant, exam };
}

/** GET — load the exam for an approved external registrant (token in query). */
export async function GET(request, { params }) {
    try {
        const { id } = await params;
        const { registrant, exam, error } = await resolveTaker(request, id, true);
        if (error) return error;

        const response = await prisma.examResponse.upsert({
            where: { examId_employeeId: { examId: id, employeeId: registrant.id } },
            update: {},
            create: { examId: id, employeeId: registrant.id },
            include: { answers: true },
        });

        const questions = exam.questions.map((q) => ({
            id: q.id, type: q.type, text: q.text, hint: q.hint, required: q.required,
            choices: q.choices.map((c) => ({ id: c.id, label: c.label })),
        }));
        const savedAnswers = Object.fromEntries(
            response.answers.map((a) => [a.questionId, { choiceIds: a.choiceIds, textValue: a.textValue, ratingValue: a.ratingValue }])
        );
        const submitted = response.submittedAt != null;
        return ok({
            exam: { id: exam.id, title: exam.title, description: exam.description, timeLimitMin: exam.timeLimitMin, passMark: exam.passMark, showResults: exam.showResults, questionCount: questions.length },
            questions, savedAnswers, startedAt: response.startedAt, submitted,
            result: submitted && exam.showResults ? { marks: response.marks, rank: response.rank, passed: (response.marks ?? 0) >= exam.passMark, passMark: exam.passMark } : null,
        });
    } catch (err) {
        console.error("[GET /api/exam/:id/take-external] error:", err);
        return serverError();
    }
}

/** PATCH — autosave draft answers (token in query). */
export async function PATCH(request, { params }) {
    try {
        const { id } = await params;
        const { registrant, error } = await resolveTaker(request, id, false);
        if (error) return error;

        const { data, error: vErr } = await validateBody(request, draftSchema);
        if (vErr) return vErr;

        const response = await prisma.examResponse.upsert({
            where: { examId_employeeId: { examId: id, employeeId: registrant.id } },
            update: {}, create: { examId: id, employeeId: registrant.id },
        });
        if (response.submittedAt) return ok({ savedAt: null, locked: true });

        await prisma.$transaction(async (tx) => {
            await tx.examAnswer.deleteMany({ where: { responseId: response.id } });
            const rows = (data.answers || []).filter((a) => (a.choiceIds && a.choiceIds.length) || a.textValue || a.ratingValue != null);
            if (rows.length) {
                await tx.examAnswer.createMany({
                    data: rows.map((a) => ({ responseId: response.id, questionId: a.questionId, choiceIds: a.choiceIds || [], textValue: a.textValue || null, ratingValue: a.ratingValue ?? null })),
                });
            }
        });
        return ok({ savedAt: new Date().toISOString() });
    } catch (err) {
        console.error("[PATCH /api/exam/:id/take-external] error:", err);
        return serverError();
    }
}

/** POST — submit + grade (token in query). */
export async function POST(request, { params }) {
    try {
        const { id } = await params;
        const { registrant, exam, error } = await resolveTaker(request, id, true);
        if (error) return error;

        const { data, error: vErr } = await validateBody(request, submitSchema);
        if (vErr) return vErr;

        const answersByQ = {};
        for (const a of data.answers) answersByQ[a.questionId] = { choiceIds: a.choiceIds || [] };
        const { marks } = gradeExam(exam.questions, answersByQ);

        await prisma.$transaction(async (tx) => {
            const response = await tx.examResponse.upsert({
                where: { examId_employeeId: { examId: id, employeeId: registrant.id } },
                update: { submittedAt: new Date(), marks, timeTakenSec: data.timeTakenSec ?? null },
                create: { examId: id, employeeId: registrant.id, submittedAt: new Date(), marks, timeTakenSec: data.timeTakenSec ?? null },
            });
            await tx.examAnswer.deleteMany({ where: { responseId: response.id } });
            if (data.answers.length) {
                await tx.examAnswer.createMany({
                    data: data.answers.map((a) => ({ responseId: response.id, questionId: a.questionId, choiceIds: a.choiceIds || [], textValue: a.textValue || null, ratingValue: a.ratingValue ?? null })),
                });
            }
        });
        return ok({ marks, answered: data.answers.length, total: exam.questions.length, passed: marks >= exam.passMark, passMark: exam.passMark, showResults: exam.showResults });
    } catch (err) {
        console.error("[POST /api/exam/:id/take-external] error:", err);
        return serverError();
    }
}
