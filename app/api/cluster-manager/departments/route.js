import prisma from "../../../../lib/prisma";
import { withRole } from "../../../../lib/withRole";
import { ok, notFound, serverError } from "../../../../lib/api-response";

/** GET /api/cluster-manager/departments */
export const GET = withRole(["CLUSTER_MANAGER"], async (request, { user }) => {
    try {
        const activeQuarter = await prisma.quarter.findFirst({ where: { status: "ACTIVE" }, select: { id: true, name: true } });
        if (!activeQuarter) return notFound("No active quarter found");

        const allDepartments = await prisma.department.findMany({
            orderBy: { name: "asc" }
        });

        const departmentsData = await Promise.all(allDepartments.map(async (dept) => {
            const shortlists = await prisma.shortlistStage3.findMany({
                where: { departmentId: dept.id, quarterId: activeQuarter.id },
                orderBy: { rank: "asc" },
                select: { userId: true, rank: true, user: { select: { name: true, email: true } } }
            });

            const evaluated = await prisma.clusterManagerEvaluation.findMany({
                where: { clusterId: user.userId, quarterId: activeQuarter.id, employee: { departmentId: dept.id } },
                select: { employeeId: true }
            });

            const evaluatedSet = new Set(evaluated.map(e => e.employeeId));

            return {
                id: dept.id,
                name: dept.name,
                totalToEvaluate: shortlists.length,
                evaluated: evaluatedSet.size,
                completed: shortlists.length > 0 && evaluatedSet.size >= shortlists.length,
                shortlist: shortlists.map(s => ({
                    ...s,
                    alreadyEvaluated: evaluatedSet.has(s.userId)
                }))
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
