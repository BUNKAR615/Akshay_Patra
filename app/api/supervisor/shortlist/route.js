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
 * GET /api/supervisor/shortlist?departmentId=xxx
 * Now supports multi-department supervisors via departmentRoleMapping.
 * If no departmentId param is provided, falls back to user's primary department.
 */
export const GET = withRole(["SUPERVISOR"], async (request, { user }) => {
    try {
        const { searchParams } = new URL(request.url);
        const requestedDeptId = searchParams.get("departmentId");

        // Resolve target department from param or first mapped department (DRM first, primary-dept fallback)
        let deptId = null;
        let deptName = null;

        if (requestedDeptId) {
            // Verify supervisor is assigned to the requested department
            const deptRole = await prisma.departmentRoleMapping.findFirst({
                where: { userId: user.userId, departmentId: requestedDeptId, role: "SUPERVISOR" },
                include: { department: { select: { name: true } } },
            });
            if (!deptRole) return fail("You are not assigned as supervisor to this department", 403);
            deptId = requestedDeptId;
            deptName = deptRole.department.name;
        } else {
            // No param — use first DRM mapping, or fall back to primary department
            const firstMapping = await prisma.departmentRoleMapping.findFirst({
                where: { userId: user.userId, role: "SUPERVISOR" },
                include: { department: { select: { name: true } } },
                orderBy: { department: { name: "asc" } },
            });
            if (firstMapping) {
                deptId = firstMapping.departmentId;
                deptName = firstMapping.department.name;
            } else {
                // Legacy fallback: primary department
                const supervisor = await prisma.user.findUnique({
                    where: { id: user.userId },
                    select: { departmentId: true, department: { select: { name: true } } },
                });
                if (!supervisor?.departmentId) return fail("You are not assigned to any department. Contact admin.", 403);
                deptId = supervisor.departmentId;
                deptName = supervisor.department?.name;
            }
        }

        const activeQuarter = await prisma.quarter.findFirst({ where: { status: "ACTIVE" }, select: { id: true, name: true } });
        if (!activeQuarter) return notFound("No active quarter found");

        const shortlist = await prisma.shortlistStage1.findMany({
            where: { departmentId: deptId, quarterId: activeQuarter.id },
            select: { userId: true, user: { select: { id: true, name: true, empCode: true, designation: true } } },
        });

        if (shortlist.length === 0) {
            return ok({ quarter: activeQuarter, department: deptName, departmentId: deptId, totalShortlisted: 0, evaluatedCount: 0, remainingCount: 0, employees: [], message: "No employees have been shortlisted yet. Stage 1 self-assessments may not be complete." });
        }

        const evaluated = await prisma.supervisorEvaluation.findMany({
            where: { supervisorId: user.userId, quarterId: activeQuarter.id, employee: { departmentId: deptId } },
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
            quarter: activeQuarter, department: deptName, departmentId: deptId, totalShortlisted: shortlist.length,
            evaluatedCount: evaluatedSet.size, remainingCount: shortlist.length - evaluatedSet.size,
            employees
        });
    } catch (err) {
        console.error("Supervisor shortlist error:", err);
        return serverError();
    }
});
