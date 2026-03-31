export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

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
        const OPTIONS_MAP = {
            "-2": "Strongly Disagree",
            "-1": "Disagree",
            "0": "Neutral",
            "1": "Agree",
            "2": "Strongly Agree"
        };

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
                answerLabel: OPTIONS_MAP[String(a.score)] || "Unknown",
            }));
        }

        // ── Stage progress ──
        const stage1 = await prisma.shortlistStage1.findFirst({
            where: { userId, quarterId: qId },
            select: { rank: true },
        });

        const supEval = await prisma.supervisorEvaluation.findFirst({
            where: { employeeId: userId, quarterId: qId },
            select: { id: true },
        });

        const stage2 = await prisma.shortlistStage2.findFirst({
            where: { userId, quarterId: qId },
            select: { rank: true },
        });

        const bmEval = await prisma.branchManagerEvaluation.findFirst({
            where: { employeeId: userId, quarterId: qId },
            select: { id: true },
        });

        const stage3 = await prisma.shortlistStage3.findFirst({
            where: { userId, quarterId: qId },
            select: { rank: true },
        });

        const cmEval = await prisma.clusterManagerEvaluation.findFirst({
            where: { employeeId: userId, quarterId: qId },
            select: { id: true },
        });

        const bestEmployee = await prisma.bestEmployee.findFirst({
            where: { userId, quarterId: qId },
            select: { id: true },
        });

        // Determine current stage
        let currentStage = 0;
        const stages = [];

        if (selfAssessment) {
            currentStage = 1;
            stages.push({ stage: 1, name: "Self Assessment", status: "completed" });
        }

        if (supEval) {
            stages.push({ stage: 2, name: "Supervisor Evaluation", status: stage2 ? "shortlisted" : "evaluated" });
            if (stage2) currentStage = 2;
        } else if (stage1) {
            stages.push({ stage: 2, name: "Supervisor Evaluation", status: "pending" });
        }

        if (bmEval) {
            stages.push({ stage: 3, name: "Branch Manager Evaluation", status: stage3 ? "shortlisted" : "evaluated" });
            if (stage3) currentStage = 3;
        } else if (stage2) {
            stages.push({ stage: 3, name: "Branch Manager Evaluation", status: "pending" });
        }

        if (cmEval) {
            stages.push({ stage: 4, name: "Cluster Manager Evaluation", status: bestEmployee ? "winner" : "evaluated" });
            if (bestEmployee) currentStage = 4;
        } else if (stage3) {
            stages.push({ stage: 4, name: "Cluster Manager Evaluation", status: "pending" });
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
                    isCurrentUser: be.userId === userId,
                };
            }
        }

        return ok({
            quarter: { id: quarter.id, name: quarter.name, status: quarter.status },
            submitted: !!selfAssessment,
            selfAssessment: selfAssessment
                ? {
                    submittedAt: selfAssessment.submittedAt,
                    answers: answersWithQuestions,
                }
                : null,
            currentStage,
            isBestEmployee: !!bestEmployee,
            stages,
            winner,
        });
    } catch (err) {
        console.error("Employee current-status error:", err);
        return serverError();
    }
});
