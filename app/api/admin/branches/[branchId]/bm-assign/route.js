export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import bcrypt from "bcryptjs";
import prisma from "../../../../../../lib/prisma";
import { withRole } from "../../../../../../lib/withRole";
import { ok, fail, created, conflict, serverError, notFound } from "../../../../../../lib/api-response";
import { requireBranchScope } from "../../../../../../lib/auth/requireBranchScope";
import { resolveBranch } from "../../../../../../lib/resolveBranch";
import {
    assertBmAssignable,
    applyBmAssignment,
    clearBmAssignment,
    BM_ERR_BRANCH_TAKEN,
    BM_ERR_USER_TAKEN,
} from "../../../../../../lib/auth/bmAssignment";
import { defaultPasswordFor } from "../../../../../../lib/auth/defaultPassword";
import { z } from "zod";

const SALT_ROUNDS = 10;

const assignSchema = z.object({
    bmUserId: z.string().optional(),
    empCode: z.string().optional(),
    name: z.string().min(1).optional(),
    mobile: z.string().optional(),
    password: z.string().min(6).optional(),
});

/**
 * GET    /api/admin/branches/[branchId]/bm-assign
 *   Returns the single current Branch Manager for the branch (or null).
 *
 * POST   /api/admin/branches/[branchId]/bm-assign
 *   Assigns a Branch Manager. Rejects with 409 + spec message if either:
 *     - the branch already has a different BM, or
 *     - the user is already BM of another branch.
 *   May create the user on the fly if a fresh empCode is supplied with name.
 *
 * DELETE /api/admin/branches/[branchId]/bm-assign
 *   Removes the current BM from the branch, demotes them to EMPLOYEE, and
 *   clears legacy department.branchManagerId / DepartmentRoleMapping pointers.
 */
export const GET = withRole(["ADMIN"], async (request, { params, user }) => {
    try {
        const { branchId: slugOrId, error } = requireBranchScope(user, params);
        if (error) return error;

        const resolved = await resolveBranch(slugOrId);
        if (!resolved) return notFound("Branch not found");

        const assignment = await prisma.branchManagerAssignment.findUnique({
            where: { branchId: resolved.id },
            include: {
                bm: { select: { id: true, empCode: true, name: true, mobile: true, role: true } },
            },
        });

        return ok({ assignment: assignment || null });
    } catch (err) {
        console.error("[BM-ASSIGN GET] Error:", err.message);
        return serverError();
    }
});

export const POST = withRole(["ADMIN"], async (request, { params, user }) => {
    try {
        const { branchId: slugOrId, error } = requireBranchScope(user, params);
        if (error) return error;

        const branch = await resolveBranch(slugOrId);
        if (!branch) return notFound("Branch not found");
        const branchId = branch.id;

        const body = await request.json();
        const parsed = assignSchema.safeParse(body);
        if (!parsed.success) return fail(parsed.error.errors[0].message);
        const data = parsed.data;

        // Resolve or create the target user
        let bmUser = null;
        if (data.bmUserId) {
            bmUser = await prisma.user.findUnique({ where: { id: data.bmUserId } });
            if (!bmUser) return notFound("Branch Manager user not found");
        } else if (data.empCode) {
            bmUser = await prisma.user.findUnique({ where: { empCode: data.empCode } });
            if (!bmUser) {
                if (!data.name) return fail("Name required to create a new Branch Manager user");
                // BM default password = `${Firstname}_${last 2 digits of empCode}`
                const plain = data.password || defaultPasswordFor({ role: "BRANCH_MANAGER", empCode: data.empCode, name: data.name });
                const hash = await bcrypt.hash(plain, SALT_ROUNDS);
                bmUser = await prisma.user.create({
                    data: {
                        empCode: data.empCode,
                        name: data.name,
                        mobile: data.mobile || null,
                        password: hash,
                        role: "BRANCH_MANAGER",
                        branchId,
                    },
                });
            }
        } else {
            return fail("Either bmUserId or empCode is required");
        }

        // Spec-mandated uniqueness validation BEFORE any write.
        const check = await assertBmAssignable(bmUser.id, branchId);
        if (!check.ok) {
            // Audit the rejection so admins can see attempted violations
            await prisma.auditLog.create({
                data: {
                    userId: user.userId,
                    action: "ASSIGNMENT_REJECTED",
                    details: {
                        type: "BRANCH_MANAGER",
                        reason: check.code,
                        message: check.message,
                        branchId,
                        targetUserId: bmUser.id,
                        empCode: bmUser.empCode,
                    },
                },
            }).catch((err) => { console.error("[BM-ASSIGN] Audit log failed:", err); });

            return conflict(check.message);
        }

        // Atomic: assignment row + user.role/branchId + legacy department cache.
        let assignment;
        try {
            assignment = await prisma.$transaction(async (tx) => {
                return applyBmAssignment(tx, {
                    userId: bmUser.id,
                    branchId,
                    assignedBy: user.userId,
                });
            });
        } catch (err) {
            // Belt-and-braces: if a concurrent admin won the race, the unique
            // index will fire (P2002). Translate to the spec error message.
            if (err && err.code === "P2002") {
                const target = err.meta?.target;
                if (Array.isArray(target) && target.includes("bm_user_id")) {
                    return conflict(BM_ERR_USER_TAKEN);
                }
                return conflict(BM_ERR_BRANCH_TAKEN);
            }
            throw err;
        }

        await prisma.auditLog.create({
            data: {
                userId: user.userId,
                action: "BM_ASSIGNED_TO_BRANCH",
                details: { branchId, bmUserId: bmUser.id, empCode: bmUser.empCode },
            },
        }).catch((err) => { console.error("[BM-ASSIGN] Audit log failed:", err); });

        return created({ assignment });
    } catch (err) {
        console.error("[BM-ASSIGN POST] Error:", err.message, err.stack);
        return serverError();
    }
});

export const DELETE = withRole(["ADMIN"], async (request, { params, user }) => {
    try {
        const { branchId: slugOrId, error } = requireBranchScope(user, params);
        if (error) return error;

        const resolved = await resolveBranch(slugOrId);
        if (!resolved) return notFound("Branch not found");
        const branchId = resolved.id;

        const removed = await prisma.$transaction(async (tx) => {
            return clearBmAssignment(tx, { branchId });
        });

        if (!removed) return ok({ removed: false, message: "No Branch Manager was assigned to this branch." });

        await prisma.auditLog.create({
            data: {
                userId: user.userId,
                action: "BM_UNASSIGNED_FROM_BRANCH",
                details: { branchId },
            },
        }).catch((err) => { console.error("[BM-ASSIGN] Audit log failed:", err); });

        return ok({ removed: true });
    } catch (err) {
        console.error("[BM-ASSIGN DELETE] Error:", err.message);
        return serverError();
    }
});
