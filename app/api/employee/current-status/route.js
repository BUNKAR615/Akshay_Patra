import prisma from "../../../../lib/prisma";
import { withRole } from "../../../../lib/withRole";
import { ok, notFound, serverError } from "../../../../lib/api-response";

/**
 * GET /api/employee/current-status
 *
 * Returns the employee's current progress in the active (or most recent) quarter:
 * - Their submitted answers + scores (if submitted)
 * - Which stage they reached
 * - The final winner (if quarter is closed and winner decided)
 */
export const GET = withRole(["EMPLOYEE"], async (request, { user }) => {
    try {
        const userId = user.userId;

        // Find the active quarter, or fall back to latest
        let quarter = await prisma.quarter.findFirst({ where: { status: "ACTIVE" } });
        if (!quarter) {
            quarter = await prisma.quarter.findFirst({ orderBy: { createdAt: "desc" } });
        }
        if (!quarter) return notFound("No quarters exist yet");

        const qId = quarter.id;

        // ── Self Assessment ──
        const selfAssessment = await prisma.selfAssessment.findUnique({
            where: { userId_quarterId: { userId, quarterId: qId } },
        });

        let answersWithQuestions = [];
        if (selfAssessment && selfAssessment.answers) {
            const answers = selfAssessment.answers;
            const questionIds = answers.map((a) => a.questionId);
            const questions = await prisma.question.findMany({
                where: { id: { in: questionIds } },
                select: { id: true, text: true, textHindi: true, category: true },
            });
            const qMap = Object.fromEntries(questions.map((q) => [q.id, q]));
            answersWithQuestions = answers.map((a) => ({
                questionId: a.questionId,
                questionText: qMap[a.questionId]?.text || "Question not found",
                category: qMap[a.questionId]?.category || "UNKNOWN",
                score: a.score,
            }));
        }

        // ── Stage progress ──
        const stage1 = await prisma.shortlistStage1.findFirst({
            where: { userId, quarterId: qId },
            select: { rank: true },
        });

        const supEval = await prisma.supervisorEvaluation.findFirst({
            where: { employeeId: userId, quarterId: qId },
            select: { supervisorScore: true, combinedScore: true },
        });

        const stage2 = await prisma.shortlistStage2.findFirst({
            where: { userId, quarterId: qId },
            select: { rank: true, combinedScore: true },
        });

        const bmEval = await prisma.branchManagerEvaluation.findFirst({
            where: { employeeId: userId, quarterId: qId },
            select: { bmScore: true, combinedScore: true },
        });

        const stage3 = await prisma.shortlistStage3.findFirst({
            where: { userId, quarterId: qId },
            select: { rank: true, combinedScore: true },
        });

        const cmEval = await prisma.clusterManagerEvaluation.findFirst({
            where: { employeeId: userId, quarterId: qId },
            select: { cmScore: true, finalScore: true },
        });

        const bestEmployee = await prisma.bestEmployee.findFirst({
            where: { userId, quarterId: qId },
            select: { finalScore: true },
        });

        // Determine current stage
        let currentStage = 0;
        const stages = [];

        if (selfAssessment) {
            currentStage = 1;
            stages.push({ stage: 1, name: "Self Assessment", status: "completed", score: selfAssessment.totalScore });
        }

        if (supEval) {
            stages.push({ stage: 2, name: "Supervisor Evaluation", status: stage2 ? "shortlisted" : "evaluated", score: supEval.combinedScore, detail: `Supervisor score: ${supEval.supervisorScore.toFixed(1)}, Combined: ${supEval.combinedScore.toFixed(1)}` });
            if (stage2) currentStage = 2;
        } else if (stage1) {
            stages.push({ stage: 2, name: "Supervisor Evaluation", status: "pending", score: null });
        }

        if (bmEval) {
            stages.push({ stage: 3, name: "Branch Manager Evaluation", status: stage3 ? "shortlisted" : "evaluated", score: bmEval.combinedScore, detail: `BM score: ${bmEval.bmScore.toFixed(1)}, Combined: ${bmEval.combinedScore.toFixed(1)}` });
            if (stage3) currentStage = 3;
        } else if (stage2) {
            stages.push({ stage: 3, name: "Branch Manager Evaluation", status: "pending", score: null });
        }

        if (cmEval) {
            stages.push({ stage: 4, name: "Cluster Manager Evaluation", status: bestEmployee ? "winner" : "evaluated", score: cmEval.finalScore, detail: `CM score: ${cmEval.cmScore.toFixed(1)}, Final: ${cmEval.finalScore.toFixed(1)}` });
            if (bestEmployee) currentStage = 4;
        } else if (stage3) {
            stages.push({ stage: 4, name: "Cluster Manager Evaluation", status: "pending", score: null });
        }

        // ── Get the quarter winner (visible only after quarter is CLOSED) ──
        let winner = null;
        if (quarter.status === "CLOSED") {
            const be = await prisma.bestEmployee.findUnique({
                where: { quarterId: qId },
                include: {
                    user: { select: { id: true, name: true } },
                    department: { select: { name: true } },
                },
            });
            if (be) {
                winner = {
                    name: be.user.name,
                    department: be.department.name,
                    finalScore: be.finalScore,
                    isCurrentUser: be.userId === userId,
                };
            }
        }

        return ok({
            quarter: { id: quarter.id, name: quarter.name, status: quarter.status },
            submitted: !!selfAssessment,
            selfAssessment: selfAssessment
                ? {
                    totalScore: selfAssessment.totalScore,
                    submittedAt: selfAssessment.submittedAt,
                    answers: answersWithQuestions,
                }
                : null,
            currentStage,
            isBestEmployee: !!bestEmployee,
            stages,
            stage1Rank: stage1?.rank || null,
            winner,
        });
    } catch (err) {
        console.error("Employee current-status error:", err);
        return serverError();
    }
});
