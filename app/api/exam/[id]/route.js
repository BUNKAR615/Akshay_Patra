export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import prisma from "../../../../lib/prisma";
import { withRole } from "../../../../lib/withRole";
import { ok, fail, notFound, serverError, validateBody } from "../../../../lib/api-response";
import { updateExamSchema } from "../../../../lib/examValidators";

/**
 * GET /api/exam/:id — full exam (questions + choices + audience).
 */
export const GET = withRole(["ADMIN"], async (request, { params }) => {
    try {
        const { id } = await params;
        const exam = await prisma.exam.findUnique({
            where: { id },
            include: {
                audience: true,
                questions: {
                    orderBy: { order: "asc" },
                    include: { choices: { orderBy: { order: "asc" } } },
                },
                _count: { select: { invites: true, responses: true } },
            },
        });
        if (!exam) return notFound("Exam not found");
        return ok({ exam });
    } catch (err) {
        console.error("[GET /api/exam/:id] error:", err);
        return serverError();
    }
});

/**
 * PATCH /api/exam/:id — update details / publish (status change).
 */
export const PATCH = withRole(["ADMIN"], async (request, { params, user }) => {
    try {
        const { id } = await params;
        const { data, error } = await validateBody(request, updateExamSchema);
        if (error) return error;

        const existing = await prisma.exam.findUnique({ where: { id } });
        if (!existing) return notFound("Exam not found");

        const patch = { ...data };
        if (data.dueDate !== undefined) patch.dueDate = data.dueDate ? new Date(data.dueDate) : null;

        const exam = await prisma.exam.update({ where: { id }, data: patch });

        if (data.status && data.status !== existing.status) {
            await prisma.auditLog.create({
                data: { userId: user.userId, action: "EXAM_STATUS_CHANGED", details: { examId: id, from: existing.status, to: data.status } },
            });
        }

        return ok({ exam });
    } catch (err) {
        console.error("[PATCH /api/exam/:id] error:", err);
        return serverError();
    }
});

/**
 * DELETE /api/exam/:id — remove an exam (cascades to questions/choices/etc.).
 */
export const DELETE = withRole(["ADMIN"], async (request, { params, user }) => {
    try {
        const { id } = await params;
        const existing = await prisma.exam.findUnique({ where: { id } });
        if (!existing) return notFound("Exam not found");

        await prisma.exam.delete({ where: { id } });
        await prisma.auditLog.create({
            data: { userId: user.userId, action: "EXAM_DELETED", details: { examId: id, title: existing.title } },
        });
        return ok({ message: "Exam deleted" });
    } catch (err) {
        console.error("[DELETE /api/exam/:id] error:", err);
        return serverError();
    }
});
