import prisma from "../../../../lib/prisma";
import { withRole } from "../../../../lib/withRole";
import { ok, notFound, fail, serverError } from "../../../../lib/api-response";

/**
 * GET /api/supervisor/shortlist
 * Guards: no active quarter, supervisor not found, shortlist empty.
 */
export const GET = withRole(["SUPERVISOR"], async (request, { user }) => {
    try {
        const supervisor = await prisma.user.findUnique({ where: { id: user.userId }, select: { departmentId: true, department: { select: { name: true } } } });
        if (!supervisor) return notFound("Supervisor account not found");

        const activeQuarter = await prisma.quarter.findFirst({ where: { status: "ACTIVE" }, select: { id: true, name: true } });
        if (!activeQuarter) return notFound("No active quarter found");

        const shortlist = await prisma.shortlistStage1.findMany({
            where: { departmentId: supervisor.departmentId, quarterId: activeQuarter.id },
            orderBy: { rank: "asc" },
            select: { rank: true, userId: true, user: { select: { id: true, name: true, email: true } } },
        });

        if (shortlist.length === 0) {
            return ok({ quarter: activeQuarter, department: supervisor.department.name, totalShortlisted: 0, evaluatedCount: 0, remainingCount: 0, shortlist: [], message: "No employees have been shortlisted yet. Stage 1 self-assessments may not be complete." });
        }

        const evaluated = await prisma.supervisorEvaluation.findMany({
            where: { supervisorId: user.userId, quarterId: activeQuarter.id },
            select: { employeeId: true },
        });
        const evaluatedSet = new Set(evaluated.map((e) => e.employeeId));

        return ok({
            quarter: activeQuarter, department: supervisor.department.name, totalShortlisted: shortlist.length,
            evaluatedCount: evaluatedSet.size, remainingCount: shortlist.length - evaluatedSet.size,
            shortlist: shortlist.map((e) => ({ ...e, alreadyEvaluated: evaluatedSet.has(e.userId) })),
        });
    } catch (err) {
        console.error("Supervisor shortlist error:", err);
        return serverError();
    }
});
