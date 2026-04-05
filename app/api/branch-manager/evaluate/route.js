export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../lib/prisma";
import { withRole } from "../../../../lib/withRole";
import { created, fail, notFound, conflict, serverError, validateBody } from "../../../../lib/api-response";
import { evaluateSchema } from "../../../../lib/validators";
import { createNotification } from "../../../../lib/notifications";
import { getDepartmentSize, logSmallDepartmentRule } from "../../../../lib/department-rules";
import { normalizeScore, calculateStage3Score } from "../../../../lib/scoreCalculator";
import { getEvaluatorPool } from "../../../../lib/evaluatorPool";

/**
 * POST /api/branch-manager/evaluate
 * Guards: no active quarter, employee not in Stage 2 shortlist, 
 * duplicate evaluation, shortlist not ready, missing prior scores.
 */
export const POST = withRole(["BRANCH_MANAGER"], async (request, { user }) => {
    try {
        const { data, error } = await validateBody(request, evaluateSchema);
        if (error) return error;

        const activeQuarter = await prisma.quarter.findFirst({ where: { status: "ACTIVE" } });
        if (!activeQuarter) return notFound("No active quarter. Evaluations are closed.");

        const employee = await prisma.user.findUnique({ where: { id: data.employeeId }, select: { id: true, departmentId: true } });
        if (!employee) return notFound("Employee not found");

        const hasAccess = await prisma.departmentRoleMapping.findFirst({
            where: { userId: user.userId, departmentId: employee.departmentId, role: "BRANCH_MANAGER" }
        });
        if (!hasAccess) return fail("You are not assigned to evaluate this department.");

        // Guard: employee in Stage 2 shortlist (for their department)
        const shortlistEntry = await prisma.shortlistStage2.findFirst({
            where: { userId: data.employeeId, quarterId: activeQuarter.id, departmentId: employee.departmentId },
        });
        if (!shortlistEntry) return fail("Employee is not in the Stage 2 shortlist. Supervisor evaluations may not be complete.");

        // Guard: duplicate
        const existing = await prisma.branchManagerEvaluation.findUnique({
            where: { managerId_employeeId_quarterId: { managerId: user.userId, employeeId: data.employeeId, quarterId: activeQuarter.id } },
        });
        if (existing) return conflict(`Already evaluated this employee on ${existing.submittedAt.toISOString()}`);

        // Validate answers
        const locked = await prisma.quarterQuestion.findMany({
            where: { quarterId: activeQuarter.id, question: { level: "BRANCH_MANAGER" } }, select: { questionId: true },
        });
        const lockedIds = new Set(locked.map((q) => q.questionId));
        if (data.answers.length !== lockedIds.size) return fail(`Must answer all ${lockedIds.size} questions. Received ${data.answers.length}.`);
        const seen = new Set();
        for (const a of data.answers) {
            if (seen.has(a.questionId)) return fail(`Duplicate answer for question ${a.questionId}`);
            if (!lockedIds.has(a.questionId)) return fail(`Question "${a.questionId}" is not part of this quarter's BM questions`);
            seen.add(a.questionId);
        }

        const bmRawScore = data.answers.reduce((s, a) => s + a.score, 0);
        const bmNormalized = normalizeScore(bmRawScore, lockedIds.size);

        // Guard: prior scores exist. Use ShortlistStage2 row as the source of
        // truth because it carries the averaged supervisor score across all
        // supervisors mapped to this department (multi-evaluator-safe).
        const selfA = await prisma.selfAssessment.findUnique({ where: { userId_quarterId: { userId: data.employeeId, quarterId: activeQuarter.id } }, select: { normalizedScore: true } });
        if (!selfA || !shortlistEntry) return fail("Employee's prior evaluation scores not found. Earlier stages may be incomplete.");

        const { selfContribution, supervisorContribution, bmContribution, combined } = calculateStage3Score(
            selfA.normalizedScore,
            shortlistEntry.supervisorScore,
            bmNormalized
        );

        const result = await prisma.$transaction(async (tx) => {
            const evaluation = await tx.branchManagerEvaluation.create({
                data: { managerId: user.userId, employeeId: data.employeeId, quarterId: activeQuarter.id, answers: data.answers, bmRawScore, bmNormalized, selfContribution, supervisorContribution, bmContribution, stage3CombinedScore: combined },
            });

            // ── Multi-evaluator safe Stage 3 trigger ──
            // Stage 3 is created only when EVERY mapped BM has evaluated EVERY
            // Stage 2 shortlisted employee. BM scores are averaged across BMs.
            const evaluatorPool = await getEvaluatorPool(tx, employee.departmentId, "BRANCH_MANAGER");
            const stage2List = await tx.shortlistStage2.findMany({
                where: { departmentId: employee.departmentId, quarterId: activeQuarter.id },
                select: { userId: true, selfScore: true, supervisorScore: true },
            });
            const shortlistCount = stage2List.length;
            const shortlistIds = stage2List.map((s) => s.userId);
            const stage2ByUser = new Map(stage2List.map((s) => [s.userId, s]));

            const myEvaluatedCount = await tx.branchManagerEvaluation.count({
                where: { managerId: user.userId, quarterId: activeQuarter.id, employee: { departmentId: employee.departmentId } },
            });

            const totalEvalCount = await tx.branchManagerEvaluation.count({
                where: { quarterId: activeQuarter.id, employee: { departmentId: employee.departmentId }, employeeId: { in: shortlistIds } },
            });
            const expectedCount = evaluatorPool.length * shortlistCount;

            let stage3Created = false;
            if (shortlistCount > 0 && evaluatorPool.length > 0 && totalEvalCount >= expectedCount) {
                const allEvals = await tx.branchManagerEvaluation.findMany({
                    where: { quarterId: activeQuarter.id, employee: { departmentId: employee.departmentId }, employeeId: { in: shortlistIds } },
                    select: { employeeId: true, bmNormalized: true },
                });
                const perEmployee = new Map();
                for (const ev of allEvals) {
                    const acc = perEmployee.get(ev.employeeId) || { sum: 0, n: 0 };
                    acc.sum += ev.bmNormalized;
                    acc.n += 1;
                    perEmployee.set(ev.employeeId, acc);
                }

                // Tie-break by self-assessment completion time
                const selfAssessments = await tx.selfAssessment.findMany({
                    where: { quarterId: activeQuarter.id, userId: { in: shortlistIds } },
                    select: { userId: true, completionTimeSeconds: true },
                });
                const timeByUser = new Map(selfAssessments.map((s) => [s.userId, s.completionTimeSeconds || 0]));

                const ranked = shortlistIds.map((empId) => {
                    const agg = perEmployee.get(empId) || { sum: 0, n: 0 };
                    const avgBmNormalized = agg.n > 0 ? Math.round((agg.sum / agg.n) * 100) / 100 : 0;
                    const s2 = stage2ByUser.get(empId);
                    const { combined } = calculateStage3Score(
                        s2?.selfScore || 0,
                        s2?.supervisorScore || 0,
                        avgBmNormalized
                    );
                    return {
                        employeeId: empId,
                        selfScore: s2?.selfScore || 0,
                        supervisorScore: s2?.supervisorScore || 0,
                        bmScore: avgBmNormalized,
                        combinedScore: combined,
                        completionTime: timeByUser.get(empId) || 0,
                    };
                }).sort((a, b) => {
                    if (b.combinedScore !== a.combinedScore) return b.combinedScore - a.combinedScore;
                    return a.completionTime - b.completionTime;
                });

                const deptLimits = await getDepartmentSize(employee.departmentId);
                const topK = deptLimits.stage3Limit !== null ? ranked.slice(0, deptLimits.stage3Limit) : ranked;

                await tx.shortlistStage3.deleteMany({ where: { departmentId: employee.departmentId, quarterId: activeQuarter.id } });
                for (let i = 0; i < topK.length; i++) {
                    const r = topK[i];
                    await tx.shortlistStage3.create({
                        data: {
                            userId: r.employeeId,
                            quarterId: activeQuarter.id,
                            departmentId: employee.departmentId,
                            selfScore: r.selfScore,
                            supervisorScore: r.supervisorScore,
                            bmScore: r.bmScore,
                            combinedScore: r.combinedScore,
                            rank: i + 1,
                        },
                    });
                }
                stage3Created = true;

                if (deptLimits.caseNumber > 0) {
                    logSmallDepartmentRule({
                        userId: user.userId, departmentId: employee.departmentId,
                        caseNumber: deptLimits.caseNumber, totalEmployees: deptLimits.totalEmployees,
                        quarterId: activeQuarter.id, action: "SMALL_DEPT_STAGE3_AUTO_PROMOTE",
                    });
                }
            }

            return { evaluation, stage3Created, evaluatedCount: myEvaluatedCount, shortlistCount };
        });

        await prisma.auditLog.create({
            data: { userId: user.userId, action: "BM_EVALUATION_SUBMITTED", details: { evaluationId: result.evaluation.id, employeeId: data.employeeId, quarterId: activeQuarter.id, bmScore: bmNormalized, combinedScore: combined, progress: `${result.evaluatedCount}/${result.shortlistCount}`, stage3Generated: result.stage3Created } },
        });

        const response = {
            message: "Evaluation submitted successfully",
            evaluation: { id: result.evaluation.id, employeeId: data.employeeId, submittedAt: result.evaluation.submittedAt, evaluated: true },
            progress: { evaluated: result.evaluatedCount, total: result.shortlistCount, remaining: result.shortlistCount - result.evaluatedCount },
        };

        if (result.stage3Created) {
            const stage3 = await prisma.shortlistStage3.findMany({
                where: { departmentId: employee.departmentId, quarterId: activeQuarter.id },
                select: { userId: true, user: { select: { id: true, name: true } } },
            });
            // BLIND SCORING: Only expose names, no scores/ranks/emails
            const sanitizedShortlist = stage3.map(s => ({ userId: s.userId, name: s.user.name }));
            response.stage3Shortlist = { message: "All done! Top employees auto-selected for Stage 3.", shortlist: sanitizedShortlist };

            // Notify shortlisted employees
            await createNotification(
                stage3.map((s) => s.userId),
                `You have been shortlisted for Stage 3 (Branch Manager Evaluation) in ${activeQuarter.name}!`
            );
        }

        return created(response);
    } catch (err) {
        console.error("BM evaluate error:", err);
        return serverError();
    }
});
