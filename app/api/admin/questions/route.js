export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../lib/prisma";
import { withRole } from "../../../../lib/withRole";
import { ok, created, serverError, validateBody } from "../../../../lib/api-response";
import { createQuestionSchema } from "../../../../lib/validators";

/**
 * GET /api/admin/questions
 * Returns all questions in the bank
 */
export const GET = withRole(["ADMIN"], async () => {
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
export const POST = withRole(["ADMIN"], async (request, { user }) => {
    try {
        const { data, error } = await validateBody(request, createQuestionSchema);
        if (error) return error;

        const question = await prisma.question.create({
            data: { text: data.text.trim(), textHindi: (data.textHindi || "").trim(), category: data.category, level: data.level, isActive: true },
        });

        console.log("Saved to DB:", question);

        await prisma.auditLog.create({
            data: { userId: user.userId, action: "QUESTION_CREATED", details: { questionId: question.id, text: question.text, category: question.category, level: question.level } },
        });

        return created({ message: "Question created", question });
    } catch (err) {
        console.error("Create question error:", err);
        return serverError();
    }
});
