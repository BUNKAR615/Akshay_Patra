export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../../lib/prisma";
import { withRole } from "../../../../../lib/withRole";
import { created, fail, serverError, validateBody } from "../../../../../lib/api-response";
import { z } from "zod";

const assignRoleSchema = z.object({
    userId: z.string().min(1),
    departmentId: z.string().min(1),
    role: z.enum(["SUPERVISOR", "HOD", "BRANCH_MANAGER", "CLUSTER_MANAGER", "HR", "COMMITTEE"]),
});

/**
 * POST /api/admin/departments/assign-role
 * Assigns a user as evaluator for a specific department.
 * Replace behaviour: removes ALL existing holders for that role in that dept before assigning the new one.
 */
export const POST = withRole(["ADMIN"], async (request, { user }) => {
    try {
        const { data, error } = await validateBody(request, assignRoleSchema);
        if (error) return error;

        const targetUser = await prisma.user.findUnique({
            where: { id: data.userId },
            select: { id: true, name: true, role: true },
        });
        if (!targetUser) return fail("User not found");

        const dept = await prisma.department.findUnique({
            where: { id: data.departmentId },
            select: { id: true, name: true },
        });
        if (!dept) return fail("Department not found");

        // Collect names of whoever is being replaced (for audit)
        const displaced = await prisma.departmentRoleMapping.findMany({
            where: { departmentId: data.departmentId, role: data.role },
            include: { user: { select: { name: true } } },
        });
        const displacedNames = displaced.map(d => d.user.name).filter(n => n !== targetUser.name);

        await prisma.$transaction(async (tx) => {
            // Remove ALL current holders of this role in this dept (replace behaviour)
            if (displaced.length > 0) {
                await tx.departmentRoleMapping.deleteMany({
                    where: { departmentId: data.departmentId, role: data.role },
                });
                // Clear department FK shortcuts
                if (data.role === "SUPERVISOR") {
                    await tx.department.update({ where: { id: data.departmentId }, data: { supervisorId: null } });
                } else if (data.role === "BRANCH_MANAGER") {
                    await tx.department.update({ where: { id: data.departmentId }, data: { branchManagerId: null } });
                }
            }

            // Create the new assignment
            await tx.departmentRoleMapping.create({
                data: { userId: data.userId, departmentId: data.departmentId, role: data.role },
            });

            // Update Department FK shortcuts
            if (data.role === "SUPERVISOR") {
                await tx.department.update({ where: { id: data.departmentId }, data: { supervisorId: data.userId } });
            } else if (data.role === "BRANCH_MANAGER") {
                await tx.department.update({ where: { id: data.departmentId }, data: { branchManagerId: data.userId } });
            }

            // Sync user's departmentId
            await tx.user.update({ where: { id: data.userId }, data: { departmentId: data.departmentId } });
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
                    replaced: displacedNames,
                    message: `${targetUser.name} assigned as ${data.role} for ${dept.name}${displacedNames.length ? ` (replaced: ${displacedNames.join(", ")})` : ""}`,
                },
            },
        });

        return created({
            message: `${targetUser.name} assigned as ${data.role} for ${dept.name}${displacedNames.length ? ` (replaced ${displacedNames.join(", ")})` : ""}`,
            assignment: { userId: data.userId, departmentId: data.departmentId, role: data.role },
        });
    } catch (err) {
        console.error("Assign role error:", err);
        return serverError();
    }
});
