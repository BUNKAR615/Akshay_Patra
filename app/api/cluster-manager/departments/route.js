export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../lib/prisma";
import { withRole } from "../../../../lib/withRole";
import { ok, notFound, serverError, forbidden } from "../../../../lib/api-response";
import { resolveScopeBranch, resolveAllScopeBranches } from "../../../../lib/auth/resolveScopeBranch";

// Fisher-Yates shuffle
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/**
 * GET /api/cluster-manager/departments
 *
 * Branch-scope semantics:
 *   - ?branchId=<id>  → focus on that branch (must be in the CM's
 *                       ClusterManagerBranchAssignment table; otherwise 403).
 *   - omitted / empty / "ALL" → "Total" mode: data merged across EVERY branch
 *                       the CM is assigned to. Each shortlist row carries a
 *                       branchId/branchName so the dashboard can label it.
 *
 * "Total" is the new default behaviour of the dashboard (the pre-login
 * branch picker has been removed). The single-branch view is preserved for
 * the dropdown's per-branch options.
 */
export const GET = withRole(["CLUSTER_MANAGER"], async (request, { user }) => {
    try {
        const activeQuarter = await prisma.quarter.findFirst({ where: { status: "ACTIVE" }, select: { id: true, name: true } });
        if (!activeQuarter) return notFound("No active quarter found");

        const { searchParams } = new URL(request.url);
        const requested = (searchParams.get("branchId") || "").trim();
        const isTotal = !requested || requested.toUpperCase() === "ALL";

        // All branches this CM is assigned to — drives both the dropdown
        // and the data source for Total mode. Source of truth: the
        // ClusterManagerBranchAssignment table (NOT user.branchId).
        const allAssignedBranches = await resolveAllScopeBranches({
            userId: user.userId,
            role: "CLUSTER_MANAGER",
        });
        if (allAssignedBranches.length === 0) {
            return forbidden("You are not assigned to any branch. Please contact your administrator.");
        }

        // Validate the focus branch when one was requested. We do NOT fall
        // back to the JWT branchId here — that was the source of the old
        // branch-leak bug. Either Total (no validation needed) or a branch
        // explicitly present in the CM's assignment table.
        let focusBranch = null;
        if (!isTotal) {
            const { branch } = await resolveScopeBranch({
                userId: user.userId,
                role: "CLUSTER_MANAGER",
                branchId: requested,
            });
            if (!branch) {
                return forbidden("You are not authorized for this branch. Please sign in again.");
            }
            focusBranch = branch;
        }

        const targetBranches = isTotal
            ? allAssignedBranches.map((b) => ({ id: b.id, name: b.name, branchType: b.branchType }))
            : [{ id: focusBranch.id, name: focusBranch.name, branchType: focusBranch.branchType }];
        const targetBranchIds = targetBranches.map((b) => b.id);
        const branchById = new Map(targetBranches.map((b) => [b.id, b]));

        // Stage 2 shortlist for the target branches. Each row carries
        // branchId so we can group by branch in Total mode.
        const stage2 = await prisma.branchShortlistStage2.findMany({
            where: { branchId: { in: targetBranchIds }, quarterId: activeQuarter.id },
            select: {
                userId: true,
                branchId: true,
                user: {
                    select: {
                        id: true,
                        name: true,
                        empCode: true,
                        designation: true,
                        departmentId: true,
                        department: { select: { id: true, name: true, branchId: true } },
                    },
                },
            },
            orderBy: { rank: "asc" },
        });

        // CM's already-submitted evaluations for these candidates.
        const candidateIds = stage2.map((s) => s.userId);
        const evaluated = candidateIds.length > 0
            ? await prisma.clusterManagerEvaluation.findMany({
                where: {
                    clusterId: user.userId,
                    quarterId: activeQuarter.id,
                    employeeId: { in: candidateIds },
                },
                select: { employeeId: true, cmNormalized: true, cmRawScore: true, finalScore: true },
            })
            : [];
        const evalMap = new Map(evaluated.map((e) => [e.employeeId, e]));

        // Departments under the target branch(es) so empty departments are
        // visible as zero-state cards in the focused-branch view. In Total
        // mode the dashboard renders by branch tags on each row instead.
        const allDepts = await prisma.department.findMany({
            where: { branchId: { in: targetBranchIds } },
            select: { id: true, name: true, branchId: true },
            orderBy: [{ branchId: "asc" }, { name: "asc" }],
        });

        const stage2ByDept = new Map();
        for (const s of stage2) {
            const deptId = s.user?.department?.id || s.user?.departmentId || "__nodept__";
            if (!stage2ByDept.has(deptId)) stage2ByDept.set(deptId, []);
            stage2ByDept.get(deptId).push(s);
        }

        const departmentsData = allDepts.map((dept) => {
            const rows = stage2ByDept.get(dept.id) || [];
            const evaluatedCount = rows.reduce((n, r) => n + (evalMap.has(r.userId) ? 1 : 0), 0);
            const shuffledEmployees = shuffleArray(rows.map((s) => {
                const ev = evalMap.get(s.userId);
                const b = branchById.get(s.branchId);
                return {
                    id: s.user.id,
                    userId: s.userId,
                    name: s.user.name,
                    empCode: s.user.empCode,
                    designation: s.user.designation || "",
                    // Branch tag — enables the dashboard's "Branch: X" badge
                    // in Total mode without an extra round-trip.
                    branchId: s.branchId,
                    branchName: b?.name || "",
                    isEvaluated: !!ev,
                    alreadyEvaluated: !!ev,
                    // Scores are intentionally NOT returned — only the
                    // Committee may see evaluation scores.
                    user: s.user,
                };
            }));
            return {
                id: dept.id,
                name: dept.name,
                branchId: dept.branchId,
                branchName: branchById.get(dept.branchId)?.name || "",
                totalToEvaluate: rows.length,
                evaluated: evaluatedCount,
                completed: rows.length > 0 && evaluatedCount >= rows.length,
                shortlist: shuffledEmployees,
            };
        });

        // Per-branch summary strip for the dashboard — same shape as before
        // so the existing UI chips keep rendering. We compute these for
        // EVERY assigned branch regardless of focus mode, so Total and
        // single-branch views show identical counts.
        const assignedBranches = await Promise.all(
            allAssignedBranches.map(async (b) => {
                const stage2Rows = await prisma.branchShortlistStage2.findMany({
                    where: { branchId: b.id, quarterId: activeQuarter.id },
                    select: { userId: true },
                });
                const stage2UserIds = stage2Rows.map((r) => r.userId);
                const evaluatedHere = stage2UserIds.length > 0
                    ? await prisma.clusterManagerEvaluation.count({
                        where: {
                            clusterId: user.userId,
                            quarterId: activeQuarter.id,
                            employeeId: { in: stage2UserIds },
                        },
                    })
                    : 0;
                return {
                    id: b.id,
                    name: b.name,
                    branchType: b.branchType,
                    totalToEvaluate: stage2UserIds.length,
                    evaluated: evaluatedHere,
                    completed: stage2UserIds.length > 0 && evaluatedHere >= stage2UserIds.length,
                };
            })
        );
        const assignedBranchCount = assignedBranches.length;
        const totalToEvaluate = assignedBranches.reduce((n, b) => n + b.totalToEvaluate, 0);
        const totalEvaluated = assignedBranches.reduce((n, b) => n + b.evaluated, 0);

        return ok({
            departments: departmentsData,
            quarter: activeQuarter,
            // `branch` is null in Total mode so the UI knows there is no
            // single-branch focus. The per-branch chip strip and the
            // assignedBranches array still drive the dropdown.
            branch: isTotal
                ? null
                : { id: focusBranch.id, name: focusBranch.name, branchType: focusBranch.branchType },
            mode: isTotal ? "TOTAL" : "BRANCH",
            assignedBranchCount,
            assignedBranches,
            totals: { totalToEvaluate, evaluated: totalEvaluated },
        });
    } catch (err) {
        console.error("CM departments error:", err);
        return serverError();
    }
});
