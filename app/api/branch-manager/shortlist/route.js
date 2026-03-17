import prisma from "../../../../lib/prisma";
import { withRole } from "../../../../lib/withRole";
import { ok, notFound, serverError } from "../../../../lib/api-response";

/** GET /api/branch-manager/shortlist */
export const GET = withRole(["BRANCH_MANAGER"], async (request, { user }) => {
    try {
        const manager = await prisma.user.findUnique({ where: { id: user.userId }, select: { departmentId: true, department: { select: { name: true } } } });
        if (!manager) return notFound("User not found");

        const activeQuarter = await prisma.quarter.findFirst({ where: { status: "ACTIVE" }, select: { id: true, name: true } });
        if (!activeQuarter) return notFound("No active quarter found");

        const shortlist = await prisma.shortlistStage2.findMany({
            where: { departmentId: manager.departmentId, quarterId: activeQuarter.id },
            orderBy: { rank: "asc" },
            select: { rank: true, userId: true, user: { select: { id: true, name: true, email: true } } },
        });

        if (shortlist.length === 0) {
            return ok({ quarter: activeQuarter, department: manager.department.name, totalShortlisted: 0, evaluatedCount: 0, remainingCount: 0, shortlist: [], message: "Stage 2 shortlist not generated yet. Supervisor evaluations may still be in progress." });
        }

        const evaluated = await prisma.branchManagerEvaluation.findMany({
            where: { managerId: user.userId, quarterId: activeQuarter.id }, select: { employeeId: true },
        });
        const evaluatedSet = new Set(evaluated.map((e) => e.employeeId));

        return ok({
            quarter: activeQuarter, department: manager.department.name, totalShortlisted: shortlist.length,
            evaluatedCount: evaluatedSet.size, remainingCount: shortlist.length - evaluatedSet.size,
            shortlist: shortlist.map((e) => ({ ...e, alreadyEvaluated: evaluatedSet.has(e.userId) })),
        });
    } catch (err) {
        console.error("BM shortlist error:", err);
        return serverError();
    }
});
