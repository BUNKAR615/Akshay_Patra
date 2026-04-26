export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../lib/prisma";
import { withRole } from "../../../../lib/withRole";
import { created, fail, notFound, conflict, serverError, validateBody } from "../../../../lib/api-response";
import { evaluateSchema } from "../../../../lib/validators";
import { createNotification } from "../../../../lib/notifications";
import { normalizeScore, calculateFinalScore, calculateBranchStage3Score } from "../../../../lib/scoreCalculator";
import { getEvaluatorPool } from "../../../../lib/evaluatorPool";
import { getBigBranchCollarLimits } from "../../../../lib/branchRules";

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

            // Check if CM has evaluated ALL branch Stage 2 employees
            const allStage2 = await prisma.branchShortlistStage2.findMany({
                where: { branchId, quarterId: activeQuarter.id }
            });
            const cmEvalCount = await prisma.clusterManagerEvaluation.count({
                where: {
                    clusterId: user.userId,
                    quarterId: activeQuarter.id,
                    employeeId: { in: allStage2.map(s => s.userId) }
                }
            });

            let stage3Generated = false;
            if (cmEvalCount >= allStage2.length && allStage2.length > 0) {
                // Guard against concurrent CM submissions both regenerating Stage 3 +
                // resending the "advanced to Stage 3" notification. Only the first
                // caller for this branch+quarter actually generates.
                const existingStage3 = await prisma.branchShortlistStage3.count({
                    where: { branchId, quarterId: activeQuarter.id }
                });
                if (existingStage3 === 0) {
                    stage3Generated = true;
                    await generateBranchStage3(branchId, branchType, activeQuarter.id);
                }
            }

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
        console.error("CM evaluate error:", err);
        return serverError();
    }
});

/**
 * Generate branch-level Stage 3 shortlist after CM completes evaluations.
 * Forwards top N to HR (not to BestEmployee).
 */
async function generateBranchStage3(branchId, branchType, quarterId) {
    // Get all CM evaluations for branch Stage 2 employees
    const stage2Entries = await prisma.branchShortlistStage2.findMany({
        where: { branchId, quarterId }
    });
    const stage2UserIds = stage2Entries.map(s => s.userId);

    const cmEvals = await prisma.clusterManagerEvaluation.findMany({
        where: { quarterId, employeeId: { in: stage2UserIds } },
        include: { employee: { select: { collarType: true } } }
    });

    // Map evaluations by employee
    const evalsByEmployee = new Map();
    for (const ev of cmEvals) {
        if (!evalsByEmployee.has(ev.employeeId)) evalsByEmployee.set(ev.employeeId, []);
        evalsByEmployee.get(ev.employeeId).push(ev);
    }

    // Merge with Stage 2 data and calculate Stage 3 scores
    const candidates = stage2Entries.map(s2 => {
        const evals = evalsByEmployee.get(s2.userId) || [];
        const avgCmNorm = evals.length > 0
            ? evals.reduce((sum, e) => sum + e.cmNormalized, 0) / evals.length
            : 0;
        return {
            userId: s2.userId,
            collarType: s2.collarType,
            selfScore: s2.selfScore,
            evaluatorScore: s2.evaluatorScore,
            cmScore: avgCmNorm,
            combinedScore: s2.selfScore + s2.evaluatorScore + Math.round((avgCmNorm / 100) * 30 * 100) / 100
        };
    });

    if (branchType === "BIG") {
        // Separate WC and BC tracks
        const wc = candidates.filter(c => c.collarType === "WHITE_COLLAR").sort((a, b) => b.combinedScore - a.combinedScore);
        const bc = candidates.filter(c => c.collarType === "BLUE_COLLAR").sort((a, b) => b.combinedScore - a.combinedScore);

        const wcLimits = getBigBranchCollarLimits("WHITE_COLLAR");
        const bcLimits = getBigBranchCollarLimits("BLUE_COLLAR");

        const wcTop = wc.slice(0, wcLimits.stage3Limit); // top 2
        const bcTop = bc.slice(0, bcLimits.stage3Limit); // top 5

        const allTop = [...wcTop, ...bcTop];
        for (let i = 0; i < allTop.length; i++) {
            const c = allTop[i];
            await prisma.branchShortlistStage3.upsert({
                where: { userId_quarterId: { userId: c.userId, quarterId } },
                update: { selfScore: c.selfScore, evaluatorScore: c.evaluatorScore, cmScore: c.cmScore, combinedScore: c.combinedScore, rank: i + 1 },
                create: { userId: c.userId, quarterId, branchId, collarType: c.collarType, selfScore: c.selfScore, evaluatorScore: c.evaluatorScore, cmScore: c.cmScore, combinedScore: c.combinedScore, rank: i + 1 }
            });
        }
    } else {
        // Small branch: top 5 overall
        const sorted = candidates.sort((a, b) => b.combinedScore - a.combinedScore);
        const top5 = sorted.slice(0, 5);

        for (let i = 0; i < top5.length; i++) {
            const c = top5[i];
            await prisma.branchShortlistStage3.upsert({
                where: { userId_quarterId: { userId: c.userId, quarterId } },
                update: { selfScore: c.selfScore, evaluatorScore: c.evaluatorScore, cmScore: c.cmScore, combinedScore: c.combinedScore, rank: i + 1 },
                create: { userId: c.userId, quarterId, branchId, collarType: c.collarType || "BLUE_COLLAR", selfScore: c.selfScore, evaluatorScore: c.evaluatorScore, cmScore: c.cmScore, combinedScore: c.combinedScore, rank: i + 1 }
            });
        }
    }

    // Notify shortlisted employees
    const stage3List = await prisma.branchShortlistStage3.findMany({ where: { branchId, quarterId }, select: { userId: true } });
    for (const s of stage3List) {
        await createNotification(s.userId, "You have advanced to Stage 3! HR will evaluate next.")
            .catch((err) => { console.error(`[CM-EVALUATE] Stage 3 notification failed for user ${s.userId}:`, err); });
    }
}
