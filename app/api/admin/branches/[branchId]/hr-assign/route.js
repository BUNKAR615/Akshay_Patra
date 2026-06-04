export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import bcrypt from "bcryptjs";
import prisma from "../../../../../../lib/prisma";
import { withRole } from "../../../../../../lib/withRole";
import { ok, fail, created, conflict, notFound, handleApiError } from "../../../../../../lib/api-response";
import { requireBranchScope } from "../../../../../../lib/auth/requireBranchScope";
import { resolveBranch } from "../../../../../../lib/resolveBranch";
import { defaultPasswordFor } from "../../../../../../lib/auth/defaultPassword";
import { hashStaffDefaultPassword } from "../../../../../../lib/auth/applyStaffPassword";
import { assertSingleActiveRole, assertHrCapacity } from "../../../../../../lib/auth/roleAssignmentRules";
import { z } from "zod";

const SALT_ROUNDS = 10;

const assignSchema = z.object({
    // Either assign an existing user by id/empCode...
    hrUserId: z.string().optional(),
    empCode: z.string().optional(),
    // ...or create one on the fly
    name: z.string().min(1).optional(),
    mobile: z.string().optional(),
    password: z.string().min(6).optional(),
});

/**
 * GET  /api/admin/branches/[branchId]/hr-assign
 *   Lists current HR assignments for the branch.
 *
 * POST /api/admin/branches/[branchId]/hr-assign
 *   Assigns an HR user to the branch. Creates the user if empCode is new.
 *
 * DELETE /api/admin/branches/[branchId]/hr-assign?hrUserId=...
 *   Removes an HR assignment.
 */
