import prisma from "../../../../lib/prisma";
import { withRole } from "../../../../lib/withRole";
import { ok, notFound, serverError } from "../../../../lib/api-response";

/** GET /api/cluster-manager/questions */
export const GET = withRole(["CLUSTER_MANAGER"], async (request) => {
    try {
        const activeQuarter = await prisma.quarter.findFirst({ where: { status: "ACTIVE" }, select: { id: true, name: true, questionCount: true } });
        if (!activeQuarter) return notFound("No active quarter found");

        const qqs = await prisma.quarterQuestion.findMany({
            where: { quarterId: activeQuarter.id, question: { level: "CLUSTER_MANAGER" } },
            include: { question: { select: { id: true, text: true, textHindi: true, category: true } } },
            orderBy: { createdAt: "asc" },
        });

        return ok({ quarter: activeQuarter, totalQuestions: qqs.length, questions: qqs.map((q) => q.question) });
    } catch (err) {
        console.error("CM questions error:", err);
        return serverError();
    }
});
