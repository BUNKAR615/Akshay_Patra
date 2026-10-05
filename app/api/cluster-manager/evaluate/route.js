export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../lib/prisma";
import { withRole } from "../../../../lib/withRole";
import { created, fail, notFound, conflict, validateBody, handleApiError } from "../../../../lib/api-response";
import { evaluateSchema } from "../../../../lib/validators";
import { createNotification } from "../../../../lib/notifications";
import { normalizeScore, calculateFinalScore, calculateBranchStage3Score, EVALUATOR_MAX_SCORE } from "../../../../lib/scoreCalculator";
import { getEvaluatorPool } from "../../../../lib/evaluatorPool";
import { regenerateBranchStage3 } from "../../../../lib/branchPromotion";
import { collarPrismaFilter, effectiveCollar } from "../../../../lib/questionCollar";
import { stageGate } from "../../../../lib/stageScheduler";
import { authorizeEvaluator, accessDeniedMessage, isBranchDefaultEvaluator, loadDelegationIndex, filterRowsForEvaluator } from "../../../../lib/evaluatorDelegation";

/**
 * POST /api/cluster-manager/evaluate
 * CM evaluates Stage 2 shortlisted employees (branch-level).
 * After CM completes, Stage 3 shortlist is generated → forwards to HR.
 * Also maintains legacy department-level flow for backward compatibility.
 */
