export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../../../lib/prisma";
import { withRole } from "../../../../../../lib/withRole";
import { ok, fail, notFound, serverError, validateBody } from "../../../../../../lib/api-response";
import { quarterQuestionsUpdateSchema } from "../../../../../../lib/validators";

/**
 * GET /api/admin/quarters/:quarterId/questions
 * Returns the IDs of the questions locked into this quarter (its QuarterQuestion
 * set) so the Questions page can show, per question, whether it belongs to the
 * selected quarter.
 */
export const GET = withRole(["ADMIN"], async (request, { params }) => {
    try {
        const { quarterId } = await params;
        if (!quarterId) return fail("Quarter ID is required");

        const quarter = await prisma.quarter.findUnique({ where: { id: quarterId }, select: { id: true, status: true } });
        if (!quarter) return notFound("Quarter not found");

        const rows = await prisma.quarterQuestion.findMany({ where: { quarterId }, select: { questionId: true } });
        return ok({ quarterId, status: quarter.status, questionIds: rows.map((r) => r.questionId) });
    } catch (err) {
        console.error("Get quarter questions error:", err);
        return serverError();
    }
});

/**
 * PUT /api/admin/quarters/:quarterId/questions
 * Body: { add: string[], remove: string[] }
 * Bulk-applies the staged "Apply changes" set: links the `add` questions to the
 * quarter (skipping duplicates) and unlinks the `remove` ones. Returns the
 * resulting membership so the client can reconcile its committed state.
 */
export const PUT = withRole(["ADMIN"], async (request, { params, user }) => {
    try {
        const { quarterId } = await params;
        if (!quarterId) return fail("Quarter ID is required");

        const { data, error } = await validateBody(request, quarterQuestionsUpdateSchema);
        if (error) return error;

        const quarter = await prisma.quarter.findUnique({ where: { id: quarterId }, select: { id: true, name: true } });
        if (!quarter) return notFound("Quarter not found");

        const add = [...new Set(data.add || [])];
        const remove = [...new Set(data.remove || [])].filter((id) => !add.includes(id));

        let added = 0;
        let removed = 0;
        await prisma.$transaction(async (tx) => {
            if (add.length) {
                // Only link real questions — silently drop any stale/unknown ids.
                const existing = await tx.question.findMany({ where: { id: { in: add } }, select: { id: true } });
                const validIds = existing.map((q) => q.id);
                if (validIds.length) {
                    const res = await tx.quarterQuestion.createMany({
                        data: validIds.map((questionId) => ({ quarterId, questionId })),
                        skipDuplicates: true,
                    });
                    added = res.count;
                }
            }
            if (remove.length) {
                const res = await tx.quarterQuestion.deleteMany({ where: { quarterId, questionId: { in: remove } } });
                removed = res.count;
            }
        });

        await prisma.auditLog.create({
            data: {
                userId: user.userId,
                action: "QUARTER_QUESTIONS_UPDATED",
                details: { quarterId, quarterName: quarter.name, added, removed, requestedAdd: add.length, requestedRemove: remove.length },
            },
        }).catch((e) => { console.error("[QUARTER-QUESTIONS] Audit log failed:", e); });

        const rows = await prisma.quarterQuestion.findMany({ where: { quarterId }, select: { questionId: true } });
        return ok({
            message: `Updated "${quarter.name}" — ${added} added, ${removed} removed`,
            quarterId,
            added,
            removed,
            questionIds: rows.map((r) => r.questionId),
        });
    } catch (err) {
        console.error("Update quarter questions error:", err);
        return serverError();
    }
});
