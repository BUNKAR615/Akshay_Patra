export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../lib/prisma";
import { withRole } from "../../../../lib/withRole";
import { created, fail, notFound, conflict, validateBody, handleApiError } from "../../../../lib/api-response";
import { resolveScopeBranch } from "../../../../lib/auth/resolveScopeBranch";
import { evaluateSchema } from "../../../../lib/validators";
import { createNotification } from "../../../../lib/notifications";
import { normalizeScore, calculateBranchStage2Score } from "../../../../lib/scoreCalculator";
import { regenerateBranchStage2 } from "../../../../lib/branchPromotion";

/**
 * POST /api/branch-manager/evaluate
 * Branch-scoped Stage 2 evaluation by the Branch Manager.
 *
 * Rules:
 *   - Employee must be in BranchShortlistStage1 for the BM's branch.
 *   - BIG branches: BM only evaluates WHITE_COLLAR (BC goes through HOD).
 *   - SMALL branches: BM evaluates every Stage 1 shortlisted employee.
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

        // Resolve BM's branch (source of truth for the ownership check) —
        // honors User.branchId from the JWT first, then BranchManagerAssignment.
        const { branchId: bmBranchId, branch: bmBranch } = await resolveScopeBranch(user);
        const bmBranchType = bmBranch?.branchType;
        if (!bmBranchId) return fail("No branch is assigned to this Branch Manager. Please contact admin.");

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
        const branchType = employee.department?.branch?.branchType || bmBranchType;

        // Branch ownership: BM can only evaluate employees in their own branch.
        if (!empBranchId || empBranchId !== bmBranchId) {
            return fail("You can only evaluate employees in your own branch.", 403);
        }

        // Employee must be Stage 1 shortlisted for this branch+quarter.
        const branchStage1Entry = await prisma.branchShortlistStage1.findUnique({
            where: { userId_quarterId: { userId: data.employeeId, quarterId: activeQuarter.id } },
        });
        if (!branchStage1Entry || branchStage1Entry.branchId !== bmBranchId) {
            return fail("Employee is not in the Stage 1 shortlist for your branch.");
        }

        // BIG branches: BM only evaluates WC; BC must go through the assigned HOD.
        if (branchType === "BIG" && employee.collarType === "BLUE_COLLAR") {
            return fail("Blue collar employees in big branches must be evaluated by their HOD, not by Branch Manager. Please assign an HOD for their department.");
        }

        // Duplicate guard
        const existing = await prisma.branchManagerEvaluation.findUnique({
            where: { managerId_employeeId_quarterId: { managerId: user.userId, employeeId: data.employeeId, quarterId: activeQuarter.id } },
        });
        if (existing) return conflict("Already evaluated this employee");

        // Validate answers against this quarter's BM question set
        const locked = await prisma.quarterQuestion.findMany({
            where: { quarterId: activeQuarter.id, question: { level: "BRANCH_MANAGER" } },
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
        const bmNormalized = normalizeScore(bmRawScore, lockedIds.size);
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
            },
        });

        // ── Partial promotion (Rule 1) + round-locking (Rule 2) ──
        // Rebuild the branch's Stage 2 shortlist from the evaluations done so
        // far (top-N per track, pruning anyone who has dropped out). The helper
        // no-ops once the Cluster Manager round has started for this branch, so
        // a late BM evaluation can't reshuffle a round CM is already working on.
        const { locked: stage2Locked, added } = await regenerateBranchStage2(prisma, {
            branchId: bmBranchId,
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

        // Progress for the BM UI (generation no longer waits for completion).
        const stage1Targets = await prisma.branchShortlistStage1.findMany({
            where: {
                branchId: bmBranchId,
                quarterId: activeQuarter.id,
                ...(branchType === "BIG" ? { collarType: "WHITE_COLLAR" } : {}),
            },
            select: { userId: true },
        });
        const targetIds = stage1Targets.map((s) => s.userId);
        const bmEvalCount = targetIds.length
            ? await prisma.branchManagerEvaluation.count({
                where: { managerId: user.userId, quarterId: activeQuarter.id, employeeId: { in: targetIds } },
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
