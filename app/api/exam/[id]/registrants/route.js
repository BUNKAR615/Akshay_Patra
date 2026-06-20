export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import prisma from "../../../../../lib/prisma";
import { withRole } from "../../../../../lib/withRole";
import { ok, notFound, serverError, validateBody } from "../../../../../lib/api-response";
import { registrantReviewSchema } from "../../../../../lib/examValidators";

/**
 * GET /api/exam/:id/registrants — ADMIN. External registrants + status counts.
 */
export const GET = withRole(["ADMIN"], async (_request, { params }) => {
    try {
        const { id } = await params;
        const exam = await prisma.exam.findUnique({ where: { id }, select: { id: true, title: true } });
        if (!exam) return notFound("Exam not found");

        const registrants = await prisma.externalRegistrant.findMany({
            where: { examId: id },
            orderBy: { createdAt: "desc" },
        });
        const counts = registrants.reduce(
            (acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; },
            { PENDING: 0, APPROVED: 0, REJECTED: 0 }
        );
        return ok({ exam, registrants, counts, total: registrants.length });
    } catch (err) {
        console.error("[GET /api/exam/:id/registrants] error:", err);
        return serverError();
    }
});

/**
 * PATCH /api/exam/:id/registrants — ADMIN. Approve / reject a registrant.
 */
export const PATCH = withRole(["ADMIN"], async (request, { params, user }) => {
    try {
        const { id } = await params;
        const { data, error } = await validateBody(request, registrantReviewSchema);
        if (error) return error;

        const existing = await prisma.externalRegistrant.findFirst({
            where: { id: data.registrantId, examId: id },
        });
        if (!existing) return notFound("Registrant not found");

        const registrant = await prisma.externalRegistrant.update({
            where: { id: data.registrantId },
            data: { status: data.status, reviewedById: user.userId },
        });
        return ok({ registrant });
    } catch (err) {
        console.error("[PATCH /api/exam/:id/registrants] error:", err);
        return serverError();
    }
});
