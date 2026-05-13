export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../lib/prisma";
import { withRole } from "../../../../lib/withRole";
import { ok, notFound, fail, serverError } from "../../../../lib/api-response";
import { resolveAllScopeBranches } from "../../../../lib/auth/resolveScopeBranch";

// Fisher-Yates shuffle
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/**
 * GET /api/cluster-manager/shortlist?departmentId=...
 * If departmentId is provided, show shortlist for that department (must be in DepartmentRoleMapping).
 * Otherwise, fall back to user's own departmentId.
 */
export const GET = withRole(["CLUSTER_MANAGER"], async (request, { user }) => {
    try {
        const { searchParams } = new URL(request.url);
        const requestedDeptId = searchParams.get("departmentId");

        // Resolve target department from param or first mapped department (DRM only)
        let deptId = null;
        let deptName = null;

        // Resolve the CM's branch scope. New-model CMs are assigned to a whole
        // branch (ClusterManagerBranchAssignment), legacy CMs to specific
        // departments (DepartmentRoleMapping). Either path should work.
        const cmBranches = await resolveAllScopeBranches({ userId: user.userId, role: "CLUSTER_MANAGER" });
        const cmBranchIds = cmBranches.map((b) => b.id);

        if (requestedDeptId) {
            // The requested department must belong to one of the CM's branches,
            // OR have a legacy DepartmentRoleMapping for this CM.
            const dept = await prisma.department.findUnique({
                where: { id: requestedDeptId },
                select: { id: true, name: true, branchId: true },
            });
            if (!dept) return fail("Department not found", 404);

            const inBranchScope = cmBranchIds.includes(dept.branchId);
            let inDrm = false;
            if (!inBranchScope) {
                const deptRole = await prisma.departmentRoleMapping.findFirst({
                    where: { userId: user.userId, departmentId: requestedDeptId, role: "CLUSTER_MANAGER" },
                    select: { id: true },
                });
                inDrm = !!deptRole;
            }
            if (!inBranchScope && !inDrm) return fail("You are not assigned to this department", 403);
            deptId = dept.id;
            deptName = dept.name;
        } else {
            // No param — pick the first department under the CM's branch scope,
            // falling back to the first DRM-mapped department for legacy users.
            if (cmBranchIds.length > 0) {
                const firstDept = await prisma.department.findFirst({
                    where: { branchId: { in: cmBranchIds } },
                    orderBy: { name: "asc" },
                    select: { id: true, name: true },
                });
                if (firstDept) {
                    deptId = firstDept.id;
                    deptName = firstDept.name;
                }
            }
            if (!deptId) {
                const firstMapping = await prisma.departmentRoleMapping.findFirst({
                    where: { userId: user.userId, role: "CLUSTER_MANAGER" },
                    include: { department: { select: { name: true } } },
                    orderBy: { department: { name: "asc" } },
                });
                if (firstMapping) {
                    deptId = firstMapping.departmentId;
                    deptName = firstMapping.department.name;
                }
            }
            if (!deptId) return fail("No branch or department is assigned to this Cluster Manager. Please contact admin.", 403);
        }

        const activeQuarter = await prisma.quarter.findFirst({ where: { status: "ACTIVE" }, select: { id: true, name: true } });
        if (!activeQuarter) return notFound("No active quarter found");

        // Read the BM-produced Stage 2 shortlist for this branch+quarter and
        // restrict to the requested department. The old per-department
        // `ShortlistStage3` table is no longer populated by the new branch-
        // level flow — querying it returned zero rows and was why the CM
        // dashboard showed "0 employees".
        const targetDept = await prisma.department.findUnique({
            where: { id: deptId },
            select: { branchId: true },
        });
        if (!targetDept) return fail("Department not found", 404);

        const shortlist = await prisma.branchShortlistStage2.findMany({
            where: {
                branchId: targetDept.branchId,
                quarterId: activeQuarter.id,
                user: { departmentId: deptId },
            },
            select: {
                userId: true,
                user: { select: { id: true, name: true, empCode: true, designation: true } },
            },
            orderBy: { rank: "asc" },
        });

        if (shortlist.length === 0) {
            return ok({
                quarter: activeQuarter, department: deptName, departmentId: deptId,
                totalShortlisted: 0, evaluatedCount: 0, remainingCount: 0, employees: [],
                message: "Stage 2 shortlist not generated yet. Branch Manager evaluations may still be in progress.",
            });
        }

        const evaluated = await prisma.clusterManagerEvaluation.findMany({
            where: {
                clusterId: user.userId,
                quarterId: activeQuarter.id,
                employeeId: { in: shortlist.map((s) => s.userId) },
            },
            select: { employeeId: true, cmNormalized: true, cmRawScore: true, finalScore: true },
        });
        const evalMap = new Map(evaluated.map((e) => [e.employeeId, e]));
        const evaluatedSet = new Set(evaluated.map((e) => e.employeeId));

        const employees = shuffleArray(shortlist.map((s) => {
            const ev = evalMap.get(s.userId);
            return {
                id: s.user.id,
                name: s.user.name,
                empCode: s.user.empCode,
                designation: s.user.designation || '',
                departmentName: deptName,
                isEvaluated: !!ev,
                mySubmittedScore: ev ? ev.cmNormalized : null,
                mySubmittedRawScore: ev ? ev.cmRawScore : null,
                myFinalScore: ev ? ev.finalScore : null,
            };
        }));

        return ok({
            quarter: activeQuarter, department: deptName, departmentId: deptId,
            totalShortlisted: shortlist.length,
            evaluatedCount: evaluatedSet.size, remainingCount: shortlist.length - evaluatedSet.size,
            employees
        });
    } catch (err) {
        console.error("CM shortlist error:", err);
        return serverError();
    }
});
