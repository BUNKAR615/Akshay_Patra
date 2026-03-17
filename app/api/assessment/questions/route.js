import prisma from "../../../../lib/prisma";
import { withRole } from "../../../../lib/withRole";
import { ok, notFound, fail, serverError } from "../../../../lib/api-response";

/**
 * GET /api/assessment/questions
 * Returns locked SELF-level questions for the active quarter.
 * Guards: no active quarter, already submitted.
 */
export const GET = withRole(["EMPLOYEE"], async (request, { user }) => {
    try {
        const activeQuarter = await prisma.quarter.findFirst({ where: { status: "ACTIVE" }, select: { id: true, name: true } });
        if (!activeQuarter) return notFound("No active quarter. Self-assessment is not open at this time.");

        // Guard: already submitted
        const existing = await prisma.selfAssessment.findUnique({
            where: { userId_quarterId: { userId: user.userId, quarterId: activeQuarter.id } },
        });
        if (existing) {
            return fail("You have already submitted your self-assessment for this quarter", 400);
        }

        const quarterQuestions = await prisma.quarterQuestion.findMany({
            where: { quarterId: activeQuarter.id, question: { level: "SELF" } },
            include: { question: { select: { id: true, text: true, textHindi: true, category: true } } },
            orderBy: { createdAt: "asc" },
        });

        return ok({ quarter: activeQuarter, totalQuestions: quarterQuestions.length, questions: quarterQuestions.map((qq) => qq.question) });
    } catch (err) {
        console.error("Get assessment questions error:", err);
        return serverError();
    }
});
