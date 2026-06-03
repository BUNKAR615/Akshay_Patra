export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../lib/prisma";
import { withRole } from "../../../../lib/withRole";
import { created, fail, notFound, conflict, validateBody, handleApiError } from "../../../../lib/api-response";
import { evaluateSchema } from "../../../../lib/validators";
import { createNotification } from "../../../../lib/notifications";
import { normalizeScore, calculateFinalScore, calculateBranchStage3Score } from "../../../../lib/scoreCalculator";
import { getEvaluatorPool } from "../../../../lib/evaluatorPool";
import { regenerateBranchStage3 } from "../../../../lib/branchPromotion";

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

        const employee = await prisma.user.findUnique({
            where: { id: data.employeeId },
            select: { id: true, departmentId: true, collarType: true, department: { select: { branchId: true, branch: { select: { branchType: true } } } } }
        });
        if (!employee) return notFound("Employee not found");

        const branchId = employee.department?.branchId;
        const branchType = employee.department?.branch?.branchType;

        // Branch-scope check: CM must be assigned to this employee's branch
        if (!branchId) return fail("Employee has no branch");
        const cmAssignment = await prisma.clusterManagerBranchAssignment.findUnique({
            where: { cmUserId_branchId: { cmUserId: user.userId, branchId } },
        });
        if (!cmAssignment) return fail("You are not assigned to this branch", 403);

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

        // Validate answers
        const locked = await prisma.quarterQuestion.findMany({
            where: { quarterId: activeQuarter.id, question: { level: "CLUSTER_MANAGER" } },
            select: { questionId: true },
        });
        const lockedIds = new Set(locked.map((q) => q.questionId));
        if (data.answers.length !== lockedIds.size) return fail(`Must answer all ${lockedIds.size} questions. Received ${data.answers.length}.`);
        for (const a of data.answers) {
            if (!lockedIds.has(a.questionId)) return fail(`Question "${a.questionId}" is not part of this quarter's CM questions`);
        }

        const cmRawScore = data.answers.reduce((s, a) => s + a.score, 0);
        const cmNormalized = normalizeScore(cmRawScore, lockedIds.size);

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
                    finalScore: combined
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

            // Progress for the CM UI (generation no longer waits for completion).
            const allStage2 = await prisma.branchShortlistStage2.findMany({
                where: { branchId, quarterId: activeQuarter.id },
                select: { userId: true },
            });
            const cmEvalCount = await prisma.clusterManagerEvaluation.count({
                where: {
                    clusterId: user.userId,
                    quarterId: activeQuarter.id,
                    employeeId: { in: allStage2.map((s) => s.userId) },
                },
            });

            await prisma.auditLog.create({
                data: {
                    userId: user.userId,
                    action: stage3Generated ? "BRANCH_STAGE3_GENERATED" : "CM_EVALUATION_SUBMITTED",
                    details: { employeeId: data.employeeId, quarterId: activeQuarter.id, cmNormalized, combined }
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
