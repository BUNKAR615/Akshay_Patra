export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import bcrypt from "bcryptjs";
import prisma from "../../../../../../lib/prisma";
import { withPermission } from "../../../../../../lib/withPermission";
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
    // Department for a manually-added committee member who isn't yet an
    // employee. When given (and it resolves to a department in this branch) the
    // new user is created WITH that employee identity, so they show up in the
    // branch employee list and get the dual-login (employee + committee) below.
    departmentName: z.string().optional(),
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
export const GET = withPermission("branches.org", async (request, { params, user }) => {
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

export const POST = withPermission("branches.org", async (request, { params, user }) => {
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
                // Optional department for a manual add — resolved within this
                // branch. When present the new member is created as a branch
                // employee too (departmentId/branchId/collarType set), which
                // makes the preserve-identity branch below apply automatically.
                let newDept = null;
                if (data.departmentName) {
                    newDept = await prisma.department.findFirst({ where: { name: data.departmentName, branchId } });
                    if (!newDept) return fail(`Department "${data.departmentName}" not found in ${branch.name}`);
                }
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
                        ...(newDept ? { departmentId: newDept.id, branchId } : {}),
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

        // Profile write for a pure-committee conversion (a non-evaluator being
        // made a committee member). Two cases, mirroring the HR/CM routes:
        //
        //  (1) EXISTING EMPLOYEE (has a department) → preserve branch identity so
        //      they STAY in their original branch's employee list with their
        //      committee role visible, and set up DUAL-LOGIN:
        //        - password    = empCode       → EMPLOYEE dashboard (main branch)
        //        - passwordHod = Firstname_##  → committee dashboard
        //  (2) PURE STAFF (no department) → original detach: staff formula is the
        //      primary password and the employee anchors are nulled.
        //
        // A dual-role evaluator (keepEvaluatorRole) skips this entirely — their
        // evaluator role, password and anchors are preserved and committee is
        // purely additive.
        let committeeProfileWrite = null;
        if (!keepEvaluatorRole) {
            if (member.departmentId) {
                const staffPlain = data.password || defaultPasswordFor({ role: "COMMITTEE", empCode: member.empCode, name: member.name });
                committeeProfileWrite = {
                    role: "COMMITTEE",
                    password: await bcrypt.hash(String(member.empCode), SALT_ROUNDS),
                    passwordHod: await bcrypt.hash(staffPlain, SALT_ROUNDS),
                    // Employee identity + main branch preserved on purpose.
                };
            } else {
                committeeProfileWrite = {
                    role: "COMMITTEE",
                    password: await hashStaffDefaultPassword({
                        role: "COMMITTEE",
                        empCode: member.empCode,
                        name: member.name,
                        override: data.password,
                    }),
                    departmentId: null,
                    branchId: null,
                    passwordHod: null,
                    collarType: null,
                };
            }
        }

        // Committee is global: assign the member to EVERY branch in one go.
        const allBranches = await prisma.branch.findMany({ select: { id: true } });

        const assignment = await prisma.$transaction(async (tx) => {
            // Pure-committee conversion only — apply the profile write computed
            // above (preserve identity + dual-login for an existing employee, or
            // detach for pure staff). A bulk re-upload still can't demote them:
            // the demotion guard keys off role + assignment rows, not departmentId.
            // A dual-role evaluator skips this block entirely: their evaluator
            // assignment, role and anchors are preserved and committee is additive.
            if (!keepEvaluatorRole && committeeProfileWrite) {
                await tx.user.update({
                    where: { id: member.id },
                    data: committeeProfileWrite,
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

export const DELETE = withPermission("branches.org", async (request, { params, user }) => {
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
