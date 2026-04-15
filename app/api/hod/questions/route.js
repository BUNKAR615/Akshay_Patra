export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../lib/prisma";
import { withRole } from "../../../../lib/withRole";
import { ok, fail, serverError } from "../../../../lib/api-response";

/**
 * GET /api/hod/questions
 * Returns Branch-Manager-level questions for the active quarter.
 * HOD evaluators in big branches reuse the BM question bank (no separate HOD bank).
 */
export const GET = withRole(["HOD"], async (request, { user }) => {
    try {
        const quarter = await prisma.quarter.findFirst({ where: { status: "ACTIVE" } });
        if (!quarter) return fail("No active quarter");

        const questions = await prisma.quarterQuestion.findMany({
            where: { quarterId: quarter.id, question: { level: "BRANCH_MANAGER" } },
            include: { question: { select: { id: true, text: true, textHindi: true, category: true, level: true } } },
            orderBy: { question: { category: "asc" } }
        });

        return ok({
            questions: questions.map(q => q.question),
            quarterId: quarter.id,
            count: questions.length
        });
    } catch (err) {
        console.error("[HOD-QUESTIONS] Error:", err.message);
        return serverError();
    }
});
