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

        const { employeeId, hrScore, notes } = data;

        const quarter = await prisma.quarter.findFirst({ where: { status: "ACTIVE" } });
        if (!quarter) return fail("No active quarter");

        // Verify employee is in Stage 3 shortlist
        const stage3Entry = await prisma.branchShortlistStage3.findUnique({
            where: { userId_quarterId: { userId: employeeId, quarterId: quarter.id } }
        });
        if (!stage3Entry) return fail("Employee is not in Stage 3 shortlist");

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
        const evaluatorNorm = (stage3Entry.evaluatorScore / 0.30) * (100 / 100); // reverse from weighted contribution
        const cmNorm = (stage3Entry.cmScore / 0.30) * (100 / 100);

        // Normalize HR score (hrScore is 0-100)
        const hrNorm = hrScore;

        const { selfContribution, evaluatorContribution, cmContribution, hrContribution, finalScore } =
            calculateBranchFinalScore(selfNorm, evaluatorNorm, cmNorm, hrNorm);

        // Check if PDFs have been uploaded for this employee
        const existingPdfs = await prisma.hrEvaluation.findFirst({
            where: { employeeId, quarterId: quarter.id },
            select: { attendancePdfUrl: true, punctualityPdfUrl: true }
        });

        await prisma.hrEvaluation.create({
            data: {
                hrUserId: user.userId,
                employeeId,
                quarterId: quarter.id,
                hrScore,
                notes,
                selfContribution,
                evaluatorContribution,
                cmContribution,
                hrContribution,
                stage4CombinedScore: finalScore,
                attendancePdfUrl: existingPdfs?.attendancePdfUrl || null,
                punctualityPdfUrl: existingPdfs?.punctualityPdfUrl || null,
            }
        });

        await prisma.auditLog.create({
            data: {
                userId: user.userId,
                action: "HR_EVALUATION",
                details: { employeeId, quarterId: quarter.id, hrScore, finalScore }
            }
        }).catch(() => {});

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
                    attendancePdfUrl: ev.attendancePdfUrl,
                    punctualityPdfUrl: ev.punctualityPdfUrl,
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
                    attendancePdfUrl: ev.attendancePdfUrl,
                    punctualityPdfUrl: ev.punctualityPdfUrl,
                }
            });
            await createNotification(ev.employeeId, "Congratulations! You have been selected as Best Employee of the Quarter!").catch(() => {});
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
                    attendancePdfUrl: ev.attendancePdfUrl,
                    punctualityPdfUrl: ev.punctualityPdfUrl,
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
                    attendancePdfUrl: ev.attendancePdfUrl,
                    punctualityPdfUrl: ev.punctualityPdfUrl,
                }
            });
            await createNotification(ev.employeeId, "Congratulations! You have been selected as Best Employee of the Quarter!").catch(() => {});
        }
    }
}
