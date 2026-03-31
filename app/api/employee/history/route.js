export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

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

            // Check Stage 1 shortlist (existence only, no scores/ranks)
            const stage1 = await prisma.shortlistStage1.findFirst({
                where: { userId, quarterId: qId },
                select: { id: true },
            });

            // Check Stage 2 shortlist (existence only)
            const stage2 = await prisma.shortlistStage2.findFirst({
                where: { userId, quarterId: qId },
                select: { id: true },
            });

            // Check Stage 3 shortlist (existence only)
            const stage3 = await prisma.shortlistStage3.findFirst({
                where: { userId, quarterId: qId },
                select: { id: true },
            });

            // Check if Best Employee
            const bestEmployee = await prisma.bestEmployee.findFirst({
                where: { userId, quarterId: qId },
                select: { id: true },
            });

            // Determine highest stage reached
            let highestStage = 1; // Submitted self-assessment = Stage 1
            if (stage1) highestStage = 1;
            if (stage2) highestStage = 2;
            if (stage3) highestStage = 3;
            if (bestEmployee) highestStage = 4;

            // Also check if they had supervisor/BM/CM evaluations even if
            // they didn't make it to the next shortlist (existence only, no scores)
            const supEval = await prisma.supervisorEvaluation.findFirst({
                where: { employeeId: userId, quarterId: qId },
                select: { id: true },
            });
            const bmEval = await prisma.branchManagerEvaluation.findFirst({
                where: { employeeId: userId, quarterId: qId },
                select: { id: true },
            });
            const cmEval = await prisma.clusterManagerEvaluation.findFirst({
                where: { employeeId: userId, quarterId: qId },
                select: { id: true },
            });

            // BLIND SCORING: No ranks or scores exposed to employees
            history.push({
                quarter: assessment.quarter,
                submittedAt: assessment.submittedAt,
                isBestEmployee: !!bestEmployee,
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
