export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../lib/prisma";
import { withRole } from "../../../../lib/withRole";
import { created, fail, notFound, conflict, validateBody, handleApiError } from "../../../../lib/api-response";
import { evaluateSchema } from "../../../../lib/validators";
import { createNotification } from "../../../../lib/notifications";
import { normalizeScore, calculateBranchStage2Score, EVALUATOR_MAX_SCORE } from "../../../../lib/scoreCalculator";
import { regenerateBranchStage2 } from "../../../../lib/branchPromotion";
import { collarPrismaFilter, effectiveCollar } from "../../../../lib/questionCollar";
import { stageGate } from "../../../../lib/stageScheduler";
import { authorizeEvaluator, accessDeniedMessage } from "../../../../lib/evaluatorDelegation";
import { buildBmQueue } from "../../../../lib/bmEvaluationQueue";

/**
 * POST /api/branch-manager/evaluate
 * Branch-scoped Stage 2 evaluation by the Branch Manager — or by the holder of
 * a department-level Branch Manager POA (EvaluatorDelegation).
 *
 * Rules:
 *   - Evaluator resolution (lib/evaluatorDelegation): the employee's
 *     department POA if one is configured (excluding the employee themselves),
 *     otherwise the branch BM. Nobody may evaluate themselves.
 *   - Employee must be in BranchShortlistStage1 for their branch.
 *   - BIG branches: BM only evaluates WHITE_COLLAR (BC goes through HOD).
 *   - SMALL branches: BM evaluates every Stage 1 shortlisted employee.
 *   - One Stage 2 BM-type evaluation per employee per quarter.
 *   - Weighting: self 60% / BM 40% via calculateBranchStage2Score.
 *   - When the BM has evaluated every target, BranchShortlistStage2 is
 *     auto-populated using the configured stage2Limit (BranchEvalConfig
 *     if present, otherwise branchRules defaults).
 */
