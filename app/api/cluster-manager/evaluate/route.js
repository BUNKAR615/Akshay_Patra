export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../lib/prisma";
import { withRole } from "../../../../lib/withRole";
import { created, fail, notFound, conflict, serverError, validateBody } from "../../../../lib/api-response";
import { evaluateSchema } from "../../../../lib/validators";
import { createNotification } from "../../../../lib/notifications";
import { normalizeScore, calculateFinalScore } from "../../../../lib/scoreCalculator";
import { getEvaluatorPool } from "../../../../lib/evaluatorPool";

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

        const hasAccess = await prisma.departmentRoleMapping.findFirst({
            where: { userId: user.userId, departmentId: employee.departmentId, role: "CLUSTER_MANAGER" }
        });
        if (!hasAccess) return fail("You are not assigned to evaluate this department.");

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

        // Prior scores come from ShortlistStage3 (multi-evaluator-safe averages).
        if (!shortlistEntry) return fail("Employee's prior evaluation scores not found. Earlier stages may be incomplete.");

        const { selfContribution, supervisorContribution, bmContribution, cmContribution, finalScore } = calculateFinalScore(
            shortlistEntry.selfScore,
            shortlistEntry.supervisorScore,
            shortlistEntry.bmScore,
            cmNormalized
        );

        const result = await prisma.$transaction(async (tx) => {
            const evaluation = await tx.clusterManagerEvaluation.create({
                data: { clusterId: user.userId, employeeId: data.employeeId, quarterId: activeQuarter.id, answers: data.answers, cmRawScore, cmNormalized, selfContribution, supervisorContribution, bmContribution, cmContribution, finalScore },
            });

            // ── Multi-evaluator safe Best Employee selection ──
            // Winner is chosen only when EVERY mapped CM has evaluated EVERY
            // Stage 3 shortlisted employee. CM scores are averaged across CMs.
            const evaluatorPool = await getEvaluatorPool(tx, employee.departmentId, "CLUSTER_MANAGER");
            const stage3List = await tx.shortlistStage3.findMany({
                where: { departmentId: employee.departmentId, quarterId: activeQuarter.id },
                select: { userId: true, selfScore: true, supervisorScore: true, bmScore: true },
            });
            const shortlistCount = stage3List.length;
            const shortlistIds = stage3List.map((s) => s.userId);
            const stage3ByUser = new Map(stage3List.map((s) => [s.userId, s]));

            const myEvaluatedCount = await tx.clusterManagerEvaluation.count({
                where: { clusterId: user.userId, quarterId: activeQuarter.id, employee: { departmentId: employee.departmentId } },
            });

            const totalEvalCount = await tx.clusterManagerEvaluation.count({
                where: { quarterId: activeQuarter.id, employee: { departmentId: employee.departmentId }, employeeId: { in: shortlistIds } },
            });
            const expectedCount = evaluatorPool.length * shortlistCount;

            // ── Freeze check: if a BestEmployee already exists for this dept,
            // do not overwrite it.
            const existingBest = await tx.bestEmployee.count({
                where: { quarterId: activeQuarter.id, departmentId: employee.departmentId },
            });

            let bestEmployeeSelected = false;
            let bestEmployeeData = null;

            if (existingBest === 0 && shortlistCount > 0 && evaluatorPool.length > 0 && totalEvalCount >= expectedCount) {
                const allEvals = await tx.clusterManagerEvaluation.findMany({
                    where: { quarterId: activeQuarter.id, employee: { departmentId: employee.departmentId }, employeeId: { in: shortlistIds } },
                    select: { employeeId: true, cmNormalized: true },
                });
                const perEmployee = new Map();
                for (const ev of allEvals) {
                    const acc = perEmployee.get(ev.employeeId) || { sum: 0, n: 0 };
                    acc.sum += ev.cmNormalized;
                    acc.n += 1;
                    perEmployee.set(ev.employeeId, acc);
                }

                const selfAssessments = await tx.selfAssessment.findMany({
                    where: { quarterId: activeQuarter.id, userId: { in: shortlistIds } },
                    select: { userId: true, completionTimeSeconds: true },
                });
                const timeByUser = new Map(selfAssessments.map((s) => [s.userId, s.completionTimeSeconds || 0]));

                const ranked = shortlistIds.map((empId) => {
                    const agg = perEmployee.get(empId) || { sum: 0, n: 0 };
                    const avgCmNormalized = agg.n > 0 ? Math.round((agg.sum / agg.n) * 100) / 100 : 0;
                    const s3 = stage3ByUser.get(empId);
                    const { finalScore: combinedFinal } = calculateFinalScore(
                        s3?.selfScore || 0,
                        s3?.supervisorScore || 0,
                        s3?.bmScore || 0,
                        avgCmNormalized
                    );
                    return {
                        employeeId: empId,
                        selfScore: s3?.selfScore || 0,
                        supervisorScore: s3?.supervisorScore || 0,
                        bmScore: s3?.bmScore || 0,
                        cmScore: avgCmNormalized,
                        finalScore: combinedFinal,
                        completionTime: timeByUser.get(empId) || 0,
                    };
                }).sort((a, b) => {
                    if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
                    return a.completionTime - b.completionTime;
                });

                if (ranked.length > 0) {
                    const winner = ranked[0];
                    await tx.bestEmployee.deleteMany({ where: { quarterId: activeQuarter.id, departmentId: employee.departmentId } });

                    bestEmployeeData = await tx.bestEmployee.create({
                        data: {
                            userId: winner.employeeId, quarterId: activeQuarter.id, departmentId: employee.departmentId,
                            selfScore: winner.selfScore, supervisorScore: winner.supervisorScore, bmScore: winner.bmScore,
                            cmScore: winner.cmScore, finalScore: winner.finalScore,
                        },
                        include: { user: { select: { id: true, name: true } } },
                    });
                    bestEmployeeSelected = true;
                }
            }

            return { evaluation, bestEmployeeSelected, bestEmployeeData, evaluatedCount: myEvaluatedCount, shortlistCount };
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
            evaluation: { id: result.evaluation.id, employeeId: data.employeeId, submittedAt: result.evaluation.submittedAt, evaluated: true },
            progress: { evaluated: result.evaluatedCount, total: result.shortlistCount, remaining: result.shortlistCount - result.evaluatedCount },
        };

        if (result.bestEmployeeSelected) {
            // BLIND SCORING: Only expose winner identity, no scores
            response.bestEmployee = { 
                message: "🏆 Best Employee of the Quarter has been determined for the department!", 
                winner: { userId: result.bestEmployeeData.userId, name: result.bestEmployeeData.user.name } 
            };

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
