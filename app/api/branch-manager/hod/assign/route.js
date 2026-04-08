export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../../lib/prisma";
import { withRole } from "../../../../../lib/withRole";
import { ok, fail, serverError, created } from "../../../../../lib/api-response";
import { assignHodSchema } from "../../../../../lib/validators";

/**
 * POST /api/branch-manager/hod/assign
 * BM assigns an HOD to a department for big branches.
 * Only available for big branch BMs.
 */
export const POST = withRole(["BRANCH_MANAGER", "ADMIN"], async (request, { user }) => {
    try {
        const body = await request.json();
        const result = assignHodSchema.safeParse(body);
        if (!result.success) return fail(result.error.errors[0].message);
        const { hodUserId, departmentId } = result.data;

        // Get BM's branch info
        const bmUser = await prisma.user.findUnique({
            where: { id: user.userId },
            select: { department: { select: { branchId: true, branch: { select: { branchType: true, name: true } } } } }
        });

        const branchId = bmUser?.department?.branchId;
        if (!branchId) return fail("Could not determine your branch");

        const branchType = bmUser.department.branch.branchType;
        if (branchType !== "BIG") return fail("HOD assignment is only available for big branches (Jaipur, Nathdwara)");

        // Verify department belongs to same branch
        const dept = await prisma.department.findUnique({
            where: { id: departmentId },
            select: { id: true, name: true, branchId: true }
        });
        if (!dept || dept.branchId !== branchId) return fail("Department does not belong to your branch");

        // Verify HOD user exists
        const hodUser = await prisma.user.findUnique({
            where: { id: hodUserId },
            select: { id: true, name: true, empCode: true, departmentId: true }
        });
        if (!hodUser) return fail("HOD user not found");

        // Get active quarter
        const quarter = await prisma.quarter.findFirst({ where: { status: "ACTIVE" } });
        if (!quarter) return fail("No active quarter");

        // Create or update HOD assignment
        const assignment = await prisma.hodAssignment.upsert({
            where: {
                hodUserId_departmentId_quarterId: {
                    hodUserId,
                    departmentId,
                    quarterId: quarter.id
                }
            },
            update: { assignedBy: user.userId },
            create: {
                hodUserId,
                branchId,
                departmentId,
                quarterId: quarter.id,
                assignedBy: user.userId,
            }
        });

        // Also create DepartmentRoleMapping for HOD if not exists
        await prisma.departmentRoleMapping.upsert({
            where: {
                userId_departmentId_role: {
                    userId: hodUserId,
                    departmentId,
                    role: "HOD"
                }
            },
            update: {},
            create: {
                userId: hodUserId,
                departmentId,
                role: "HOD"
            }
        });

        await prisma.auditLog.create({
            data: {
                userId: user.userId,
                action: "HOD_ASSIGNED",
                details: {
                    hodUserId, hodName: hodUser.name,
                    departmentId, departmentName: dept.name,
                    quarterId: quarter.id, branchId
                }
            }
        }).catch(() => {});

        return created({
            message: `${hodUser.name} assigned as HOD for ${dept.name}`,
            assignment
        });
    } catch (err) {
        console.error("[HOD-ASSIGN] Error:", err.message);
        return serverError();
    }
});
