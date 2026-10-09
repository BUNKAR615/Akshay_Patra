export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../lib/prisma";
import { withRole } from "../../../../lib/withRole";
import { ok, fail, validateBody, handleApiError } from "../../../../lib/api-response";
import { evaluateSchema } from "../../../../lib/validators";
import { normalizeScore, calculateBranchStage2Score, EVALUATOR_MAX_SCORE } from "../../../../lib/scoreCalculator";
import { regenerateBranchStage2 } from "../../../../lib/branchPromotion";
import { createNotification } from "../../../../lib/notifications";
import { stageGate } from "../../../../lib/stageScheduler";
import { collarPrismaFilter } from "../../../../lib/questionCollar";

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

        // Stage 2 must be the active stage (scheduled/paused/completed → closed).
        const gate = await stageGate(quarter.id, 2);
        if (!gate.open) return fail(gate.message, 403);

        // Verify HOD has this employee assigned
        const employee = await prisma.user.findUnique({
            where: { id: employeeId },
            select: { id: true, name: true, departmentId: true, collarType: true, department: { select: { branchId: true } } }
        });
        if (!employee) return fail("Employee not found");
        // Unclassified (null) counts as blue-collar, as in the BM queue.
        if (employee.collarType === "WHITE_COLLAR") return fail("HOD can only evaluate blue collar employees");

        // HOD-employee link check. The BM nominates an HOD (HodAssignment) and
        // then attaches BC employees per-employee via EmployeeHodAssignment —
        // that link is the ONLY grant. The old dept-level fallback (HOD of the
        // employee's department) let an HOD evaluate employees the BM
        // dashboard never showed as assigned to them (see lib/hodCoverage).
        const empHodLink = await prisma.employeeHodAssignment.findUnique({
            where: { employeeId_quarterId: { employeeId, quarterId: quarter.id } },
            select: { hodUserId: true },
        });
        if (!empHodLink) return fail("This employee is not assigned to you. Ask your Branch Manager to assign them.");
        if (empHodLink.hodUserId !== user.userId) {
            return fail("You are not the HOD assigned to evaluate this employee");
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

        // One Stage 2 evaluation per employee per quarter, whoever submitted it
        // — e.g. the BM evaluated them while they were orphaned, or a previous
        // HOD did before a reassignment. Admin progress counts BM ∪ HOD, so a
        // second evaluation would never show up there anyway.
        const [otherHodEval, bmEval] = await Promise.all([
            prisma.hodEvaluation.findFirst({ where: { employeeId, quarterId: quarter.id }, select: { id: true } }),
            prisma.branchManagerEvaluation.findFirst({ where: { employeeId, quarterId: quarter.id }, select: { id: true } }),
        ]);
        if (otherHodEval || bmEval) return fail("This employee has already been evaluated for Stage 2 by another evaluator.");

        // HOD evaluators reuse the BRANCH_MANAGER question bank — there is
        // no separate HOD bank loaded at quarter start (see
        // app/api/admin/quarters/start/route.js and the comment on
        // app/api/hod/questions/route.js). Validating against `level: "HOD"`
        // here was rejecting every submission because no HOD-level rows
        // exist in QuarterQuestion. Mirror the questions route exactly —
        // including its BLUE_COLLAR restriction (HODs only evaluate BC
        // staff) — so the IDs the dashboard renders are the IDs we accept.
        const hodQuestions = await prisma.quarterQuestion.findMany({
            where: { quarterId: quarter.id, question: { level: "BRANCH_MANAGER", ...collarPrismaFilter("BLUE_COLLAR") } },
            select: { questionId: true },
        });
        const validQIds = new Set(hodQuestions.map(q => q.questionId));
        // The whole set must be answered exactly once — a partial or duplicated
        // submission would silently shift the per-question weight, breaking the
        // fixed-stage-weightage invariant. Same guards as the BM and CM routes.
        if (answers.length !== validQIds.size) {
            return fail(`Must answer all ${validQIds.size} questions. Received ${answers.length}.`);
        }
        const seen = new Set();
        for (const ans of answers) {
            if (!validQIds.has(ans.questionId)) return fail("Invalid question in submission");
            if (seen.has(ans.questionId)) return fail("Duplicate answer in submission");
            seen.add(ans.questionId);
        }

        // Calculate scores
        const rawScore = answers.reduce((sum, a) => sum + a.score, 0);
        const hodNormalized = normalizeScore(rawScore, validQIds.size, EVALUATOR_MAX_SCORE);

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
