export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../lib/prisma";
import { withRole } from "../../../../lib/withRole";
import { ok, fail, validateBody, handleApiError } from "../../../../lib/api-response";
import { hrEvaluateSchema } from "../../../../lib/validators";
import { normalizeScore, calculateBranchFinalScore, hrBandMarks } from "../../../../lib/scoreCalculator";
import { regenerateBranchStage4 } from "../../../../lib/branchPromotion";
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

        const { employeeId, attendancePct, punctualityPct, attendancePdfUrl, punctualityPdfUrl, referenceSheetUrl, notes } = data;
        // HR's 20-mark round = attendance (10) + punctuality (10). Each half is
        // banded from its percentage (≥90→10, 80→8, 70→6, …) and summed.
        const attendanceMarks = hrBandMarks(attendancePct);
        const punctualityMarks = hrBandMarks(punctualityPct);
        const hrScore = attendanceMarks + punctualityMarks; // 0..20

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

        // Convert the 0..20 HR marks back to a 0..100 normalized score so the
        // shared 20% weighting in calculateBranchFinalScore reproduces the marks
        // as the contribution: (hrScore / 20) * 100 → * 20 / 100 = hrScore.
        const hrNorm = (hrScore / 20) * 100;

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
                // `workingHours` column is repurposed to persist the punctuality %
                // (the model has no dedicated punctualityPct column).
                workingHours: punctualityPct,
                attendancePdfUrl: attendancePdfUrl || null,
                punctualityPdfUrl: punctualityPdfUrl || null,
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

        // ── Partial promotion (Rule 1) ──
        // Rebuild the branch's Best Employee list from the HR evaluations done
        // so far. Stage 4 is terminal — there's no later round to lock against —
        // so it always reflects the current HR evaluations (top 1 WC + 3 BC for
        // big branches, top 3 for small).
        const branchId = stage3Entry.branchId;
        const branch = await prisma.branch.findUnique({ where: { id: branchId }, select: { branchType: true } });
        const { added } = await regenerateBranchStage4(prisma, {
            branchId,
            branchType: branch?.branchType,
            quarterId: quarter.id,
        });
        for (const winnerId of added) {
            await createNotification(winnerId, "Congratulations! You have been selected as Best Employee of the Quarter!")
                .catch((err) => { console.error(`[HR-EVALUATE] Best Employee notification failed for user ${winnerId}:`, err); });
        }

        return ok({ message: "HR evaluation submitted", finalScore });
    } catch (err) {
        return handleApiError(err, "HR-EVALUATE");
    }
});
