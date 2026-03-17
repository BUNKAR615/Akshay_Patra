import prisma from "../../../../lib/prisma";
import { withRole } from "../../../../lib/withRole";
import { ok, serverError } from "../../../../lib/api-response";

/**
 * GET /api/employee/history
 *
 * Returns all past quarters where the employee participated,
 * including their score and how far they progressed through the pipeline.
 */
export const GET = withRole(["EMPLOYEE"], async (request, { user }) => {
    try {
        const userId = user.userId;

        // All self-assessments for this employee across all quarters
        const assessments = await prisma.selfAssessment.findMany({
            where: { userId },
            include: {
                quarter: { select: { id: true, name: true, status: true, startDate: true, endDate: true } },
            },
            orderBy: { submittedAt: "desc" },
        });

        const history = [];

        for (const assessment of assessments) {
            const qId = assessment.quarterId;

            // Check Stage 1 shortlist
            const stage1 = await prisma.shortlistStage1.findFirst({
                where: { userId, quarterId: qId },
                select: { rank: true },
            });

            // Check Stage 2 shortlist
            const stage2 = await prisma.shortlistStage2.findFirst({
                where: { userId, quarterId: qId },
                select: { rank: true, combinedScore: true },
            });

            // Check Stage 3 shortlist
            const stage3 = await prisma.shortlistStage3.findFirst({
                where: { userId, quarterId: qId },
                select: { rank: true, combinedScore: true },
            });

            // Check if Best Employee
            const bestEmployee = await prisma.bestEmployee.findFirst({
                where: { userId, quarterId: qId },
                select: { finalScore: true },
            });

            // Determine highest stage reached
            let highestStage = 1; // Submitted self-assessment = Stage 1
            if (stage1) highestStage = 1;
            if (stage2) highestStage = 2;
            if (stage3) highestStage = 3;
            if (bestEmployee) highestStage = 4;

            // Also check if they had supervisor/BM/CM evaluations even if
            // they didn't make it to the next shortlist
            const supEval = await prisma.supervisorEvaluation.findFirst({
                where: { employeeId: userId, quarterId: qId },
                select: { combinedScore: true },
            });
            const bmEval = await prisma.branchManagerEvaluation.findFirst({
                where: { employeeId: userId, quarterId: qId },
                select: { combinedScore: true },
            });
            const cmEval = await prisma.clusterManagerEvaluation.findFirst({
                where: { employeeId: userId, quarterId: qId },
                select: { finalScore: true },
            });

            history.push({
                quarter: assessment.quarter,
                selfScore: assessment.totalScore,
                submittedAt: assessment.submittedAt,
                stage1Rank: stage1?.rank || null,
                stage2Rank: stage2?.rank || null,
                stage3Rank: stage3?.rank || null,
                supervisorScore: supEval?.combinedScore || null,
                bmScore: bmEval?.combinedScore || null,
                cmFinalScore: cmEval?.finalScore || null,
                isBestEmployee: !!bestEmployee,
                bestEmployeeFinalScore: bestEmployee?.finalScore || null,
                highestStage,
                stageLabels: {
                    1: "Self Assessment",
                    2: "Supervisor Evaluation",
                    3: "Branch Manager Evaluation",
                    4: "Cluster Manager / Best Employee",
                },
            });
        }

        return ok({ totalQuarters: history.length, history });
    } catch (err) {
        console.error("Employee history error:", err);
        return serverError();
    }
});
