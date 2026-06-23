export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../lib/prisma";
import { withPermission } from "../../../../lib/withPermission";
import { QUESTIONS_ANY } from "../../../../lib/permissions";
import { ok, created, serverError, validateBody } from "../../../../lib/api-response";
import { createQuestionSchema } from "../../../../lib/validators";

/**
 * GET /api/admin/questions
 * Returns all questions in the bank
 */
export const GET = withPermission(QUESTIONS_ANY, async () => {
    try {
        const questions = await prisma.question.findMany({
            orderBy: { createdAt: "desc" },
        });
        return ok({ questions });
    } catch (err) {
        console.error("Get questions error:", err);
        return serverError();
    }
});

/**
 * POST /api/admin/questions
 */
export const POST = withPermission("questions.add", async (request, { user }) => {
    try {
        const { data, error } = await validateBody(request, createQuestionSchema);
        if (error) return error;

        const question = await prisma.question.create({
            data: { text: data.text.trim(), textHindi: (data.textHindi || "").trim(), category: data.category, level: data.level, collarType: data.collarType ?? null, isActive: true },
        });

        await prisma.auditLog.create({
            data: { userId: user.userId, action: "QUESTION_CREATED", details: { questionId: question.id, text: question.text, category: question.category, level: question.level, collarType: question.collarType } },
        });

        return created({ message: "Question created", question });
    } catch (err) {
        console.error("Create question error:", err);
        return serverError();
    }
});
