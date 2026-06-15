export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../lib/prisma";
import { withRole } from "../../../../lib/withRole";
import { ok, fail, validateBody, handleApiError } from "../../../../lib/api-response";
import { evaluateSchema } from "../../../../lib/validators";
import { normalizeScore, calculateBranchStage2Score } from "../../../../lib/scoreCalculator";
import { regenerateBranchStage2 } from "../../../../lib/branchPromotion";
import { createNotification } from "../../../../lib/notifications";
import { isStageOpen } from "../../../../lib/stageControl";

/**
 * POST /api/hod/evaluate
 * HOD evaluates blue collar employees assigned to them (big branch only).
 * When all HODs finish, the top 10 blue collar employees are shortlisted to Stage 2.
 */
export const POST = withRole(["HOD"], async (request, { user }) => {
    try {
        const { data, error } = await validateBody(request, evaluateSchema);
        if (error) return error;

        const { employeeId, answers } = data;

        // Get active quarter
        const quarter = await prisma.quarter.findFirst({ where: { status: "ACTIVE" } });
        if (!quarter) return fail("No active quarter");

        // Stage 2 must be the active stage (paused → submissions closed).
        if (!(await isStageOpen(quarter.id, 2))) {
            return fail("Stage 2 (BM / HOD evaluation) is paused. Submissions are currently closed.", 403);
        }

        // Verify HOD has this employee assigned
        const employee = await prisma.user.findUnique({
            where: { id: employeeId },
            select: { id: true, name: true, departmentId: true, collarType: true, department: { select: { branchId: true } } }
        });
        if (!employee) return fail("Employee not found");
        if (employee.collarType !== "BLUE_COLLAR") return fail("HOD can only evaluate blue collar employees");

        // HOD-employee link check.
        //
        // In the new BM flow, the BM nominates an HOD (HodAssignment is on the
        // HOD's WHITE_COLLAR home department) and then attaches BC employees
        // to that HOD per-employee via EmployeeHodAssignment — so a BC
        // employee's `departmentId` will almost never equal the HOD's
        // HodAssignment.departmentId. The previous dept-level check therefore
        // rejected every legitimate submission (e.g. Om Prakash → Ajay K R).
        //
        // We now consult EmployeeHodAssignment first (the BM's explicit
        // per-employee link). If that row exists for the active quarter, it
        // IS the source of truth; otherwise we fall back to the legacy
        // dept-level HodAssignment so seeded / older data keeps working.
        const empHodLink = await prisma.employeeHodAssignment.findUnique({
            where: { employeeId_quarterId: { employeeId, quarterId: quarter.id } },
            select: { hodUserId: true },
        });
        if (empHodLink) {
            if (empHodLink.hodUserId !== user.userId) {
                return fail("You are not the HOD assigned to evaluate this employee");
            }
        } else {
            const hodAssignment = await prisma.hodAssignment.findFirst({
                where: {
                    hodUserId: user.userId,
                    departmentId: employee.departmentId,
                    quarterId: quarter.id,
                },
            });
            if (!hodAssignment) return fail("You are not assigned as HOD for this employee");
        }

        // Verify employee is in Stage 1 shortlist
        const inShortlist = await prisma.branchShortlistStage1.findUnique({
            where: { userId_quarterId: { userId: employeeId, quarterId: quarter.id } }
        });
        if (!inShortlist) return fail("Employee is not in Stage 1 shortlist");

        // Check duplicate evaluation
        const existing = await prisma.hodEvaluation.findUnique({
            where: { hodId_employeeId_quarterId: { hodId: user.userId, employeeId, quarterId: quarter.id } }
        });
        if (existing) return fail("You have already evaluated this employee");

        // HOD evaluators reuse the BRANCH_MANAGER question bank — there is
        // no separate HOD bank loaded at quarter start (see
        // app/api/admin/quarters/start/route.js and the comment on
        // app/api/hod/questions/route.js). Validating against `level: "HOD"`
        // here was rejecting every submission because no HOD-level rows
        // exist in QuarterQuestion. Align with the questions route so the
        // IDs the dashboard renders are the IDs we accept.
        const hodQuestions = await prisma.quarterQuestion.findMany({
            where: { quarterId: quarter.id, question: { level: "BRANCH_MANAGER" } },
            select: { questionId: true },
        });
        const validQIds = new Set(hodQuestions.map(q => q.questionId));
        for (const ans of answers) {
            if (!validQIds.has(ans.questionId)) return fail("Invalid question in submission");
        }

        // Calculate scores
        const rawScore = answers.reduce((sum, a) => sum + a.score, 0);
        const hodNormalized = normalizeScore(rawScore, answers.length);

        // Get self-assessment score
        const selfAssessment = await prisma.selfAssessment.findUnique({
            where: { userId_quarterId: { userId: employeeId, quarterId: quarter.id } }
        });
        if (!selfAssessment) return fail("Employee has not completed self-assessment");

        const selfNorm = selfAssessment.normalizedScore;
        const { selfContribution, evaluatorContribution, combined } = calculateBranchStage2Score(selfNorm, hodNormalized);

        // Save evaluation
        await prisma.hodEvaluation.create({
            data: {
                hodId: user.userId,
                employeeId,
                quarterId: quarter.id,
                answers,
                hodRawScore: rawScore,
                hodNormalized,
                selfContribution,
                hodContribution: evaluatorContribution,
                stage2CombinedScore: combined
            }
        });

        await prisma.auditLog.create({
            data: {
                userId: user.userId,
                action: "HOD_EVALUATION",
                details: { employeeId, quarterId: quarter.id, hodNormalized, combined }
            }
        }).catch(() => {});

        // ── Partial promotion (Rule 1) + round-locking (Rule 2) ──
        // HODs only operate in BIG branches. Rebuild the whole branch Stage 2
        // shortlist (BM-driven WC track + HOD-driven BC track) from the
        // evaluations done so far, top-N per track, pruning anyone who dropped
        // out. No-ops once the Cluster Manager round has started for the branch.
        const branchId = employee.department.branchId;
        const { locked, added } = await regenerateBranchStage2(prisma, {
            branchId,
            branchType: "BIG",
            quarterId: quarter.id,
        });
        if (!locked) {
            for (const shortlistedId of added) {
                await createNotification(shortlistedId, "You have been shortlisted to Stage 2! Cluster Manager will evaluate next.")
                    .catch((err) => { console.error(`[HOD-EVALUATE] Stage 2 notification failed for user ${shortlistedId}:`, err); });
            }
        }

        return ok({ message: "Evaluation submitted successfully", stage2CombinedScore: combined });
    } catch (err) {
        return handleApiError(err, "HOD-EVALUATE");
    }
});
