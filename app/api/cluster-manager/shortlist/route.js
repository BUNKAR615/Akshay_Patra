export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../lib/prisma";
import { withRole } from "../../../../lib/withRole";
import { ok, notFound, fail, serverError } from "../../../../lib/api-response";

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

        if (requestedDeptId) {
            // Verify CM is assigned to the requested department
            const deptRole = await prisma.departmentRoleMapping.findFirst({
                where: { userId: user.userId, departmentId: requestedDeptId, role: "CLUSTER_MANAGER" },
                include: { department: { select: { name: true } } },
            });
            if (!deptRole) return fail("You are not assigned to this department", 403);
            deptId = requestedDeptId;
            deptName = deptRole.department.name;
        } else {
            // No param — use first assigned department from DRM
            const firstMapping = await prisma.departmentRoleMapping.findFirst({
                where: { userId: user.userId, role: "CLUSTER_MANAGER" },
                include: { department: { select: { name: true } } },
                orderBy: { department: { name: "asc" } },
            });
            if (!firstMapping) return fail("You are not assigned to any department. Contact admin.", 403);
            deptId = firstMapping.departmentId;
            deptName = firstMapping.department.name;
        }

        const activeQuarter = await prisma.quarter.findFirst({ where: { status: "ACTIVE" }, select: { id: true, name: true } });
        if (!activeQuarter) return notFound("No active quarter found");

        const shortlist = await prisma.shortlistStage3.findMany({
            where: { departmentId: deptId, quarterId: activeQuarter.id },
            select: { userId: true, user: { select: { id: true, name: true, empCode: true, designation: true } } },
        });

        if (shortlist.length === 0) {
            return ok({
                quarter: activeQuarter, department: deptName, departmentId: deptId,
                totalShortlisted: 0, evaluatedCount: 0, remainingCount: 0, employees: [],
                message: "Stage 3 shortlist not generated yet. Branch Manager evaluations may still be in progress.",
            });
        }

        const evaluated = await prisma.clusterManagerEvaluation.findMany({
            where: { clusterId: user.userId, quarterId: activeQuarter.id, employee: { departmentId: deptId } },
            select: { employeeId: true },
        });
        const evaluatedSet = new Set(evaluated.map((e) => e.employeeId));

        const employees = shuffleArray(shortlist.map((s) => ({
            id: s.user.id,
            name: s.user.name,
            empCode: s.user.empCode,
            designation: s.user.designation || '',
            departmentName: deptName,
            isEvaluated: evaluatedSet.has(s.userId)
        })));

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
