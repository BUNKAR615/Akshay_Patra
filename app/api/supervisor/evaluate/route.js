export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../lib/prisma";
import { withRole } from "../../../../lib/withRole";
import { created, fail, notFound, conflict, serverError, validateBody } from "../../../../lib/api-response";
import { evaluateSchema } from "../../../../lib/validators";
import { createNotification } from "../../../../lib/notifications";
import { getDepartmentSize, logSmallDepartmentRule } from "../../../../lib/department-rules";
import { normalizeScore, calculateStage2Score } from "../../../../lib/scoreCalculator";
import { getEvaluatorPool } from "../../../../lib/evaluatorPool";

/**
 * POST /api/supervisor/evaluate
 * Guards: no active quarter, employee not in shortlist, not in supervisor's dept,
 * duplicate evaluation, invalid answers, shortlist not ready.
 */
export const POST = withRole(["SUPERVISOR"], async (request, { user }) => {
    try {
        const { data, error } = await validateBody(request, evaluateSchema);
        if (error) return error;

        const activeQuarter = await prisma.quarter.findFirst({ where: { status: "ACTIVE" } });
        if (!activeQuarter) return notFound("No active quarter. Evaluations are closed.");

        // Guard: employee exists
        const employee = await prisma.user.findUnique({ where: { id: data.employeeId }, select: { id: true, departmentId: true } });
        if (!employee) return notFound("Employee not found");

        // Guard: supervisor must be assigned to the employee's department via DRM
        const deptMapping = await prisma.departmentRoleMapping.findFirst({
            where: { userId: user.userId, departmentId: employee.departmentId, role: "SUPERVISOR" },
        });
        if (!deptMapping) {
            // Legacy fallback: allow if user's primary department matches AND role is SUPERVISOR
            const supervisor = await prisma.user.findUnique({
                where: { id: user.userId },
                select: { departmentId: true, role: true },
            });
            if (!(supervisor && supervisor.role === "SUPERVISOR" && supervisor.departmentId === employee.departmentId)) {
                return fail("You are not assigned as supervisor to this employee's department", 403);
            }
        }

        const evaluatingDeptId = employee.departmentId;

        // Guard: employee must be in Stage 1 shortlist
        const shortlistEntry = await prisma.shortlistStage1.findFirst({
            where: { userId: data.employeeId, quarterId: activeQuarter.id, departmentId: evaluatingDeptId },
        });
        if (!shortlistEntry) return fail("Employee is not in the Stage 1 shortlist for your department. The shortlist may not have been generated yet.");

        // Guard: duplicate evaluation
        const existing = await prisma.supervisorEvaluation.findUnique({
            where: { supervisorId_employeeId_quarterId: { supervisorId: user.userId, employeeId: data.employeeId, quarterId: activeQuarter.id } },
        });
        if (existing) return conflict(`Already evaluated this employee on ${existing.submittedAt.toISOString()}`);

        // Validate answers against locked SUPERVISOR questions
        const locked = await prisma.quarterQuestion.findMany({
            where: { quarterId: activeQuarter.id, question: { level: "SUPERVISOR" } },
            select: { questionId: true },
        });
        const lockedIds = new Set(locked.map((q) => q.questionId));

        if (data.answers.length !== lockedIds.size) return fail(`Must answer all ${lockedIds.size} questions. Received ${data.answers.length}.`);
        const seen = new Set();
        for (const a of data.answers) {
            if (seen.has(a.questionId)) return fail(`Duplicate answer for question ${a.questionId}`);
            if (!lockedIds.has(a.questionId)) return fail(`Question "${a.questionId}" is not part of this quarter's supervisor questions`);
            seen.add(a.questionId);
        }

        const supervisorRawScore = data.answers.reduce((s, a) => s + a.score, 0);
        const supervisorNormalized = normalizeScore(supervisorRawScore, lockedIds.size);

        const selfAssessment = await prisma.selfAssessment.findUnique({
            where: { userId_quarterId: { userId: data.employeeId, quarterId: activeQuarter.id } },
            select: { normalizedScore: true },
        });
        if (!selfAssessment) return fail("Employee's self-assessment not found. They may not have submitted yet.");

        const { selfContribution, supervisorContribution, combined } = calculateStage2Score(
            selfAssessment.normalizedScore,
            supervisorNormalized
        );

        const result = await prisma.$transaction(async (tx) => {
            const evaluation = await tx.supervisorEvaluation.create({
                data: {
                    supervisorId: user.userId, employeeId: data.employeeId, quarterId: activeQuarter.id, answers: data.answers,
                    supervisorRawScore, supervisorNormalized, selfContribution, supervisorContribution, stage2CombinedScore: combined
                },
            });

            // ── Multi-evaluator safe Stage 2 trigger ──
            // Stage 2 is created only when EVERY mapped supervisor has evaluated
            // EVERY Stage 1 shortlisted employee. Scores are averaged across
            // supervisors so a later-finishing evaluator can't overwrite an earlier one.
            const evaluatorPool = await getEvaluatorPool(tx, evaluatingDeptId, "SUPERVISOR");
            const shortlist = await tx.shortlistStage1.findMany({
                where: { departmentId: evaluatingDeptId, quarterId: activeQuarter.id },
                select: { userId: true },
            });
            const shortlistCount = shortlist.length;
            const shortlistIds = shortlist.map((s) => s.userId);

            // Count this supervisor's progress (for the response payload only)
            const myEvaluatedCount = await tx.supervisorEvaluation.count({
                where: { supervisorId: user.userId, quarterId: activeQuarter.id, employee: { departmentId: evaluatingDeptId } },
            });

            // Total evaluations submitted for this dept across ALL supervisors
            const totalEvalCount = await tx.supervisorEvaluation.count({
                where: { quarterId: activeQuarter.id, employee: { departmentId: evaluatingDeptId }, employeeId: { in: shortlistIds } },
            });
            const expectedCount = evaluatorPool.length * shortlistCount;

            let stage2Created = false;
            if (shortlistCount > 0 && evaluatorPool.length > 0 && totalEvalCount >= expectedCount) {
                // Aggregate: average each employee's supervisor score across all evaluators
                const allEvals = await tx.supervisorEvaluation.findMany({
                    where: { quarterId: activeQuarter.id, employee: { departmentId: evaluatingDeptId }, employeeId: { in: shortlistIds } },
                    select: { employeeId: true, supervisorNormalized: true },
                });
                const perEmployee = new Map();
                for (const ev of allEvals) {
                    const acc = perEmployee.get(ev.employeeId) || { sum: 0, n: 0 };
                    acc.sum += ev.supervisorNormalized;
                    acc.n += 1;
                    perEmployee.set(ev.employeeId, acc);
                }

                // Tie-break by self-assessment completion time (ascending)
                const selfAssessments = await tx.selfAssessment.findMany({
                    where: { quarterId: activeQuarter.id, userId: { in: shortlistIds } },
                    select: { userId: true, normalizedScore: true, completionTimeSeconds: true },
                });
                const selfByUser = new Map(selfAssessments.map((s) => [s.userId, s]));

                const ranked = shortlistIds.map((empId) => {
                    const agg = perEmployee.get(empId) || { sum: 0, n: 0 };
                    const avgSupervisorNormalized = agg.n > 0 ? Math.round((agg.sum / agg.n) * 100) / 100 : 0;
                    const sa = selfByUser.get(empId);
                    const selfNorm = sa?.normalizedScore || 0;
                    const { combined } = calculateStage2Score(selfNorm, avgSupervisorNormalized);
                    return {
                        employeeId: empId,
                        avgSupervisorNormalized,
                        selfNormalized: selfNorm,
                        combinedScore: combined,
                        completionTime: sa?.completionTimeSeconds || 0,
                    };
                }).sort((a, b) => {
                    if (b.combinedScore !== a.combinedScore) return b.combinedScore - a.combinedScore;
                    return a.completionTime - b.completionTime;
                });

                // Apply small-department Stage 2 size limit
                const deptLimits = await getDepartmentSize(evaluatingDeptId);
                const topK = deptLimits.stage2Limit !== null ? ranked.slice(0, deptLimits.stage2Limit) : ranked;

                await tx.shortlistStage2.deleteMany({ where: { departmentId: evaluatingDeptId, quarterId: activeQuarter.id } });
                for (let i = 0; i < topK.length; i++) {
                    const r = topK[i];
                    await tx.shortlistStage2.create({
                        data: {
                            userId: r.employeeId,
                            quarterId: activeQuarter.id,
                            departmentId: evaluatingDeptId,
                            selfScore: r.selfNormalized,
                            supervisorScore: r.avgSupervisorNormalized,
                            combinedScore: r.combinedScore,
                            rank: i + 1,
                        },
                    });
                }
                stage2Created = true;

                if (deptLimits.caseNumber > 0) {
                    logSmallDepartmentRule({
                        userId: user.userId, departmentId: evaluatingDeptId,
                        caseNumber: deptLimits.caseNumber, totalEmployees: deptLimits.totalEmployees,
                        quarterId: activeQuarter.id, action: "SMALL_DEPT_STAGE2_AUTO_PROMOTE",
                    });
                }
            }

            return { evaluation, stage2Created, evaluatedCount: myEvaluatedCount, shortlistCount };
        });

        console.log("Saved to DB (Supervisor Evaluation):", result.evaluation);

        await prisma.auditLog.create({
            data: { userId: user.userId, action: "EVALUATION_SUBMITTED", details: { employeeId: data.employeeId, quarterId: activeQuarter.id, level: "SUPERVISOR", score: supervisorNormalized, evaluationId: result.evaluation.id, combinedScore: combined, progress: `${result.evaluatedCount}/${result.shortlistCount}`, stage2Generated: result.stage2Created } },
        });

        const response = {
            message: "Evaluation submitted successfully",
            evaluation: { id: result.evaluation.id, employeeId: data.employeeId, submittedAt: result.evaluation.submittedAt, evaluated: true },
            progress: { evaluated: result.evaluatedCount, total: result.shortlistCount, remaining: result.shortlistCount - result.evaluatedCount },
        };

        if (result.stage2Created) {
            const stage2 = await prisma.shortlistStage2.findMany({
                where: { departmentId: evaluatingDeptId, quarterId: activeQuarter.id },
                select: { userId: true, user: { select: { id: true, name: true } } },
            });
            // BLIND SCORING: Only expose names, no scores/ranks/emails
            const sanitizedShortlist = stage2.map(s => ({ userId: s.userId, name: s.user.name }));
            response.stage2Shortlist = { message: "All done! Top employees auto-selected for Stage 2.", shortlist: sanitizedShortlist };

            // Notify shortlisted employees
            await createNotification(
                stage2.map((s) => s.userId),
                `You have been shortlisted for Stage 2 (Supervisor Evaluation) in ${activeQuarter.name}!`
            );
        }

        return created(response);
    } catch (err) {
        console.error("Supervisor evaluate error:", err);
        return serverError();
    }
});
