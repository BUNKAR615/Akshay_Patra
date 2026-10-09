export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { z } from "zod";
import prisma from "../../../../../lib/prisma";
import { withRole } from "../../../../../lib/withRole";
import { ok, fail, serverError } from "../../../../../lib/api-response";
import { resolveScopeBranch } from "../../../../../lib/auth/resolveScopeBranch";

const bodySchema = z.object({
    hodUserId: z.string().min(1, "hodUserId is required"),
});

/**
 * DELETE /api/branch-manager/hod/remove
 * BM removes an HOD nomination for the active quarter.
 *
 * Effects (single transaction):
 *   - Drops the EmployeeHodAssignment rows for (hodUserId, quarterId) of
 *     employees this HOD has NOT evaluated yet. Those become "orphaned" — the
 *     BM shortlist endpoint then picks them up so they don't fall through the
 *     cracks (see lib/bmEvaluationQueue.js). Employees the HOD already
 *     evaluated keep their link: their Stage 2 is done and stays credited to
 *     this HOD on the BM page, matching the admin pipeline.
 *   - Drops every HodAssignment row for (hodUserId, branchId, quarterId).
 *   - Drops the matching DepartmentRoleMapping rows so the user is no longer
 *     listed as HOD of those departments.
 *
 * Intentionally untouched:
 *   - User.passwordHod and User.role. Login already gates the secondary HOD
 *     password on the existence of an active HodAssignment
 *     (app/api/auth/login/route.js), so removing the assignment is enough to
 *     disable the HOD login path. Leaving these fields means a re-nomination
 *     later does not need a password reset.
 */
export const DELETE = withRole(["BRANCH_MANAGER"], async (request, { user }) => {
    try {
        const body = await request.json().catch(() => ({}));
        const parsed = bodySchema.safeParse(body);
        if (!parsed.success) return fail(parsed.error.errors[0].message);
        const { hodUserId } = parsed.data;

        const { branchId, branch } = await resolveScopeBranch(user);
        if (!branchId) return fail("Could not determine your branch");
        if (branch?.branchType !== "BIG") return fail("HOD removal is only available for big branches");

        const hodUser = await prisma.user.findUnique({
            where: { id: hodUserId },
            select: { id: true, name: true, branchId: true, department: { select: { branchId: true } } },
        });
        if (!hodUser) return fail("HOD user not found");
        const userBranchId = hodUser.branchId || hodUser.department?.branchId || null;
        if (!userBranchId || userBranchId !== branchId) {
            return fail(`${hodUser.name} is not in your branch`);
        }

        const quarter = await prisma.quarter.findFirst({
            where: { status: "ACTIVE" },
            select: { id: true },
        });
        if (!quarter) return fail("No active quarter");

        // Snapshot what we're about to remove (for audit + UI feedback).
        const existingAssignments = await prisma.hodAssignment.findMany({
            where: { hodUserId, branchId, quarterId: quarter.id },
            select: { departmentId: true },
        });
        const departmentIds = existingAssignments.map((a) => a.departmentId);

        const [empRows, evalRows] = await Promise.all([
            prisma.employeeHodAssignment.findMany({
                where: { hodUserId, quarterId: quarter.id },
                select: { employeeId: true },
            }),
            prisma.hodEvaluation.findMany({
                where: { hodId: hodUserId, quarterId: quarter.id },
                select: { employeeId: true },
            }),
        ]);
        const evaluatedIds = new Set(evalRows.map((r) => r.employeeId));
        const releasedEmployeeIds = empRows.map((r) => r.employeeId).filter((id) => !evaluatedIds.has(id));

        await prisma.$transaction([
            prisma.employeeHodAssignment.deleteMany({
                where: { hodUserId, quarterId: quarter.id, employeeId: { in: releasedEmployeeIds } },
            }),
            prisma.hodAssignment.deleteMany({
                where: { hodUserId, branchId, quarterId: quarter.id },
            }),
            prisma.departmentRoleMapping.deleteMany({
                where: { userId: hodUserId, role: "HOD", departmentId: { in: departmentIds } },
            }),
        ]);

        await prisma.auditLog.create({
            data: {
                userId: user.userId,
                action: "HOD_REMOVED",
                details: {
                    hodUserId,
                    hodName: hodUser.name,
                    branchId,
                    quarterId: quarter.id,
                    departmentIdsCleared: departmentIds,
                    employeesReleasedCount: releasedEmployeeIds.length,
                    employeesKeptEvaluated: evaluatedIds.size,
                },
            },
        }).catch(() => { });

        return ok({
            message: `${hodUser.name} removed as HOD. ${releasedEmployeeIds.length} blue-collar employee${releasedEmployeeIds.length === 1 ? "" : "s"} returned to your evaluation queue.`
                + (evaluatedIds.size > 0 ? ` ${evaluatedIds.size} already evaluated by them stay credited to them.` : ""),
            releasedEmployeeIds,
            departmentIdsCleared: departmentIds,
        });
    } catch (err) {
        console.error("[HOD-REMOVE] Error:", err.message);
        return serverError();
    }
});
