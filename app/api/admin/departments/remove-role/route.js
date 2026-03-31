export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../../lib/prisma";
import { withRole } from "../../../../../lib/withRole";
import { ok, fail, serverError, validateBody } from "../../../../../lib/api-response";
import { z } from "zod";

const removeRoleSchema = z.object({
    userId: z.string().min(1),
    departmentId: z.string().min(1),
    role: z.enum(["SUPERVISOR", "BRANCH_MANAGER", "CLUSTER_MANAGER"]),
});

/**
 * DELETE /api/admin/departments/remove-role
 * Removes a role assignment from a department.
 */
export const DELETE = withRole(["ADMIN"], async (request, { user }) => {
    try {
        const { data, error } = await validateBody(request, removeRoleSchema);
        if (error) return error;

        const existing = await prisma.departmentRoleMapping.findUnique({
            where: { userId_departmentId_role: { userId: data.userId, departmentId: data.departmentId, role: data.role } },
            include: { user: { select: { name: true } }, department: { select: { name: true } } },
        });
        if (!existing) return fail("Role assignment not found");

        await prisma.$transaction(async (tx) => {
            await tx.DepartmentRoleMapping.delete({ where: { id: existing.id } });

            // Clear department FK shortcuts
            if (data.role === "SUPERVISOR") {
                await tx.department.update({ where: { id: data.departmentId }, data: { supervisorId: null } });
            } else if (data.role === "BRANCH_MANAGER") {
                await tx.department.update({ where: { id: data.departmentId }, data: { branchManagerId: null } });
            }
        });

        await prisma.auditLog.create({
            data: {
                userId: user.userId,
                action: "DEPARTMENT_ROLE_REMOVED",
                details: {
                    targetUserId: data.userId,
                    targetUserName: existing.user.name,
                    departmentId: data.departmentId,
                    departmentName: existing.department.name,
                    role: data.role,
                    message: `Removed ${existing.user.name} as ${data.role} from ${existing.department.name}`,
                },
            },
        });

        return ok({ message: `Removed ${existing.user.name} as ${data.role} from ${existing.department.name}` });
    } catch (err) {
        console.error("Remove role error:", err);
        return serverError();
    }
});
