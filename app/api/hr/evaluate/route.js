export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../lib/prisma";
import { withRole } from "../../../../lib/withRole";
import { ok, fail, serverError, validateBody } from "../../../../lib/api-response";
import { hrEvaluateSchema } from "../../../../lib/validators";
import { normalizeScore, calculateBranchFinalScore } from "../../../../lib/scoreCalculator";
import { createNotification } from "../../../../lib/notifications";

/**
 * POST /api/hr/evaluate
 * HR evaluates Stage 3 shortlisted employees with attendance/punctuality check.
 * HR must upload PDFs before or during evaluation.
 * When HR completes all evaluations, Stage 4 shortlist is generated.
 */
export const POST = withRole(["HR", "ADMIN"], async (request, { user }) => {
    try {
        const { data, error } = await validateBody(request, hrEvaluateSchema);
        if (error) return error;

        const { employeeId, attendancePct, workingHours, referenceSheetUrl, notes } = data;
        // HR score derived purely from attendance % (0-100 scale)
        const hrScore = Math.max(0, Math.min(100, attendancePct));

        const quarter = await prisma.quarter.findFirst({ where: { status: "ACTIVE" } });
        if (!quarter) return fail("No active quarter");

        // Verify employee is in Stage 3 shortlist
        const stage3Entry = await prisma.branchShortlistStage3.findUnique({
            where: { userId_quarterId: { userId: employeeId, quarterId: quarter.id } }
        });
        if (!stage3Entry) return fail("Employee is not in Stage 3 shortlist");

        // Branch-scope check: HR must be assigned to this employee's branch (ADMIN bypasses)
        if (user.role !== "ADMIN") {
            const employeeBranch = await prisma.user.findUnique({
                where: { id: employeeId },
                select: { department: { select: { branchId: true } } },
            });
            const branchId = employeeBranch?.department?.branchId;
            if (!branchId) return fail("Employee has no branch");
            const hrAssignment = await prisma.hrBranchAssignment.findUnique({
                where: { hrUserId_branchId: { hrUserId: user.userId, branchId } },
            });
            if (!hrAssignment) return fail("You are not assigned to this branch", 403);
        }

        // Check duplicate evaluation
        const existing = await prisma.hrEvaluation.findUnique({
            where: { hrUserId_employeeId_quarterId: { hrUserId: user.userId, employeeId, quarterId: quarter.id } }
        });
        if (existing) return fail("You have already evaluated this employee");

        // Get employee's scores from previous stages
        const selfAssessment = await prisma.selfAssessment.findUnique({
            where: { userId_quarterId: { userId: employeeId, quarterId: quarter.id } }
        });
        if (!selfAssessment) return fail("Employee has no self-assessment");

        const selfNorm = selfAssessment.normalizedScore;
        // Stage 2 stored evaluatorScore as a weighted contribution (0-40 from 40% weight in calculateBranchStage2Score),
        // so divide by 40 and multiply by 100 to recover the 0-100 normalized form.
        const evaluatorNorm = (stage3Entry.evaluatorScore / 40) * 100;
        // Stage 3 stored cmScore as the already-normalized 0-100 score (avgCmNorm); no reversal needed.
        const cmNorm = stage3Entry.cmScore;

        // Normalize HR score (hrScore is 0-100)
        const hrNorm = hrScore;

        const { selfContribution, evaluatorContribution, cmContribution, hrContribution, finalScore } =
            calculateBranchFinalScore(selfNorm, evaluatorNorm, cmNorm, hrNorm);

        await prisma.hrEvaluation.create({
            data: {
                hrUserId: user.userId,
                employeeId,
                quarterId: quarter.id,
                hrScore,
                notes,
                attendancePct,
                workingHours,
                referenceSheetUrl: referenceSheetUrl || null,
                selfContribution,
                evaluatorContribution,
                cmContribution,
                hrContribution,
                stage4CombinedScore: finalScore,
            }
        });

        await prisma.auditLog.create({
            data: {
                userId: user.userId,
                action: "HR_EVALUATION",
                details: { employeeId, quarterId: quarter.id, hrScore, finalScore }
            }
        }).catch((err) => { console.error("[HR-EVALUATE] Audit log failed:", err); });

        // Check if ALL Stage 3 employees have been evaluated by HR
        const branchId = stage3Entry.branchId;
        const allStage3 = await prisma.branchShortlistStage3.findMany({
            where: { branchId, quarterId: quarter.id }
        });
        const hrEvalCount = await prisma.hrEvaluation.count({
            where: { quarterId: quarter.id, employee: { department: { branchId } } }
        });

        if (hrEvalCount >= allStage3.length && allStage3.length > 0) {
            // Generate Stage 4 shortlist (best employees)
            await generateStage4Shortlist(branchId, quarter.id);
        }

        return ok({ message: "HR evaluation submitted", finalScore });
    } catch (err) {
        console.error("[HR-EVALUATE] Error:", err.message, err.stack);
        return serverError();
    }
});

