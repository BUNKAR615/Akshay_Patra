export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../../lib/prisma";
import { withRole } from "../../../../../lib/withRole";
import { created, fail, conflict, serverError, validateBody } from "../../../../../lib/api-response";
import { z } from "zod";

const assignRoleSchema = z.object({
    userId: z.string().min(1),
    departmentId: z.string().min(1),
    role: z.enum(["SUPERVISOR", "BRANCH_MANAGER", "CLUSTER_MANAGER"]),
});

/**
 * POST /api/admin/departments/assign-role
 * Assigns a user as evaluator for a specific department.
 */
export const POST = withRole(["ADMIN"], async (request, { user }) => {
    try {
        const { data, error } = await validateBody(request, assignRoleSchema);
        if (error) return error;

        // Validate user exists and role matches
        const targetUser = await prisma.user.findUnique({
            where: { id: data.userId },
            select: { id: true, name: true, role: true },
        });
        if (!targetUser) return fail("User not found");
        if (targetUser.role !== data.role) {
            return fail(`User "${targetUser.name}" has role ${targetUser.role}, cannot assign as ${data.role}`);
        }

        // Validate department exists
        const dept = await prisma.department.findUnique({ where: { id: data.departmentId }, select: { id: true, name: true } });
        if (!dept) return fail("Department not found");

        // For SUPERVISOR and BRANCH_MANAGER — only one per department
        if (data.role === "SUPERVISOR" || data.role === "BRANCH_MANAGER") {
            const existing = await prisma.departmentRoleMapping.findFirst({
                where: { departmentId: data.departmentId, role: data.role },
                include: { user: { select: { name: true } } },
            });
            if (existing && existing.userId !== data.userId) {
                return conflict(
                    `Department "${dept.name}" already has a ${data.role}: ${existing.user.name}. Remove them first.`
                );
            }
        }

        // Upsert the DepartmentRoleMapping + update Department FK + sync user departmentId — atomically
        const deptRole = await prisma.$transaction(async (tx) => {
            const role = await tx.DepartmentRoleMapping.upsert({
                where: { userId_departmentId_role: { userId: data.userId, departmentId: data.departmentId, role: data.role } },
                update: { assignedAt: new Date() },
                create: { userId: data.userId, departmentId: data.departmentId, role: data.role },
            });

            // Update Department FK shortcuts
            if (data.role === "SUPERVISOR") {
                await tx.department.update({ where: { id: data.departmentId }, data: { supervisorId: data.userId } });
            } else if (data.role === "BRANCH_MANAGER") {
                await tx.department.update({ where: { id: data.departmentId }, data: { branchManagerId: data.userId } });
            }

            // Sync user's departmentId
            await tx.user.update({ where: { id: data.userId }, data: { departmentId: data.departmentId } });

            return role;
        });

        await prisma.auditLog.create({
            data: {
                userId: user.userId,
                action: "DEPARTMENT_ROLE_ASSIGNED",
                details: {
                    targetUserId: data.userId,
                    targetUserName: targetUser.name,
                    departmentId: data.departmentId,
                    departmentName: dept.name,
                    role: data.role,
                    message: `User ${targetUser.name} assigned as ${data.role} for ${dept.name}`,
                },
            },
        });

        return created({
            message: `${targetUser.name} assigned as ${data.role} for ${dept.name}`,
            assignment: { id: deptRole.id, userId: data.userId, departmentId: data.departmentId, role: data.role },
        });
    } catch (err) {
        console.error("Assign role error:", err);
        return serverError();
    }
});
