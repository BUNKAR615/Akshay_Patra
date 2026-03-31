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

        const supervisor = await prisma.user.findUnique({ where: { id: user.userId }, select: { departmentId: true, department: { select: { name: true } } } });
        if (!supervisor) return notFound("Supervisor account not found");

        let deptId = supervisor.departmentId;
        let deptName = supervisor.department?.name;

        // If a department is requested, verify supervisor is assigned to it
        if (requestedDeptId) {
            const deptRole = await prisma.departmentRoleMapping.findFirst({
                where: { userId: user.userId, departmentId: requestedDeptId, role: "SUPERVISOR" },
                include: { department: { select: { name: true } } },
            });
            if (!deptRole) return fail("You are not assigned as supervisor to this department", 403);
            deptId = requestedDeptId;
            deptName = deptRole.department.name;
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
            where: { supervisorId: user.userId, quarterId: activeQuarter.id },
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
