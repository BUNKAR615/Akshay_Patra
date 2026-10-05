export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../lib/prisma";
import { withRole } from "../../../../lib/withRole";
import { ok, notFound, serverError, forbidden } from "../../../../lib/api-response";
import {
    getEvaluatorBranchScope,
    getUserDelegations,
    loadDelegationIndex,
    filterRowsForEvaluator,
} from "../../../../lib/evaluatorDelegation";

// Fisher-Yates shuffle
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/**
 * Stage 2 shortlist rows of ONE branch that `userId` evaluates at Stage 3:
 * all of them as the branch-default CM, minus departments delegated (POA) to
 * another CM; or only the POA departments when reached through a delegation.
 * Never the user themselves.
 */
async function cmRowsForBranch(userId, branchId, isBranchDefault, quarterId, select) {
    const [stage2, index] = await Promise.all([
        prisma.branchShortlistStage2.findMany({
            where: { branchId, quarterId },
            select,
            orderBy: { rank: "asc" },
        }),
        loadDelegationIndex("CLUSTER_MANAGER", [branchId]),
    ]);
    const rows = stage2.map((s) => ({ ...s, employeeId: s.userId, departmentId: s.user?.departmentId || null }));
    return { rows: filterRowsForEvaluator({ userId, rows, index, isBranchDefault }), index };
}

/**
 * GET /api/cluster-manager/departments
 *
 * Branch-scope semantics:
 *   - ?branchId=<id>  → focus on that branch (must be in the CM's
 *                       ClusterManagerBranchAssignment table, or a branch where
 *                       they hold a Cluster Manager POA; otherwise 403).
 *   - omitted / empty → focus the CM's first branch (initial load).
 *
 * There is no "all branches" mode — the dashboard always shows a single
 * branch and the in-page dropdown switches between the CM's branches.
 *
 * Department POA: in a branch where the CM is the branch default, departments
 * delegated to another CM are excluded; in a POA-only branch only the
 * delegated departments are shown (lib/evaluatorDelegation).
 */
