import prisma from "../../../../lib/prisma";
import { withRole } from "../../../../lib/withRole";
import { created, fail, notFound, conflict, serverError, validateBody } from "../../../../lib/api-response";
import { evaluateSchema } from "../../../../lib/validators";
import { createNotification } from "../../../../lib/notifications";
import { normalizeScore, calculateFinalScore } from "../../../../lib/scoreCalculator";

/**
 * POST /api/cluster-manager/evaluate
 * Guards: no active quarter, employee not in Stage 3,
 * duplicate evaluation, shortlist not ready, missing prior scores.
 */
export const POST = withRole(["CLUSTER_MANAGER"], async (request, { user }) => {
    try {
        const { data, error } = await validateBody(request, evaluateSchema);
        if (error) return error;

        const activeQuarter = await prisma.quarter.findFirst({ where: { status: "ACTIVE" } });
        if (!activeQuarter) return notFound("No active quarter. Evaluations are closed.");

        const employee = await prisma.user.findUnique({ where: { id: data.employeeId }, select: { id: true, departmentId: true } });
        if (!employee) return notFound("Employee not found");

        // Guard: employee in Stage 3 shortlist
        const shortlistEntry = await prisma.shortlistStage3.findFirst({
            where: { userId: data.employeeId, quarterId: activeQuarter.id, departmentId: employee.departmentId },
        });
        if (!shortlistEntry) return fail("Employee is not in the Stage 3 shortlist. Branch Manager evaluations may not be complete.");

        // Guard: duplicate
        const existing = await prisma.clusterManagerEvaluation.findUnique({
            where: { clusterId_employeeId_quarterId: { clusterId: user.userId, employeeId: data.employeeId, quarterId: activeQuarter.id } },
        });
        if (existing) return conflict(`Already evaluated this employee on ${existing.submittedAt.toISOString()}`);

        // Validate answers
        const locked = await prisma.quarterQuestion.findMany({
            where: { quarterId: activeQuarter.id, question: { level: "CLUSTER_MANAGER" } }, select: { questionId: true },
        });
        const lockedIds = new Set(locked.map((q) => q.questionId));
        if (data.answers.length !== lockedIds.size) return fail(`Must answer all ${lockedIds.size} questions. Received ${data.answers.length}.`);
        const seen = new Set();
        for (const a of data.answers) {
            if (seen.has(a.questionId)) return fail(`Duplicate answer for question ${a.questionId}`);
            if (!lockedIds.has(a.questionId)) return fail(`Question "${a.questionId}" is not part of this quarter's CM questions`);
            seen.add(a.questionId);
        }

        const cmRawScore = data.answers.reduce((s, a) => s + a.score, 0);
        const cmNormalized = normalizeScore(cmRawScore, lockedIds.size);

        // Guard: all prior scores exist
        const selfA = await prisma.selfAssessment.findUnique({ where: { userId_quarterId: { userId: data.employeeId, quarterId: activeQuarter.id } }, select: { normalizedScore: true } });
        const supEval = await prisma.supervisorEvaluation.findFirst({ where: { employeeId: data.employeeId, quarterId: activeQuarter.id }, select: { supervisorNormalized: true } });
        const bmEval = await prisma.branchManagerEvaluation.findFirst({ where: { employeeId: data.employeeId, quarterId: activeQuarter.id }, select: { bmNormalized: true } });
        if (!selfA || !supEval || !bmEval) return fail("Employee's prior evaluation scores not found. Earlier stages may be incomplete.");

        const { selfContribution, supervisorContribution, bmContribution, cmContribution, finalScore } = calculateFinalScore(
            selfA.normalizedScore,
            supEval.supervisorNormalized,
            bmEval.bmNormalized,
            cmNormalized
        );

        const result = await prisma.$transaction(async (tx) => {
            const evaluation = await tx.clusterManagerEvaluation.create({
                data: { clusterId: user.userId, employeeId: data.employeeId, quarterId: activeQuarter.id, answers: data.answers, cmRawScore, cmNormalized, selfContribution, supervisorContribution, bmContribution, cmContribution, finalScore },
            });

            const shortlistCount = await tx.shortlistStage3.count({ where: { departmentId: employee.departmentId, quarterId: activeQuarter.id } });
            const evaluatedCount = await tx.clusterManagerEvaluation.count({
                where: { clusterId: user.userId, quarterId: activeQuarter.id, employee: { departmentId: employee.departmentId } }
            });

            let bestEmployeeSelected = false;
            let bestEmployeeData = null;

            if (evaluatedCount >= shortlistCount) {
                const allEvals = await tx.clusterManagerEvaluation.findMany({
                    where: { clusterId: user.userId, quarterId: activeQuarter.id, employee: { departmentId: employee.departmentId } },
                    orderBy: { finalScore: "desc" },
                    take: 1
                });

                if (allEvals.length > 0) {
                    const winner = allEvals[0];
                    const wSelf = await tx.selfAssessment.findUnique({ where: { userId_quarterId: { userId: winner.employeeId, quarterId: activeQuarter.id } }, select: { normalizedScore: true } });
                    const wSup = await tx.supervisorEvaluation.findFirst({ where: { employeeId: winner.employeeId, quarterId: activeQuarter.id }, select: { supervisorNormalized: true } });
                    const wBM = await tx.branchManagerEvaluation.findFirst({ where: { employeeId: winner.employeeId, quarterId: activeQuarter.id }, select: { bmNormalized: true } });

                    // Only one winner per department per quarter
                    // Note: Schema says BestEmployee quarterId is unique globally? Let's verify but typically it's unique per quarter per dept
                    await tx.bestEmployee.deleteMany({ where: { quarterId: activeQuarter.id, departmentId: employee.departmentId } });

                    bestEmployeeData = await tx.bestEmployee.create({
                        data: {
                            userId: winner.employeeId, quarterId: activeQuarter.id, departmentId: employee.departmentId,
                            selfScore: wSelf?.normalizedScore || 0, supervisorScore: wSup?.supervisorNormalized || 0, bmScore: wBM?.bmNormalized || 0,
                            cmScore: winner.cmNormalized, finalScore: winner.finalScore,
                        },
                        include: { user: { select: { id: true, name: true, email: true } } },
                    });
                    bestEmployeeSelected = true;
                }
            }

            return { evaluation, bestEmployeeSelected, bestEmployeeData, evaluatedCount, shortlistCount };
        });

        await prisma.auditLog.create({
            data: {
                userId: user.userId,
                action: result.bestEmployeeSelected ? "BEST_EMPLOYEE_SELECTED" : "CM_EVALUATION_SUBMITTED",
                details: {
                    evaluationId: result.evaluation.id, employeeId: data.employeeId, quarterId: activeQuarter.id,
                    cmScore: cmNormalized, finalScore, progress: `${result.evaluatedCount}/${result.shortlistCount}`,
                    bestEmployee: result.bestEmployeeData ? { userId: result.bestEmployeeData.userId, finalScore: result.bestEmployeeData.finalScore } : null,
                },
            },
        });

        const response = {
            message: "Evaluation submitted successfully",
            evaluation: { id: result.evaluation.id, employeeId: data.employeeId, cmScore: cmNormalized, finalScore, submittedAt: result.evaluation.submittedAt },
            progress: { evaluated: result.evaluatedCount, total: result.shortlistCount, remaining: result.shortlistCount - result.evaluatedCount },
        };

        if (result.bestEmployeeSelected) {
            response.bestEmployee = { message: "🏆 Best Employee of the Quarter has been determined for the department!", winner: result.bestEmployeeData };

            // Notify the winner
            await createNotification(
                result.bestEmployeeData.userId,
                `🏆 Congratulations! You are the Best Employee of ${activeQuarter.name} from your department!`
            );
        }

        return created(response);
    } catch (err) {
        console.error("CM evaluate error:", err);
        return serverError();
    }
});
