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

/** GET /api/cluster-manager/departments */
export const GET = withRole(["CLUSTER_MANAGER"], async (request, { user }) => {
    try {
        const activeQuarter = await prisma.quarter.findFirst({ where: { status: "ACTIVE" }, select: { id: true, name: true } });
        if (!activeQuarter) return notFound("No active quarter found");

        // Only show departments this CM is assigned to via departmentRoleMapping
        const deptMappings = await prisma.departmentRoleMapping.findMany({
            where: { userId: user.userId, role: "CLUSTER_MANAGER" },
            include: { department: true },
            orderBy: { department: { name: "asc" } },
        });

        // No fallback — CM must be assigned via DRM.
        // If no mappings, return empty so the frontend shows a clear message.
        const assignedDepts = deptMappings.map(m => m.department);

        const departmentsData = await Promise.all(assignedDepts.map(async (dept) => {
            const shortlists = await prisma.shortlistStage3.findMany({
                where: { departmentId: dept.id, quarterId: activeQuarter.id },
                select: { userId: true, user: { select: { id: true, name: true, empCode: true, designation: true } } }
            });

            const evaluated = await prisma.clusterManagerEvaluation.findMany({
                where: { clusterId: user.userId, quarterId: activeQuarter.id, employee: { departmentId: dept.id } },
                select: { employeeId: true }
            });

            const evaluatedSet = new Set(evaluated.map(e => e.employeeId));

            const shuffledEmployees = shuffleArray(shortlists.map(s => ({
                id: s.user.id,
                userId: s.userId,
                name: s.user.name,
                empCode: s.user.empCode,
                designation: s.user.designation || '',
                isEvaluated: evaluatedSet.has(s.userId),
                alreadyEvaluated: evaluatedSet.has(s.userId),
                user: s.user
            })));

            return {
                id: dept.id,
                name: dept.name,
                totalToEvaluate: shortlists.length,
                evaluated: evaluatedSet.size,
                completed: shortlists.length > 0 && evaluatedSet.size >= shortlists.length,
                shortlist: shuffledEmployees
            };
        }));

        return ok({
            departments: departmentsData,
            quarter: activeQuarter
        });
    } catch (err) {
        console.error("CM departments error:", err);
        return serverError();
    }
});