export const POST = withRole(["BRANCH_MANAGER"], async (request, { user }) => {
    try {
        const { data, error } = await validateBody(request, evaluateSchema);
        if (error) return error;

        const activeQuarter = await prisma.quarter.findFirst({ where: { status: "ACTIVE" } });
        if (!activeQuarter) return notFound("No active quarter. Evaluations are closed.");

        // Stage 2 must be the active stage (scheduled/paused/completed → closed).
        const gate = await stageGate(activeQuarter.id, 2);
        if (!gate.open) return fail(gate.message, 403);

        const employee = await prisma.user.findUnique({
            where: { id: data.employeeId },
            select: {
                id: true,
                departmentId: true,
                collarType: true,
                department: { select: { branchId: true, branch: { select: { branchType: true } } } },
            },
        });
        if (!employee) return notFound("Employee not found");

        const empBranchId = employee.department?.branchId;
        const branchType = employee.department?.branch?.branchType;
        if (!empBranchId) return fail("You can only evaluate employees in your own branch.", 403);

        // Authorization (server-side, source of truth): branch BM, or the
        // department's BM POA holder — never the employee themselves.
        const access = await authorizeEvaluator({
            userId: user.userId,
            type: "BRANCH_MANAGER",
            employee: { id: employee.id, departmentId: employee.departmentId, branchId: empBranchId },
        });
        if (!access.allowed) return fail(accessDeniedMessage("BRANCH_MANAGER", access.reason), 403);

        // Employee must be Stage 1 shortlisted for their branch+quarter.
        const branchStage1Entry = await prisma.branchShortlistStage1.findUnique({
            where: { userId_quarterId: { userId: data.employeeId, quarterId: activeQuarter.id } },
        });
        if (!branchStage1Entry || branchStage1Entry.branchId !== empBranchId) {
            return fail("Employee is not in the Stage 1 shortlist for your branch.");
        }

        // BIG branches: blue-collar (and unclassified) employees normally go
        // through their assigned HOD. The BM may evaluate such an employee ONLY
        // when they are ORPHANED — no active EmployeeHodAssignment for this
        // quarter AND no HOD has already evaluated them (lib/hodCoverage, the
        // same rule lib/bmEvaluationQueue.js applies to the dashboard list).
        // HOD-covered employees are rejected so they aren't double-evaluated.
        if (branchType === "BIG" && employee.collarType !== "WHITE_COLLAR") {
            const [hodLink, hodEval] = await Promise.all([
                prisma.employeeHodAssignment.findUnique({
                    where: { employeeId_quarterId: { employeeId: data.employeeId, quarterId: activeQuarter.id } },
                    select: { hodUserId: true },
                }),
                prisma.hodEvaluation.findFirst({
                    where: { employeeId: data.employeeId, quarterId: activeQuarter.id },
                    select: { id: true },
                }),
            ]);
            if (hodEval) {
                return conflict("This blue collar employee has already been evaluated for Stage 2 by their HOD.");
            }
            if (hodLink) {
                return fail("This blue collar employee has an assigned HOD and must be evaluated by that HOD, not the Branch Manager. Remove the HOD assignment first if the BM should evaluate them.");
            }
            // No HOD link → orphaned → the BM is the correct evaluator. Continue.
        }

        // Duplicate guard — one Stage 2 BM-type evaluation per employee per
        // quarter, whoever submitted it (the branch BM or a department POA), so
        // a POA change mid-stage can never double-count an employee.
        const existing = await prisma.branchManagerEvaluation.findFirst({
            where: { employeeId: data.employeeId, quarterId: activeQuarter.id },
            select: { managerId: true },
        });
        if (existing) {
            return conflict(existing.managerId === user.userId
                ? "Already evaluated this employee"
                : "This employee has already been evaluated for Stage 2 by another evaluator.");
        }

        // Validate answers against this quarter's BM question set, restricted
        // to the questions applicable to THIS employee's category (shared +
        // own-collar) — the same filter the BM dashboard applies before
        // showing them. `effectiveCollar(employee.collarType)` resolves to the
        // live collar, defaulting to BLUE_COLLAR, matching the client.
        const empCollar = effectiveCollar(employee.collarType);
        const locked = await prisma.quarterQuestion.findMany({
            where: { quarterId: activeQuarter.id, question: { level: "BRANCH_MANAGER", ...collarPrismaFilter(empCollar) } },
            select: { questionId: true },
        });
        const lockedIds = new Set(locked.map((q) => q.questionId));
        if (data.answers.length !== lockedIds.size) return fail(`Must answer all ${lockedIds.size} questions`);
        const seen = new Set();
        for (const a of data.answers) {
            if (seen.has(a.questionId)) return fail(`Duplicate answer for question ${a.questionId}`);
            if (!lockedIds.has(a.questionId)) return fail(`Invalid question: ${a.questionId}`);
            seen.add(a.questionId);
        }

        const bmRawScore = data.answers.reduce((s, a) => s + a.score, 0);
        const bmNormalized = normalizeScore(bmRawScore, lockedIds.size, EVALUATOR_MAX_SCORE);
        const selfNorm = branchStage1Entry.selfScore;

        const { selfContribution, evaluatorContribution, combined } = calculateBranchStage2Score(selfNorm, bmNormalized);

        const evaluation = await prisma.branchManagerEvaluation.create({
            data: {
                managerId: user.userId,
                employeeId: data.employeeId,
                quarterId: activeQuarter.id,
                answers: data.answers,
                bmRawScore,
                bmNormalized,
                selfContribution,
                supervisorContribution: 0,
                bmContribution: evaluatorContribution,
                stage3CombinedScore: combined,
                viaDelegation: access.viaDelegation,
            },
        });

        // ── Partial promotion (Rule 1) + round-locking (Rule 2) ──
        // Rebuild the branch's Stage 2 shortlist from the evaluations done so
        // far (top-N per track, pruning anyone who has dropped out). The helper
        // no-ops once the Cluster Manager round has started for this branch, so
        // a late BM evaluation can't reshuffle a round CM is already working on.
        const { locked: stage2Locked, added } = await regenerateBranchStage2(prisma, {
            branchId: empBranchId,
            branchType,
            quarterId: activeQuarter.id,
        });
        const stage2Generated = !stage2Locked && added.length > 0;
        for (const shortlistedId of added) {
            await createNotification(
                shortlistedId,
                "You have been shortlisted to Stage 2! Cluster Manager will evaluate next."
            ).catch((err) => { console.error(`[BM-EVALUATE] Stage 2 notification failed for user ${shortlistedId}:`, err); });
        }

        // Progress for the evaluator's UI — the same queue the dashboard shows
        // (branch-default scope and/or department POA scope).
        const { rows: queueRows } = await buildBmQueue(user.userId, activeQuarter.id);
        const targetIds = queueRows.map((s) => s.userId);
        const bmEvalCount = targetIds.length
            ? await prisma.branchManagerEvaluation.count({
                where: { quarterId: activeQuarter.id, employeeId: { in: targetIds } },
            })
            : 0;

        await prisma.auditLog.create({
            data: {
                userId: user.userId,
                action: "BM_BRANCH_EVAL",
                details: {
                    employeeId: data.employeeId,
                    quarterId: activeQuarter.id,
                    bmNormalized,
                    combined,
                    stage2Generated,
                    viaDelegation: access.viaDelegation,
                },
            },
        }).catch((err) => { console.error("[BM-EVALUATE] Audit log failed:", err); });

        return created({
            message: "Evaluation submitted successfully",
            evaluation: { id: evaluation.id, employeeId: data.employeeId, evaluated: true },
            progress: { evaluated: bmEvalCount, total: targetIds.length },
            stage2Generated,
        });
    } catch (err) {
        return handleApiError(err, "BM-EVALUATE");
    }
});