export const POST = withRole(["CLUSTER_MANAGER"], async (request, { user }) => {
    try {
        const { data, error } = await validateBody(request, evaluateSchema);
        if (error) return error;

        const activeQuarter = await prisma.quarter.findFirst({ where: { status: "ACTIVE" } });
        if (!activeQuarter) return notFound("No active quarter. Evaluations are closed.");

        // Stage 3 must be the active stage (scheduled/paused/completed → closed).
        const gate = await stageGate(activeQuarter.id, 3);
        if (!gate.open) return fail(gate.message, 403);

        const employee = await prisma.user.findUnique({
            where: { id: data.employeeId },
            select: { id: true, departmentId: true, collarType: true, department: { select: { branchId: true, branch: { select: { branchType: true } } } } }
        });
        if (!employee) return notFound("Employee not found");

        const branchId = employee.department?.branchId;
        const branchType = employee.department?.branch?.branchType;

        // Authorization (server-side, source of truth): the branch-default CM
        // (ClusterManagerBranchAssignment), or the holder of the employee's
        // department CM POA — never the employee themselves.
        if (!branchId) return fail("Employee has no branch");
        const access = await authorizeEvaluator({
            userId: user.userId,
            type: "CLUSTER_MANAGER",
            employee: { id: employee.id, departmentId: employee.departmentId, branchId },
        });
        if (!access.allowed) {
            return fail(access.reason === "NOT_ASSIGNED"
                ? "You are not assigned to this branch"
                : accessDeniedMessage("CLUSTER_MANAGER", access.reason), 403);
        }

        // Check if employee is in branch Stage 2 shortlist (new flow)
        const branchStage2Entry = await prisma.branchShortlistStage2.findUnique({
            where: { userId_quarterId: { userId: data.employeeId, quarterId: activeQuarter.id } }
        });

        // Also check legacy Stage 3 shortlist
        const legacyShortlistEntry = await prisma.shortlistStage3.findFirst({
            where: { userId: data.employeeId, quarterId: activeQuarter.id, departmentId: employee.departmentId },
        });

        if (!branchStage2Entry && !legacyShortlistEntry) {
            return fail("Employee is not in Stage 2/3 shortlist. Previous evaluations may not be complete.");
        }

        // Duplicate check
        const existing = await prisma.clusterManagerEvaluation.findUnique({
            where: { clusterId_employeeId_quarterId: { clusterId: user.userId, employeeId: data.employeeId, quarterId: activeQuarter.id } },
        });
        if (existing) return conflict(`Already evaluated this employee on ${existing.submittedAt.toISOString()}`);

        // Branch-level flow: one Stage 3 evaluation per employee per quarter,
        // whoever submitted it (branch CM or department POA), so a POA change
        // mid-stage can never double-count an employee. (The legacy
        // department-pool flow below intentionally keeps multi-CM pools.)
        if (branchStage2Entry) {
            const other = await prisma.clusterManagerEvaluation.findFirst({
                where: { employeeId: data.employeeId, quarterId: activeQuarter.id },
                select: { id: true },
            });
            if (other) return conflict("This employee has already been evaluated for Stage 3 by another evaluator.");
        }

        // Validate answers against the CM question set, restricted to the
        // questions applicable to THIS employee's category (shared + own-collar)
        // — the same filter the CM dashboard applies before showing them.
        const empCollar = effectiveCollar(employee.collarType);
        const locked = await prisma.quarterQuestion.findMany({
            where: { quarterId: activeQuarter.id, question: { level: "CLUSTER_MANAGER", ...collarPrismaFilter(empCollar) } },
            select: { questionId: true },
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
        const cmNormalized = normalizeScore(cmRawScore, lockedIds.size, EVALUATOR_MAX_SCORE);

        // ── Branch-level flow (new) ──
        if (branchStage2Entry && branchId) {
            // Stage 2 stores selfScore as a 0-60 weighted contribution and
            // evaluatorScore as a 0-40 weighted contribution. Convert back to
            // the 0-100 normalized form expected by calculateBranchStage3Score.
            const selfNorm = (branchStage2Entry.selfScore / 60) * 100;
            const evaluatorNorm = (branchStage2Entry.evaluatorScore / 40) * 100;

            const { selfContribution, evaluatorContribution, cmContribution, combined } =
                calculateBranchStage3Score(selfNorm, evaluatorNorm, cmNormalized);

            const evaluation = await prisma.clusterManagerEvaluation.create({
                data: {
                    clusterId: user.userId,
                    employeeId: data.employeeId,
                    quarterId: activeQuarter.id,
                    answers: data.answers,
                    cmRawScore,
                    cmNormalized,
                    selfContribution,
                    supervisorContribution: evaluatorContribution,
                    bmContribution: 0,
                    cmContribution,
                    finalScore: combined,
                    viaDelegation: access.viaDelegation,
                },
            });

            // ── Partial promotion (Rule 1) + round-locking (Rule 2) ──
            // Rebuild the branch's Stage 3 shortlist from the CM evaluations
            // done so far (top-N per collar track, pruning anyone who dropped
            // out). No-ops once the HR round has started for this branch.
            const { locked: stage3Locked, added } = await regenerateBranchStage3(prisma, {
                branchId,
                branchType,
                quarterId: activeQuarter.id,
            });
            const stage3Generated = !stage3Locked && added.length > 0;
            for (const shortlistedId of added) {
                await createNotification(shortlistedId, "You have advanced to Stage 3! HR will evaluate next.")
                    .catch((err) => { console.error(`[CM-EVALUATE] Stage 3 notification failed for user ${shortlistedId}:`, err); });
            }

            // Progress for the CM UI (generation no longer waits for completion)
            // — over the employees of this branch this user evaluates (branch
            // default and/or department POA scope).
            const [branchStage2, cmIndex, cmIsDefault] = await Promise.all([
                prisma.branchShortlistStage2.findMany({
                    where: { branchId, quarterId: activeQuarter.id },
                    select: { userId: true, user: { select: { departmentId: true } } },
                }),
                loadDelegationIndex("CLUSTER_MANAGER", [branchId]),
                isBranchDefaultEvaluator(user.userId, "CLUSTER_MANAGER", branchId),
            ]);
            const allStage2 = filterRowsForEvaluator({
                userId: user.userId,
                rows: branchStage2.map((s) => ({ ...s, employeeId: s.userId, departmentId: s.user?.departmentId || null })),
                index: cmIndex,
                isBranchDefault: cmIsDefault,
            });
            const cmEvalCount = await prisma.clusterManagerEvaluation.count({
                where: {
                    quarterId: activeQuarter.id,
                    employeeId: { in: allStage2.map((s) => s.userId) },
                },
            });

            await prisma.auditLog.create({
                data: {
                    userId: user.userId,
                    action: stage3Generated ? "BRANCH_STAGE3_GENERATED" : "CM_EVALUATION_SUBMITTED",
                    details: { employeeId: data.employeeId, quarterId: activeQuarter.id, cmNormalized, combined, viaDelegation: access.viaDelegation }
                }
            }).catch((err) => { console.error("[CM-EVALUATE] Audit log failed:", err); });

            return created({
                message: "Evaluation submitted successfully",
                evaluation: { id: evaluation.id, employeeId: data.employeeId, evaluated: true },
                progress: { evaluated: cmEvalCount, total: allStage2.length },
                stage3Generated
            });
        }

        // ── Legacy department-level flow ──
        if (legacyShortlistEntry) {
            const { selfContribution, supervisorContribution, bmContribution, cmContribution, finalScore } = calculateFinalScore(
                legacyShortlistEntry.selfScore,
                legacyShortlistEntry.supervisorScore,
                legacyShortlistEntry.bmScore,
                cmNormalized
            );

            const result = await prisma.$transaction(async (tx) => {
                const evaluation = await tx.clusterManagerEvaluation.create({
                    data: { clusterId: user.userId, employeeId: data.employeeId, quarterId: activeQuarter.id, answers: data.answers, cmRawScore, cmNormalized, selfContribution, supervisorContribution, bmContribution, cmContribution, finalScore },
                });

                const evaluatorPool = await getEvaluatorPool(tx, employee.departmentId, "CLUSTER_MANAGER");
                const stage3List = await tx.shortlistStage3.findMany({
                    where: { departmentId: employee.departmentId, quarterId: activeQuarter.id },
                    select: { userId: true, selfScore: true, supervisorScore: true, bmScore: true },
                });
                const shortlistIds = stage3List.map((s) => s.userId);
                const stage3ByUser = new Map(stage3List.map((s) => [s.userId, s]));

                const myEvaluatedCount = await tx.clusterManagerEvaluation.count({
                    where: { clusterId: user.userId, quarterId: activeQuarter.id, employee: { departmentId: employee.departmentId } },
                });
                const totalEvalCount = await tx.clusterManagerEvaluation.count({
                    where: { quarterId: activeQuarter.id, employee: { departmentId: employee.departmentId }, employeeId: { in: shortlistIds } },
                });

                const existingBest = await tx.bestEmployee.count({
                    where: { quarterId: activeQuarter.id, departmentId: employee.departmentId },
                });

                let bestEmployeeSelected = false;
                let bestEmployeeData = null;
                if (existingBest === 0 && stage3List.length > 0 && evaluatorPool.length > 0 && totalEvalCount >= evaluatorPool.length * stage3List.length) {
                    const allEvals = await tx.clusterManagerEvaluation.findMany({
                        where: { quarterId: activeQuarter.id, employee: { departmentId: employee.departmentId }, employeeId: { in: shortlistIds } },
                        select: { employeeId: true, cmNormalized: true },
                    });
                    const perEmployee = new Map();
                    for (const ev of allEvals) {
                        const acc = perEmployee.get(ev.employeeId) || { sum: 0, n: 0 };
                        acc.sum += ev.cmNormalized; acc.n += 1;
                        perEmployee.set(ev.employeeId, acc);
                    }
                    const ranked = shortlistIds.map(empId => {
                        const agg = perEmployee.get(empId) || { sum: 0, n: 0 };
                        const avgCm = agg.n > 0 ? Math.round((agg.sum / agg.n) * 100) / 100 : 0;
                        const s3 = stage3ByUser.get(empId);
                        const { finalScore: f } = calculateFinalScore(s3?.selfScore || 0, s3?.supervisorScore || 0, s3?.bmScore || 0, avgCm);
                        return { employeeId: empId, selfScore: s3?.selfScore || 0, supervisorScore: s3?.supervisorScore || 0, bmScore: s3?.bmScore || 0, cmScore: avgCm, finalScore: f };
                    }).sort((a, b) => b.finalScore - a.finalScore);

                    if (ranked.length > 0) {
                        const w = ranked[0];
                        await tx.bestEmployee.deleteMany({ where: { quarterId: activeQuarter.id, departmentId: employee.departmentId } });
                        bestEmployeeData = await tx.bestEmployee.create({
                            data: { userId: w.employeeId, quarterId: activeQuarter.id, departmentId: employee.departmentId, selfScore: w.selfScore, supervisorScore: w.supervisorScore, bmScore: w.bmScore, cmScore: w.cmScore, finalScore: w.finalScore },
                            include: { user: { select: { id: true, name: true } } },
                        });
                        bestEmployeeSelected = true;
                    }
                }

                return { evaluation, bestEmployeeSelected, bestEmployeeData, evaluatedCount: myEvaluatedCount, shortlistCount: stage3List.length };
            });

            if (result.bestEmployeeSelected) {
                await createNotification(result.bestEmployeeData.userId, `Congratulations! You are the Best Employee of ${activeQuarter.name}!`);
            }

            return created({
                message: "Evaluation submitted successfully",
                evaluation: { id: result.evaluation.id, employeeId: data.employeeId, evaluated: true },
                progress: { evaluated: result.evaluatedCount, total: result.shortlistCount },
                bestEmployee: result.bestEmployeeSelected ? { userId: result.bestEmployeeData.userId, name: result.bestEmployeeData.user.name } : null
            });
        }

        return fail("Could not determine evaluation flow for this employee");
    } catch (err) {
        return handleApiError(err, "CM-EVALUATE");
    }
});
