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
import { assertSingleActiveRole, assertCommitteeCapacity } from "../../../../../../lib/auth/roleAssignmentRules";
import { z } from "zod";

const SALT_ROUNDS = 10;

const assignSchema = z.object({
    memberUserId: z.string().optional(),
    empCode: z.string().optional(),
    name: z.string().min(1).optional(),
    mobile: z.string().optional(),
    password: z.string().min(6).optional(),
});

/**
 * Committee is GLOBAL — the same members apply to every branch. Assigning a
 * member here creates a CommitteeBranchAssignment row for ALL branches, and
 * removing one deletes their rows from ALL branches. The [branchId] in the URL
 * is only used for admin scoping; the result is identical for every branch.
 *
 * GET  /api/admin/branches/[branchId]/committee-assign — list committee members
 * POST /api/admin/branches/[branchId]/committee-assign — assign globally (create if new)
 * DELETE /api/admin/branches/[branchId]/committee-assign?memberUserId=... — remove globally
 */
export const GET = withRole(["ADMIN"], async (request, { params, user }) => {
    try {
        const { branchId: slugOrId, error } = requireBranchScope(user, params);
        if (error) return error;

        const resolved = await resolveBranch(slugOrId);
        if (!resolved) return notFound("Branch not found");
        const branchId = resolved.id;

        const assignments = await prisma.committeeBranchAssignment.findMany({
            where: { branchId },
            include: {
                member: {
                    select: { id: true, empCode: true, name: true, mobile: true, role: true },
                },
            },
            orderBy: { assignedAt: "desc" },
        });

        return ok({ assignments });
    } catch (err) {
        return handleApiError(err, "COMMITTEE-ASSIGN GET");
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

        let member = null;
        if (data.memberUserId) {
            member = await prisma.user.findUnique({ where: { id: data.memberUserId } });
            if (!member) return notFound("Committee member not found");
        } else if (data.empCode) {
            member = await prisma.user.findUnique({ where: { empCode: data.empCode } });
            if (!member) {
                if (!data.name) return fail("Name required to create a new committee member");
                // COMMITTEE default password = `${Firstname}_${last 2 digits of empCode}`
                const plain = data.password || defaultPasswordFor({ role: "COMMITTEE", empCode: data.empCode, name: data.name });
                const hash = await bcrypt.hash(plain, SALT_ROUNDS);
                member = await prisma.user.create({
                    data: {
                        empCode: data.empCode,
                        name: data.name,
                        mobile: data.mobile || null,
                        password: hash,
                        role: "COMMITTEE",
                    },
                });
            }
        } else {
            return fail("Either memberUserId or empCode is required");
        }

        // Rule A — a person may actively hold only ONE of BM/CM/HR/Committee.
        const roleCheck = await assertSingleActiveRole(member.id, "COMMITTEE");
        if (!roleCheck.ok) {
            await prisma.auditLog.create({
                data: {
                    userId: user.userId,
                    action: "ASSIGNMENT_REJECTED",
                    details: { type: "COMMITTEE", reason: "ROLE_CONFLICT", message: roleCheck.message, branchId, targetUserId: member.id, empCode: member.empCode },
                },
            }).catch(() => {});
            return conflict(roleCheck.message);
        }

        // Rule E — at most 3 committee members (counted globally).
        const capacity = await assertCommitteeCapacity(member.id);
        if (!capacity.ok) {
            await prisma.auditLog.create({
                data: {
                    userId: user.userId,
                    action: "ASSIGNMENT_REJECTED",
                    details: { type: "COMMITTEE", reason: "COMMITTEE_FULL", message: capacity.message, branchId, targetUserId: member.id, empCode: member.empCode },
                },
            }).catch(() => {});
            return conflict(capacity.message);
        }

        // Reset password to the staff formula ("Firstname_##") on every
        // assign call. Admins can override via data.password.
        const passwordHash = await hashStaffDefaultPassword({
            role: "COMMITTEE",
            empCode: member.empCode,
            name: member.name,
            override: data.password,
        });

        // Committee is global: assign the member to EVERY branch in one go.
        const allBranches = await prisma.branch.findMany({ select: { id: true } });

        // Detach-on-promote + assignment upsert in one transaction.
        //   - role flipped to COMMITTEE
        //   - password reset to staff formula ("Firstname_##")
        //   - departmentId / branchId / passwordHod / collarType nulled so
        //     the user no longer appears in their old branch's employee list
        //     and bulk-uploads of that branch can't silently demote them
        //   - User.branchId is intentionally NOT written for COMMITTEE —
        //     CommitteeBranchAssignment is the single source of truth.
        const assignment = await prisma.$transaction(async (tx) => {
            await tx.user.update({
                where: { id: member.id },
                data: {
                    role: "COMMITTEE",
                    password: passwordHash,
                    departmentId: null,
                    branchId: null,
                    passwordHod: null,
                    collarType: null,
                },
            });
            // Upsert one assignment row per branch — committee is global.
            for (const b of allBranches) {
                await tx.committeeBranchAssignment.upsert({
                    where: { memberUserId_branchId: { memberUserId: member.id, branchId: b.id } },
                    update: { assignedBy: user.userId, assignedAt: new Date() },
                    create: { memberUserId: member.id, branchId: b.id, assignedBy: user.userId },
                });
            }
            // Return the row for the URL branch so the response shape is
            // unchanged for existing callers.
            return tx.committeeBranchAssignment.findUnique({
                where: { memberUserId_branchId: { memberUserId: member.id, branchId } },
                include: {
                    member: { select: { id: true, empCode: true, name: true, mobile: true, role: true } },
                },
            });
        });

        await prisma.auditLog.create({
            data: {
                userId: user.userId,
                action: "COMMITTEE_ASSIGNED_TO_BRANCH",
                details: { branchId, memberUserId: member.id, empCode: member.empCode },
            },
        }).catch(() => {});

        return created({ assignment });
    } catch (err) {
        return handleApiError(err, "COMMITTEE-ASSIGN POST");
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
        const memberUserId = searchParams.get("memberUserId");
        if (!memberUserId) return fail("memberUserId query parameter is required");

        // Committee is global — remove the member from every branch.
        await prisma.committeeBranchAssignment.deleteMany({
            where: { memberUserId },
        });

        await prisma.auditLog.create({
            data: {
                userId: user.userId,
                action: "COMMITTEE_UNASSIGNED_FROM_BRANCH",
                details: { branchId, memberUserId },
            },
        }).catch(() => {});

        return ok({ removed: true });
    } catch (err) {
        return handleApiError(err, "COMMITTEE-ASSIGN DELETE");
    }
});
