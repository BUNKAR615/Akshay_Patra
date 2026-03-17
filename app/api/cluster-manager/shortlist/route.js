import prisma from "../../../../lib/prisma";
import { withRole } from "../../../../lib/withRole";
import { ok, notFound, fail, serverError } from "../../../../lib/api-response";

/**
 * GET /api/cluster-manager/shortlist?departmentId=...
 * If departmentId is provided, show shortlist for that department (must be in DepartmentRole).
 * Otherwise, fall back to user's own departmentId.
 */
export const GET = withRole(["CLUSTER_MANAGER"], async (request, { user }) => {
    try {
        const { searchParams } = new URL(request.url);
        const requestedDeptId = searchParams.get("departmentId");

        const manager = await prisma.user.findUnique({
            where: { id: user.userId },
            select: { departmentId: true, department: { select: { name: true } } },
        });
        if (!manager) return notFound("User not found");

        let deptId = manager.departmentId;
        let deptName = manager.department.name;

        // If a department is requested, verify CM is assigned to it
        if (requestedDeptId) {
            const deptRole = await prisma.departmentRole.findFirst({
                where: { userId: user.userId, departmentId: requestedDeptId, role: "CLUSTER_MANAGER" },
                include: { department: { select: { name: true } } },
            });
            if (!deptRole) return fail("You are not assigned to this department", 403);
            deptId = requestedDeptId;
            deptName = deptRole.department.name;
        }

        const activeQuarter = await prisma.quarter.findFirst({ where: { status: "ACTIVE" }, select: { id: true, name: true } });
        if (!activeQuarter) return notFound("No active quarter found");

        const shortlist = await prisma.shortlistStage3.findMany({
            where: { departmentId: deptId, quarterId: activeQuarter.id },
            orderBy: { rank: "asc" },
            select: { rank: true, userId: true, user: { select: { id: true, name: true, email: true } } },
        });

        if (shortlist.length === 0) {
            return ok({
                quarter: activeQuarter, department: deptName, departmentId: deptId,
                totalShortlisted: 0, evaluatedCount: 0, remainingCount: 0, shortlist: [],
                message: "Stage 3 shortlist not generated yet. Branch Manager evaluations may still be in progress.",
            });
        }

        const evaluated = await prisma.clusterManagerEvaluation.findMany({
            where: { clusterId: user.userId, quarterId: activeQuarter.id, employee: { departmentId: deptId } },
            select: { employeeId: true },
        });
        const evaluatedSet = new Set(evaluated.map((e) => e.employeeId));

        return ok({
            quarter: activeQuarter, department: deptName, departmentId: deptId,
            totalShortlisted: shortlist.length,
            evaluatedCount: evaluatedSet.size, remainingCount: shortlist.length - evaluatedSet.size,
            shortlist: shortlist.map((e) => ({ ...e, alreadyEvaluated: evaluatedSet.has(e.userId) })),
        });
    } catch (err) {
        console.error("CM shortlist error:", err);
        return serverError();
    }
});
