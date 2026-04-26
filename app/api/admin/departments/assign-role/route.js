export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../../lib/prisma";
import { withRole } from "../../../../../lib/withRole";
import { created, fail, conflict, serverError, validateBody } from "../../../../../lib/api-response";
import { assertBmAssignable, applyBmAssignment } from "../../../../../lib/auth/bmAssignment";
import { z } from "zod";

const assignRoleSchema = z.object({
    userId: z.string().min(1),
    departmentId: z.string().min(1),
    role: z.enum(["HOD", "BRANCH_MANAGER", "CLUSTER_MANAGER", "HR", "COMMITTEE"]),
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
            select: { id: true, name: true, branchId: true },
        });
        if (!dept) return fail("Department not found");

        // Spec rule: enforce one-BM-per-branch and one-branch-per-BM at the
        // branch level (not just the department level). The unique indexes on
        // BranchManagerAssignment will also catch this server-side.
        if (data.role === "BRANCH_MANAGER") {
            const check = await assertBmAssignable(data.userId, dept.branchId);
            if (!check.ok) {
                await prisma.auditLog.create({
                    data: {
                        userId: user.userId,
                        action: "ASSIGNMENT_REJECTED",
                        details: {
                            type: "BRANCH_MANAGER",
                            reason: check.code,
                            message: check.message,
                            via: "departments/assign-role",
                            branchId: dept.branchId,
                            targetUserId: data.userId,
                        },
                    },
                }).catch((err) => { console.error("[ASSIGN-ROLE] Audit log failed:", err); });
                return conflict(check.message);
            }
        }

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
                if (data.role === "BRANCH_MANAGER") {
                    await tx.department.update({ where: { id: data.departmentId }, data: { branchManagerId: null } });
                }
            }

            // Create the new assignment
            await tx.departmentRoleMapping.create({
                data: { userId: data.userId, departmentId: data.departmentId, role: data.role },
            });

            // Update Department FK shortcuts
            if (data.role === "BRANCH_MANAGER") {
                await tx.department.update({ where: { id: data.departmentId }, data: { branchManagerId: data.userId } });
            }

            // Sync user's departmentId
            await tx.user.update({ where: { id: data.userId }, data: { departmentId: data.departmentId } });

            // Maintain the new BranchManagerAssignment source-of-truth
            if (data.role === "BRANCH_MANAGER") {
                await applyBmAssignment(tx, {
                    userId: data.userId,
                    branchId: dept.branchId,
                    assignedBy: user.userId,
                });
            }
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
        // Concurrency: a parallel admin call may have inserted a conflicting
        // BranchManagerAssignment row between assertBmAssignable and the
        // applyBmAssignment write. Translate the unique-index violation into
        // the spec error message.
        if (err && err.code === "P2002") {
            const target = err.meta?.target;
            if (Array.isArray(target) && target.includes("bm_user_id")) {
                return conflict("This user is already assigned as Branch Manager in another branch.");
            }
            return conflict("This branch already has a Branch Manager assigned.");
        }
        console.error("Assign role error:", err);
        return serverError();
    }
});