export const GET = withRole(["CLUSTER_MANAGER"], async (request, { user }) => {
    try {
        const activeQuarter = await prisma.quarter.findFirst({ where: { status: "ACTIVE" }, select: { id: true, name: true } });
        if (!activeQuarter) return notFound("No active quarter found");

        const { searchParams } = new URL(request.url);
        const requested = (searchParams.get("branchId") || "").trim();

        // All branches this CM evaluates in — drives the dropdown. Source of
        // truth: ClusterManagerBranchAssignment (NOT user.branchId), plus any
        // branch reached through a department POA.
        const { branches: allAssignedBranches, defaultBranchIds } = await getEvaluatorBranchScope(user.userId, "CLUSTER_MANAGER");
        if (allAssignedBranches.length === 0) {
            return forbidden("You are not assigned to any branch. Please contact your administrator.");
        }

        // Resolve the focus branch. A requested branch must be one of the
        // CM's branches; we never fall back to the JWT branchId (that was the
        // source of the old branch-leak bug).
        let focusBranch;
        if (requested) {
            focusBranch = allAssignedBranches.find((b) => b.id === requested);
            if (!focusBranch) {
                return forbidden("You are not authorized for this branch. Please sign in again.");
            }
        } else {
            focusBranch = allAssignedBranches[0];
        }
        const isBranchDefault = defaultBranchIds.has(focusBranch.id);

        // Stage 2 shortlist for the focus branch, restricted to the employees
        // this user is the resolved Stage 3 evaluator for.
        const { rows: stage2 } = await cmRowsForBranch(user.userId, focusBranch.id, isBranchDefault, activeQuarter.id, {
            userId: true,
            branchId: true,
            collarType: true,
            user: {
                select: {
                    id: true,
                    name: true,
                    empCode: true,
                    designation: true,
                    departmentId: true,
                    collarType: true,
                    department: { select: { id: true, name: true, branchId: true } },
                },
            },
        });

        // Already-submitted Stage 3 evaluations for these candidates (one CM
        // evaluation per employee — see the evaluate route).
        const candidateIds = stage2.map((s) => s.userId);
        const evaluated = candidateIds.length > 0
            ? await prisma.clusterManagerEvaluation.findMany({
                where: {
                    quarterId: activeQuarter.id,
                    employeeId: { in: candidateIds },
                },
                select: { employeeId: true },
            })
            : [];
        const evalSet = new Set(evaluated.map((e) => e.employeeId));

        // Departments of the focus branch so empty departments are visible as
        // zero-state cards. A POA-only branch shows just the POA departments.
        let allDepts;
        if (isBranchDefault) {
            allDepts = await prisma.department.findMany({
                where: { branchId: focusBranch.id },
                select: { id: true, name: true, branchId: true },
                orderBy: [{ branchId: "asc" }, { name: "asc" }],
            });
        } else {
            const poa = await getUserDelegations(user.userId, "CLUSTER_MANAGER");
            allDepts = poa
                .filter((d) => d.branchId === focusBranch.id)
                .map((d) => ({ id: d.departmentId, name: d.department?.name || "", branchId: d.branchId }));
        }

        const stage2ByDept = new Map();
        for (const s of stage2) {
            const deptId = s.user?.department?.id || s.user?.departmentId || "__nodept__";
            if (!stage2ByDept.has(deptId)) stage2ByDept.set(deptId, []);
            stage2ByDept.get(deptId).push(s);
        }

        const departmentsData = allDepts.map((dept) => {
            const rows = stage2ByDept.get(dept.id) || [];
            const evaluatedCount = rows.reduce((n, r) => n + (evalSet.has(r.userId) ? 1 : 0), 0);
            const shuffledEmployees = shuffleArray(rows.map((s) => {
                const done = evalSet.has(s.userId);
                return {
                    id: s.user.id,
                    userId: s.userId,
                    name: s.user.name,
                    empCode: s.user.empCode,
                    designation: s.user.designation || "",
                    // Live user collar wins; Stage-2 snapshot is the fallback
                    // (mirrors the BM shortlist). Drives the WC/BC badge and the
                    // per-employee collar question filter on the CM dashboard.
                    collarType: s.user.collarType || s.collarType || null,
                    // Branch tag — enables the dashboard's "Branch: X" badge
                    // in Total mode without an extra round-trip.
                    branchId: s.branchId,
                    branchName: focusBranch.name || "",
                    // true → evaluated under a department POA, not as branch CM.
                    delegated: !!s.viaDelegation,
                    isEvaluated: done,
                    alreadyEvaluated: done,
                    // Scores are intentionally NOT returned — only the
                    // Committee may see evaluation scores.
                    user: s.user,
                };
            }));
            return {
                id: dept.id,
                name: dept.name,
                branchId: dept.branchId,
                branchName: focusBranch.name || "",
                totalToEvaluate: rows.length,
                evaluated: evaluatedCount,
                completed: rows.length > 0 && evaluatedCount >= rows.length,
                shortlist: shuffledEmployees,
            };
        });

        // Per-branch summary strip for the dashboard — same shape as before
        // so the existing UI chips keep rendering. We compute these for
        // EVERY branch regardless of focus, so all views show identical counts.
        const assignedBranches = await Promise.all(
            allAssignedBranches.map(async (b) => {
                const { rows } = await cmRowsForBranch(
                    user.userId, b.id, defaultBranchIds.has(b.id), activeQuarter.id,
                    { userId: true, user: { select: { departmentId: true } } },
                );
                const stage2UserIds = rows.map((r) => r.userId);
                const evaluatedHere = stage2UserIds.length > 0
                    ? await prisma.clusterManagerEvaluation.count({
                        where: {
                            quarterId: activeQuarter.id,
                            employeeId: { in: stage2UserIds },
                        },
                    })
                    : 0;
                return {
                    id: b.id,
                    name: b.name,
                    branchType: b.branchType,
                    // true → reached only through a department POA.
                    delegated: b.viaDelegationOnly,
                    totalToEvaluate: stage2UserIds.length,
                    evaluated: evaluatedHere,
                    completed: stage2UserIds.length > 0 && evaluatedHere >= stage2UserIds.length,
                };
            })
        );
        const assignedBranchCount = assignedBranches.length;
        const totalToEvaluate = assignedBranches.reduce((n, b) => n + b.totalToEvaluate, 0);
        const totalEvaluated = assignedBranches.reduce((n, b) => n + b.evaluated, 0);

        const delegations = (await getUserDelegations(user.userId, "CLUSTER_MANAGER")).map((d) => ({
            id: d.id,
            branchId: d.branchId,
            branchName: d.branch?.name || "",
            departmentId: d.departmentId,
            departmentName: d.department?.name || "",
        }));

        return ok({
            departments: departmentsData,
            quarter: activeQuarter,
            // The dashboard always focuses a single branch.
            branch: { id: focusBranch.id, name: focusBranch.name, branchType: focusBranch.branchType, delegated: !isBranchDefault },
            mode: "BRANCH",
            assignedBranchCount,
            assignedBranches,
            delegations,
            totals: { totalToEvaluate, evaluated: totalEvaluated },
        });
    } catch (err) {
        console.error("CM departments error:", err);
        return serverError();
    }
});
