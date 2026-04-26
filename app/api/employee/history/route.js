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
 *
 * Implementation: a single batched query per related table (rather than per
 * quarter) keeps this O(1) round-trips regardless of history length.
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

        if (assessments.length === 0) {
            return ok({ totalQuarters: 0, history: [] });
        }

        const quarterIds = assessments.map((a) => a.quarterId);
        const baseFilter = { userId, quarterId: { in: quarterIds } };
        const evalFilter = { employeeId: userId, quarterId: { in: quarterIds } };

        // Fan out a single existence query per table, in parallel.
        const [
            stage1Rows,
            stage2Rows,
            stage3Rows,
            bestEmployeeRows,
            supEvalRows,
            bmEvalRows,
            cmEvalRows,
        ] = await Promise.all([
            prisma.shortlistStage1.findMany({ where: baseFilter, select: { quarterId: true } }),
            prisma.shortlistStage2.findMany({ where: baseFilter, select: { quarterId: true } }),
            prisma.shortlistStage3.findMany({ where: baseFilter, select: { quarterId: true } }),
            prisma.bestEmployee.findMany({ where: baseFilter, select: { quarterId: true } }),
            prisma.supervisorEvaluation.findMany({ where: evalFilter, select: { quarterId: true } }),
            prisma.branchManagerEvaluation.findMany({ where: evalFilter, select: { quarterId: true } }),
            prisma.clusterManagerEvaluation.findMany({ where: evalFilter, select: { quarterId: true } }),
        ]);

        const toSet = (rows) => new Set(rows.map((r) => r.quarterId));
        const stage1Set = toSet(stage1Rows);
        const stage2Set = toSet(stage2Rows);
        const stage3Set = toSet(stage3Rows);
        const bestSet = toSet(bestEmployeeRows);
        // supEval / bmEval / cmEval sets are computed but currently unused in the
        // response shape (kept for forward compatibility — see stageLabels below).
        void supEvalRows; void bmEvalRows; void cmEvalRows;

        const history = assessments.map((assessment) => {
            const qId = assessment.quarterId;

            // Determine highest stage reached
            let highestStage = 1; // Submitted self-assessment = Stage 1
            if (stage1Set.has(qId)) highestStage = 1;
            if (stage2Set.has(qId)) highestStage = 2;
            if (stage3Set.has(qId)) highestStage = 3;
            if (bestSet.has(qId)) highestStage = 4;

            // BLIND SCORING: No ranks or scores exposed to employees
            return {
                quarter: assessment.quarter,
                submittedAt: assessment.submittedAt,
                isBestEmployee: bestSet.has(qId),
                highestStage,
                stageLabels: {
                    1: "Self Assessment",
                    2: "Branch Manager / HOD Evaluation",
                    3: "Cluster Manager Evaluation",
                    4: "HR Evaluation",
                    5: "Committee Selection",
                },
            };
        });

        return ok({ totalQuarters: history.length, history });
    } catch (err) {
        console.error("Employee history error:", err);
        return serverError();
    }
});
