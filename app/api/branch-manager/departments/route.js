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

/** GET /api/branch-manager/departments */
export const GET = withRole(["BRANCH_MANAGER"], async (request, { user }) => {
    try {
        const activeQuarter = await prisma.quarter.findFirst({ where: { status: "ACTIVE" }, select: { id: true, name: true } });
        if (!activeQuarter) return notFound("No active quarter found");

        // Only show departments this BM is assigned to via departmentRoleMapping
        const deptMappings = await prisma.departmentRoleMapping.findMany({
            where: { userId: user.userId, role: "BRANCH_MANAGER" },
            include: { department: true },
            orderBy: { department: { name: "asc" } },
        });

        // Fallback: if no mappings, use user's primary department
        if (deptMappings.length === 0) {
            const bmUser = await prisma.user.findUnique({
                where: { id: user.userId },
                select: { departmentId: true, department: true },
            });
            if (bmUser?.department) {
                deptMappings.push({ departmentId: bmUser.departmentId, department: bmUser.department });
            }
        }

        const assignedDepts = deptMappings.map(m => m.department);

        // For each assigned department, find number of S2 shortlists and how many evaluated by this BM
        const departmentsData = await Promise.all(assignedDepts.map(async (dept) => {
            const shortlists = await prisma.shortlistStage2.findMany({
                where: { departmentId: dept.id, quarterId: activeQuarter.id },
                select: { userId: true, user: { select: { id: true, name: true, empCode: true, designation: true } } }
            });

            const evaluated = await prisma.branchManagerEvaluation.findMany({
                where: { managerId: user.userId, quarterId: activeQuarter.id, employee: { departmentId: dept.id } },
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
                alreadyEvaluated: evaluatedSet.has(s.userId), // keeping for backwards compat in UI during transition
                user: s.user // keeping for backwards compat
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
        console.error("BM departments error:", err);
        return serverError();
    }
});