export const GET = withRole(["ADMIN"], async (request, { params, user }) => {
    try {
        const { branchId: slugOrId, error } = requireBranchScope(user, params);
        if (error) return error;

        const resolved = await resolveBranch(slugOrId);
        if (!resolved) return notFound("Branch not found");
        const branchId = resolved.id;

        const assignments = await prisma.hrBranchAssignment.findMany({
            where: { branchId },
            include: {
                hr: {
                    select: { id: true, empCode: true, name: true, mobile: true, role: true },
                },
            },
            orderBy: { assignedAt: "desc" },
        });

        return ok({ assignments });
    } catch (err) {
        return handleApiError(err, "HR-ASSIGN GET");
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

        // Resolve or create HR user
        let hrUser = null;
        if (data.hrUserId) {
            hrUser = await prisma.user.findUnique({ where: { id: data.hrUserId } });
            if (!hrUser) return notFound("HR user not found");
        } else if (data.empCode) {
            hrUser = await prisma.user.findUnique({ where: { empCode: data.empCode } });
            if (!hrUser) {
                if (!data.name) return fail("Name required to create a new HR user");
                // HR default password = `${Firstname}_${last 2 digits of empCode}`
                const plain = data.password || defaultPasswordFor({ role: "HR", empCode: data.empCode, name: data.name });
                const hash = await bcrypt.hash(plain, SALT_ROUNDS);
                hrUser = await prisma.user.create({
                    data: {
                        empCode: data.empCode,
                        name: data.name,
                        mobile: data.mobile || null,
                        password: hash,
                        role: "HR",
                    },
                });
            }
        } else {
            return fail("Either hrUserId or empCode is required");
        }

        // Rule A — a person may actively hold only ONE of BM/CM/HR/Committee.
        const roleCheck = await assertSingleActiveRole(hrUser.id, "HR");
        if (!roleCheck.ok) {
            await prisma.auditLog.create({
                data: {
                    userId: user.userId,
                    action: "ASSIGNMENT_REJECTED",
                    details: { type: "HR", reason: "ROLE_CONFLICT", message: roleCheck.message, branchId, targetUserId: hrUser.id, empCode: hrUser.empCode },
                },
            }).catch(() => {});
            return conflict(roleCheck.message);
        }

        // Rule D — at most 3 HR personnel per branch.
        const capacity = await assertHrCapacity(branchId, hrUser.id);
        if (!capacity.ok) {
            await prisma.auditLog.create({
                data: {
                    userId: user.userId,
                    action: "ASSIGNMENT_REJECTED",
                    details: { type: "HR", reason: "BRANCH_HR_FULL", message: capacity.message, branchId, targetUserId: hrUser.id, empCode: hrUser.empCode },
                },
            }).catch(() => {});
            return conflict(capacity.message);
        }

        // Build the user-profile write for this HR assignment. The branch a
        // person belongs to as an EMPLOYEE (their "main branch") is owned by
        // their department; assigning them as HR in another branch must never
        // overwrite it. Two cases, decided by whether they already have an
        // employee identity (a departmentId):
        //
        //  (1) EXISTING EMPLOYEE → preserve their main branch. We keep
        //      departmentId / branchId / collarType untouched and configure the
        //      DUAL-LOGIN the auth route already understands (login/route.js →
        //      isDualLoginStaff):
        //        - password    = empCode       → their EMPLOYEE dashboard (main branch)
        //        - passwordHod = Firstname_##  → their HR dashboard (this branch)
        //      Their evaluation stays owned by their main branch (shortlists are
        //      keyed off department.branchId); the HR branch only ever sees them
        //      through HrBranchAssignment, never as one of its employees.
        //
        //  (2) PURE STAFF (no department) → original detach-on-promote: the
        //      staff formula is the primary password and the employee fields
        //      stay null. User.branchId is intentionally NOT written for HR —
        //      HrBranchAssignment is the single source of truth.
        let userProfileWrite;
        if (hrUser.departmentId) {
            const staffPlain = data.password || defaultPasswordFor({ role: "HR", empCode: hrUser.empCode, name: hrUser.name });
            userProfileWrite = {
                role: "HR",
                // Employee identity + main branch preserved on purpose —
                // departmentId / branchId / collarType are left untouched.
                password: await bcrypt.hash(String(hrUser.empCode), SALT_ROUNDS),
                passwordHod: await bcrypt.hash(staffPlain, SALT_ROUNDS),
            };
        } else {
            userProfileWrite = {
                role: "HR",
                password: await hashStaffDefaultPassword({ role: "HR", empCode: hrUser.empCode, name: hrUser.name, override: data.password }),
                departmentId: null,
                branchId: null,
                passwordHod: null,
                collarType: null,
            };
        }

        // Profile write + assignment upsert in one transaction.
        const assignment = await prisma.$transaction(async (tx) => {
            await tx.user.update({
                where: { id: hrUser.id },
                data: userProfileWrite,
            });
            return tx.hrBranchAssignment.upsert({
                where: { hrUserId_branchId: { hrUserId: hrUser.id, branchId } },
                update: { assignedBy: user.userId, assignedAt: new Date() },
                create: { hrUserId: hrUser.id, branchId, assignedBy: user.userId },
                include: {
                    hr: { select: { id: true, empCode: true, name: true, mobile: true, role: true } },
                },
            });
        });

        await prisma.auditLog.create({
            data: {
                userId: user.userId,
                action: "HR_ASSIGNED_TO_BRANCH",
                details: { branchId, hrUserId: hrUser.id, empCode: hrUser.empCode, preservedEmployeeIdentity: !!hrUser.departmentId },
            },
        }).catch(() => {});

        return created({ assignment });
    } catch (err) {
        return handleApiError(err, "HR-ASSIGN POST");
    }
});

export const DELETE = withRole(["ADMIN"], async (request, { params, user }) => {
    try {
        const { branchId: slugOrId, error } = requireBranchScope(user, params);
        if (error) return error;

        const resolved = await resolveBranch(slugOrId);
        if (!resolved) return notFound("Branch not found");
        const branchId = resolved.id;

        const { searchParams } = new URL(request.url);
        const hrUserId = searchParams.get("hrUserId");
        if (!hrUserId) return fail("hrUserId query parameter is required");

        await prisma.hrBranchAssignment.delete({
            where: { hrUserId_branchId: { hrUserId, branchId } },
        });

        await prisma.auditLog.create({
            data: {
                userId: user.userId,
                action: "HR_UNASSIGNED_FROM_BRANCH",
                details: { branchId, hrUserId },
            },
        }).catch(() => {});

        return ok({ removed: true });
    } catch (err) {
        return handleApiError(err, "HR-ASSIGN DELETE");
    }
});
