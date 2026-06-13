export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../lib/prisma";
import { withRole } from "../../../../lib/withRole";
import { ok, notFound, serverError } from "../../../../lib/api-response";

/** GET /api/branch-manager/questions */
export const GET = withRole(["BRANCH_MANAGER"], async (request) => {
    try {
        const activeQuarter = await prisma.quarter.findFirst({ where: { status: "ACTIVE" }, select: { id: true, name: true, questionCount: true } });
        if (!activeQuarter) return notFound("No active quarter found");

        // Return the full BM-level set WITH each question's collarType; the BM
        // dashboard filters to the selected employee's category before showing
        // them (shared + own-collar). The evaluate route re-applies the same
        // filter server-side so the accepted set always matches what was shown.
        const qqs = await prisma.quarterQuestion.findMany({
            where: { quarterId: activeQuarter.id, question: { level: "BRANCH_MANAGER" } },
            include: { question: { select: { id: true, text: true, textHindi: true, category: true, collarType: true } } },
            orderBy: { createdAt: "asc" },
        });

        return ok({ quarter: activeQuarter, totalQuestions: qqs.length, questions: qqs.map((q) => q.question) });
    } catch (err) {
        console.error("BM questions error:", err);
        return serverError();
    }
});
