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
import { assertCommitteeCapacity, assertCommitteeEligible } from "../../../../../../lib/auth/roleAssignmentRules";
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

        // Eligibility — only role-holders may join the committee. A normal
        // employee (role EMPLOYEE with no evaluator/department role) is rejected.
        // Freshly created members above are role COMMITTEE, so they pass.
        const eligibility = await assertCommitteeEligible(member.id);
        if (!eligibility.ok) {
            await prisma.auditLog.create({
                data: {
                    userId: user.userId,
                    action: "ASSIGNMENT_REJECTED",
                    details: { type: "COMMITTEE", reason: "NOT_ELIGIBLE", message: eligibility.message, branchId, targetUserId: member.id, empCode: member.empCode },
                },
            }).catch(() => {});
            return conflict(eligibility.message);
        }

        // NOTE: the single-active-role gate (Rule A) is intentionally NOT applied
        // for committee. A role-holder (Branch Manager, Cluster Manager, HR, HOD,
        // Admin, …) may be elected to the committee. An evaluator (BM/CM/HR)
        // KEEPS their existing role and becomes dual-role — they choose which hat
        // to wear at login. Any other role-holder is converted to a pure
        // committee member. See the `keepEvaluatorRole` branch below.

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

        // Does this person already hold an evaluator assignment (BM/CM/HR)? If
        // so, electing them to the committee makes them DUAL-ROLE: we keep their
        // existing evaluator role, assignment, password and anchors intact and
        // simply ADD committee membership — they pick which role to act as at
        // login. Only a non-evaluator (a plain employee, HOD, supervisor or
        // admin) is converted into a pure committee member.
        const [existingBm, existingCm, existingHr] = await Promise.all([
            prisma.branchManagerAssignment.findUnique({ where: { bmUserId: member.id }, select: { id: true } }),
            prisma.clusterManagerBranchAssignment.findFirst({ where: { cmUserId: member.id }, select: { id: true } }),
            prisma.hrBranchAssignment.findFirst({ where: { hrUserId: member.id }, select: { id: true } }),
        ]);
        const keepEvaluatorRole = !!(existingBm || existingCm || existingHr);

        // Pure-committee conversion resets the password to the staff formula
        // ("Firstname_##"); admins can override via data.password. A dual-role
        // evaluator keeps their working password untouched — the formula is
        // identical for both roles, so their credentials already open committee.
        const passwordHash = keepEvaluatorRole
            ? null
            : await hashStaffDefaultPassword({
                role: "COMMITTEE",
                empCode: member.empCode,
                name: member.name,
                override: data.password,
            });

        // Committee is global: assign the member to EVERY branch in one go.
        const allBranches = await prisma.branch.findMany({ select: { id: true } });

        const assignment = await prisma.$transaction(async (tx) => {
            // Pure-committee conversion only — flip role to COMMITTEE, reset the
            // password and null the employee/HOD anchors so the member no longer
            // appears in their old branch's roster and a bulk-upload can't
            // silently demote them. User.branchId is never written for COMMITTEE
            // (CommitteeBranchAssignment is the source of truth). A dual-role
            // evaluator skips this block entirely: their evaluator assignment,
            // role and anchors are preserved and committee is purely additive.
            if (!keepEvaluatorRole) {
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
            }
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

        // Best-effort, post-commit: clear legacy BM department-cache pointers for
        // a former Branch Manager we just converted to a pure committee member.
        // Skipped for dual-role evaluators — a BM who keeps their role must keep
        // their department-cache pointers. Mirrors the BM-assign route's split so
        // a failure here can never roll back the committee assignment. Never throws.
        if (!keepEvaluatorRole) {
            try {
                await prisma.department.updateMany({
                    where: { branchManagerId: member.id },
                    data: { branchManagerId: null },
                });
                await prisma.departmentRoleMapping.deleteMany({
                    where: { userId: member.id, role: "BRANCH_MANAGER" },
                });
            } catch (legacyErr) {
                console.error("[COMMITTEE-ASSIGN] Legacy BM cache cleanup skipped (non-fatal):", legacyErr?.message || legacyErr);
            }
        }

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
