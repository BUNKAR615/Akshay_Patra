export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import prisma from "../../../../../lib/prisma";
import { withRole } from "../../../../../lib/withRole";
import { ok, notFound, serverError, validateBody } from "../../../../../lib/api-response";
import { questionsSchema } from "../../../../../lib/examValidators";

/**
 * PUT /api/exam/:id/questions — replace the whole question set for an exam.
 * Points: if a gradable question has points=0, 100 points are split evenly
 * across all gradable (SINGLE/MULTIPLE) questions.
 */
export const PUT = withRole(["ADMIN"], async (request, { params, user }) => {
    try {
        const { id } = await params;
        const exam = await prisma.exam.findUnique({ where: { id } });
        if (!exam) return notFound("Exam not found");

        const { data, error } = await validateBody(request, questionsSchema);
        if (error) return error;

        const incoming = data.questions;
        const gradableIdx = incoming.map((q, i) => ({ q, i })).filter(({ q }) => q.type === "SINGLE" || q.type === "MULTIPLE");
        const anyPoints = gradableIdx.some(({ q }) => (q.points || 0) > 0);
        let evenEach = 0;
        let remainder = 0;
        if (!anyPoints && gradableIdx.length) {
            evenEach = Math.floor(100 / gradableIdx.length);
            remainder = 100 - evenEach * gradableIdx.length;
        }

        await prisma.$transaction(async (tx) => {
            // Replace: delete existing questions (cascades to choices), recreate.
            await tx.examQuestion.deleteMany({ where: { examId: id } });

            for (let i = 0; i < incoming.length; i++) {
                const q = incoming[i];
                const gradable = q.type === "SINGLE" || q.type === "MULTIPLE";
                let points = q.points || 0;
                if (gradable && !anyPoints) {
                    const isFirstGradable = gradableIdx[0]?.i === i;
                    points = evenEach + (isFirstGradable ? remainder : 0);
                }
                await tx.examQuestion.create({
                    data: {
                        examId: id,
                        order: i,
                        type: q.type,
                        text: q.text,
                        hint: q.hint || null,
                        required: q.required ?? true,
                        points: gradable ? points : 0,
                        choices: gradable && q.choices?.length
                            ? { create: q.choices.map((c, ci) => ({ order: ci, label: c.label, isCorrect: !!c.isCorrect })) }
                            : undefined,
                    },
                });
            }
        });

        const questions = await prisma.examQuestion.findMany({
            where: { examId: id },
            orderBy: { order: "asc" },
            include: { choices: { orderBy: { order: "asc" } } },
        });

        await prisma.auditLog.create({
            data: { userId: user.userId, action: "EXAM_QUESTIONS_SAVED", details: { examId: id, count: questions.length } },
        });

        return ok({ questions });
    } catch (err) {
        console.error("[PUT /api/exam/:id/questions] error:", err);
        return serverError();
    }
});