async function generateStage4Shortlist(branchId, quarterId) {
    const branch = await prisma.branch.findUnique({ where: { id: branchId }, select: { branchType: true } });

    // Get all HR evaluations for this branch
    const hrEvals = await prisma.hrEvaluation.findMany({
        where: { quarterId, employee: { department: { branchId } } },
        include: { employee: { select: { id: true, collarType: true } } },
        orderBy: { stage4CombinedScore: "desc" }
    });

    if (branch.branchType === "BIG") {
        // Big branch: 1 WC + 3 BC
        const wcEvals = hrEvals.filter(e => e.employee.collarType === "WHITE_COLLAR");
        const bcEvals = hrEvals.filter(e => e.employee.collarType === "BLUE_COLLAR");

        if (wcEvals.length === 0) {
            console.warn(`[HR-EVALUATE] Big branch ${branchId} (quarter ${quarterId}) has zero WHITE_COLLAR HR evaluations — Best Employee pool will not include a WC winner.`);
        }
        if (bcEvals.length < 3) {
            console.warn(`[HR-EVALUATE] Big branch ${branchId} (quarter ${quarterId}) has only ${bcEvals.length} BLUE_COLLAR HR evaluations — fewer than 3 BC winners will be selected.`);
        }

        const wcWinners = wcEvals.slice(0, 1);
        const bcWinners = bcEvals.slice(0, 3);
        const allWinners = [...wcWinners, ...bcWinners];

        for (let i = 0; i < allWinners.length; i++) {
            const ev = allWinners[i];
            await prisma.branchBestEmployee.upsert({
                where: { userId_quarterId: { userId: ev.employeeId, quarterId } },
                update: {
                    selfScore: ev.selfContribution,
                    evaluatorScore: ev.evaluatorContribution,
                    cmScore: ev.cmContribution,
                    hrScore: ev.hrContribution,
                    finalScore: ev.stage4CombinedScore,
                    attendancePct: ev.attendancePct,
                    workingHours: ev.workingHours,
                    referenceSheetUrl: ev.referenceSheetUrl,
                },
                create: {
                    userId: ev.employeeId,
                    quarterId,
                    branchId,
                    collarType: ev.employee.collarType,
                    selfScore: ev.selfContribution,
                    evaluatorScore: ev.evaluatorContribution,
                    cmScore: ev.cmContribution,
                    hrScore: ev.hrContribution,
                    finalScore: ev.stage4CombinedScore,
                    attendancePct: ev.attendancePct,
                    workingHours: ev.workingHours,
                    referenceSheetUrl: ev.referenceSheetUrl,
                }
            });
            await createNotification(ev.employeeId, "Congratulations! You have been selected as Best Employee of the Quarter!")
                .catch((err) => { console.error(`[HR-EVALUATE] Best Employee notification failed for user ${ev.employeeId}:`, err); });
        }
    } else {
        // Small branch: top 3 overall
        const winners = hrEvals.slice(0, 3);

        for (let i = 0; i < winners.length; i++) {
            const ev = winners[i];
            await prisma.branchBestEmployee.upsert({
                where: { userId_quarterId: { userId: ev.employeeId, quarterId } },
                update: {
                    selfScore: ev.selfContribution,
                    evaluatorScore: ev.evaluatorContribution,
                    cmScore: ev.cmContribution,
                    hrScore: ev.hrContribution,
                    finalScore: ev.stage4CombinedScore,
                    attendancePct: ev.attendancePct,
                    workingHours: ev.workingHours,
                    referenceSheetUrl: ev.referenceSheetUrl,
                },
                create: {
                    userId: ev.employeeId,
                    quarterId,
                    branchId,
                    collarType: ev.employee.collarType || "BLUE_COLLAR",
                    selfScore: ev.selfContribution,
                    evaluatorScore: ev.evaluatorContribution,
                    cmScore: ev.cmContribution,
                    hrScore: ev.hrContribution,
                    finalScore: ev.stage4CombinedScore,
                    attendancePct: ev.attendancePct,
                    workingHours: ev.workingHours,
                    referenceSheetUrl: ev.referenceSheetUrl,
                }
            });
            await createNotification(ev.employeeId, "Congratulations! You have been selected as Best Employee of the Quarter!")
                .catch((err) => { console.error(`[HR-EVALUATE] Best Employee notification failed for user ${ev.employeeId}:`, err); });
        }
    }
}
