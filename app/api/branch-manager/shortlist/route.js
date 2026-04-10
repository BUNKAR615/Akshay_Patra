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

/** GET /api/branch-manager/shortlist */
export const GET = withRole(["BRANCH_MANAGER"], async (request, { user }) => {
    try {
        const { searchParams } = new URL(request.url);
        const requestedDeptId = searchParams.get("departmentId");

        // Resolve target department from param or first mapped department (DRM only)
        let deptId = null;
        let deptName = null;

        if (requestedDeptId) {
            // Verify BM is assigned to the requested department
            const deptRole = await prisma.departmentRoleMapping.findFirst({
                where: { userId: user.userId, departmentId: requestedDeptId, role: "BRANCH_MANAGER" },
                include: { department: { select: { name: true } } },
            });
            if (!deptRole) return fail("You are not assigned to this department", 403);
            deptId = requestedDeptId;
            deptName = deptRole.department.name;
        } else {
            // No param — use first assigned department from DRM
            const firstMapping = await prisma.departmentRoleMapping.findFirst({
                where: { userId: user.userId, role: "BRANCH_MANAGER" },
                include: { department: { select: { name: true } } },
                orderBy: { department: { name: "asc" } },
            });
            if (!firstMapping) return fail("You are not assigned to any department. Contact admin.", 403);
            deptId = firstMapping.departmentId;
            deptName = firstMapping.department.name;
        }

        const activeQuarter = await prisma.quarter.findFirst({ where: { status: "ACTIVE" }, select: { id: true, name: true } });
        if (!activeQuarter) return notFound("No active quarter found");

        const shortlist = await prisma.shortlistStage2.findMany({
            where: { departmentId: deptId, quarterId: activeQuarter.id },
            select: { userId: true, user: { select: { id: true, name: true, empCode: true, designation: true } } },
        });

        if (shortlist.length === 0) {
            return ok({ quarter: activeQuarter, department: deptName, departmentId: deptId, totalShortlisted: 0, evaluatedCount: 0, remainingCount: 0, employees: [], message: "Stage 2 shortlist not generated yet. Supervisor evaluations may still be in progress." });
        }

        const evaluated = await prisma.branchManagerEvaluation.findMany({
            where: { managerId: user.userId, quarterId: activeQuarter.id, employee: { departmentId: deptId } },
            select: { employeeId: true, bmNormalized: true, bmRawScore: true },
        });
        const evalMap = new Map(evaluated.map((e) => [e.employeeId, e]));

        const employees = shuffleArray(shortlist.map((s) => {
            const ev = evalMap.get(s.userId);
            return {
                id: s.user.id,
                name: s.user.name,
                empCode: s.user.empCode,
                designation: s.user.designation || '',
                departmentName: deptName,
                isEvaluated: !!ev,
                mySubmittedScore: ev ? ev.bmNormalized : null,
                mySubmittedRawScore: ev ? ev.bmRawScore : null,
            };
        }));

        return ok({
            quarter: activeQuarter, department: deptName, departmentId: deptId, totalShortlisted: shortlist.length,
            evaluatedCount: evaluatedSet.size, remainingCount: shortlist.length - evaluatedSet.size,
            employees
        });
    } catch (err) {
        console.error("BM shortlist error:", err);
        return serverError();
    }
});
