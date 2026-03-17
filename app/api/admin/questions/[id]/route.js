import prisma from "../../../../../lib/prisma";
import { withRole } from "../../../../../lib/withRole";
import { ok, fail, notFound, serverError, validateBody } from "../../../../../lib/api-response";
import { updateQuestionSchema } from "../../../../../lib/validators";

/**
 * PATCH /api/admin/questions/:id — toggle isActive
 */
export const PATCH = withRole(["ADMIN"], async (request, { params, user }) => {
    try {
        const { id } = await params;
        if (!id) return fail("Question ID is required");

        const question = await prisma.question.findUnique({ where: { id } });
        if (!question) return notFound("Question not found");

        const updated = await prisma.question.update({
            where: { id },
            data: { isActive: !question.isActive },
        });

        console.log("Saved to DB:", updated);

        await prisma.auditLog.create({
            data: { userId: user.userId, action: question.isActive ? "QUESTION_DEACTIVATED" : "QUESTION_ACTIVATED", details: { questionId: updated.id, previousState: question.isActive, newState: updated.isActive } },
        });

        return ok({ message: `Question ${updated.isActive ? "activated" : "deactivated"}`, question: updated });
    } catch (err) {
        console.error("Toggle question error:", err);
        return serverError();
    }
});

/**
 * PUT /api/admin/questions/:id — edit question text/category/level
 */
export const PUT = withRole(["ADMIN"], async (request, { params, user }) => {
    try {
        const { id } = await params;
        if (!id) return fail("Question ID is required");

        const { data, error } = await validateBody(request, updateQuestionSchema);
        if (error) return error;

        const question = await prisma.question.findUnique({ where: { id } });
        if (!question) return notFound("Question not found");

        const updateData = {};
        if (data.text !== undefined) updateData.text = data.text.trim();
        if (data.textHindi !== undefined) updateData.textHindi = data.textHindi.trim();
        if (data.category !== undefined) updateData.category = data.category;
        if (data.level !== undefined) updateData.level = data.level;
        if (data.isActive !== undefined) updateData.isActive = data.isActive;

        const updated = await prisma.question.update({ where: { id }, data: updateData });

        console.log("Saved to DB:", updated);

        await prisma.auditLog.create({
            data: { userId: user.userId, action: "QUESTION_UPDATED", details: { questionId: updated.id, changes: updateData } },
        });

        return ok({ message: "Question updated", question: updated });
    } catch (err) {
        console.error("Update question error:", err);
        return serverError();
    }
});

/**
 * DELETE /api/admin/questions/:id — delete question
 */
export const DELETE = withRole(["ADMIN"], async (request, { params, user }) => {
    try {
        const { id } = await params;
        if (!id) return fail("Question ID is required");

        const question = await prisma.question.findUnique({ where: { id } });
        if (!question) return notFound("Question not found");

        // Check if question is used in any quarter
        const usedInQuarter = await prisma.quarterQuestion.findFirst({ where: { questionId: id } });
        if (usedInQuarter) {
            return fail("Cannot delete a question that has been used in a quarter. Deactivate it instead.", 400);
        }

        await prisma.question.delete({ where: { id } });

        await prisma.auditLog.create({
            data: { userId: user.userId, action: "QUESTION_DELETED", details: { questionId: id, text: question.text, category: question.category, level: question.level } },
        });

        return ok({ message: "Question deleted" });
    } catch (err) {
        console.error("Delete question error:", err);
        return serverError();
    }
});
