export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../lib/prisma";
import { withRole } from "../../../../lib/withRole";
import { ok, notFound, serverError } from "../../../../lib/api-response";

// Fisher-Yates shuffle
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/** GET /api/supervisor/departments
 *  Returns all departments the supervisor is assigned to (via departmentRoleMapping),
 *  along with shortlisted employees and evaluation progress per department.
 */
export const GET = withRole(["SUPERVISOR"], async (request, { user }) => {
    try {
        const activeQuarter = await prisma.quarter.findFirst({ where: { status: "ACTIVE" }, select: { id: true, name: true } });
        if (!activeQuarter) return notFound("No active quarter found");

        // Get all departments this supervisor is assigned to
        const deptMappings = await prisma.departmentRoleMapping.findMany({
            where: { userId: user.userId, role: "SUPERVISOR" },
            include: { department: true },
            orderBy: { department: { name: "asc" } },
        });

        // If no mappings found, fall back to user's primary department
        let departmentIds = deptMappings.map(m => m.departmentId);
        if (departmentIds.length === 0) {
            const supervisor = await prisma.user.findUnique({
                where: { id: user.userId },
                select: { departmentId: true, department: { select: { id: true, name: true } } },
            });
            if (supervisor?.departmentId) {
                departmentIds = [supervisor.departmentId];
                deptMappings.push({
                    departmentId: supervisor.departmentId,
                    department: supervisor.department,
                });
            }
        }

        const departmentsData = await Promise.all(deptMappings.map(async (mapping) => {
            const dept = mapping.department;

            const shortlists = await prisma.shortlistStage1.findMany({
                where: { departmentId: dept.id, quarterId: activeQuarter.id },
                select: { userId: true, user: { select: { id: true, name: true, empCode: true, designation: true } } },
            });

            const evaluated = await prisma.supervisorEvaluation.findMany({
                where: { supervisorId: user.userId, quarterId: activeQuarter.id, employee: { departmentId: dept.id } },
                select: { employeeId: true },
            });
            const evaluatedSet = new Set(evaluated.map(e => e.employeeId));

            const shuffledEmployees = shuffleArray(shortlists.map(s => ({
                id: s.user.id,
                userId: s.userId,
                name: s.user.name,
                empCode: s.user.empCode,
                designation: s.user.designation || '',
                departmentName: dept.name,
                isEvaluated: evaluatedSet.has(s.userId),
            })));

            return {
                id: dept.id,
                name: dept.name,
                totalToEvaluate: shortlists.length,
                evaluated: evaluatedSet.size,
                completed: shortlists.length > 0 && evaluatedSet.size >= shortlists.length,
                shortlist: shuffledEmployees,
            };
        }));

        return ok({
            departments: departmentsData,
            quarter: activeQuarter,
        });
    } catch (err) {
        console.error("Supervisor departments error:", err);
        return serverError();
    }
});
