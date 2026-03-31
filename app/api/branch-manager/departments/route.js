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

        const allDepartments = await prisma.department.findMany({
            orderBy: { name: "asc" }
        });

        // For each department, find number of S2 shortlists and how many evaluated by this BM
        const departmentsData = await Promise.all(allDepartments.map(async (dept) => {
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
