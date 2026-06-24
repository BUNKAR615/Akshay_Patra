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
import { assertSingleActiveRole } from "../../../../../../lib/auth/roleAssignmentRules";
import { z } from "zod";

const SALT_ROUNDS = 10;

const assignSchema = z.object({
    // Either assign an existing user by id/empCode...
    cmUserId: z.string().optional(),
    empCode: z.string().optional(),
    // ...or create one on the fly
    name: z.string().min(1).optional(),
    mobile: z.string().optional(),
    // Department for a manually-added CM who isn't yet an employee. When given
    // (and it resolves to a department in this branch) the new user is created
    // WITH that employee identity, so they show up in the branch employee list
    // and get the dual-login (employee + CM) treatment below.
    departmentName: z.string().optional(),
    password: z.string().min(6).optional(),
});

/**
 * GET  /api/admin/branches/[branchId]/cm-assign
 *   Lists current Cluster Manager assignments for the branch.
 *
 * POST /api/admin/branches/[branchId]/cm-assign
 *   Assigns a CM user to the branch. Creates the user if empCode is new.
 *   The same CM user can be assigned to multiple branches via separate calls.
 *
 * DELETE /api/admin/branches/[branchId]/cm-assign?cmUserId=...
 *   Removes a CM assignment.
 */
export const GET = withPermission("branches.org", async (request, { params, user }) => {
    try {
        const { branchId: slugOrId, error } = requireBranchScope(user, params);
        if (error) return error;

        const resolved = await resolveBranch(slugOrId);
        if (!resolved) return notFound("Branch not found");
        const branchId = resolved.id;

        const assignments = await prisma.clusterManagerBranchAssignment.findMany({
            where: { branchId },
            include: {
                cm: {
                    select: { id: true, empCode: true, name: true, mobile: true, role: true },
                },
            },
            orderBy: { assignedAt: "desc" },
        });

        return ok({ assignments });
    } catch (err) {
        return handleApiError(err, "CM-ASSIGN GET");
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

        // Resolve or create CM user
        let cmUser = null;
        if (data.cmUserId) {
            cmUser = await prisma.user.findUnique({ where: { id: data.cmUserId } });
            if (!cmUser) return notFound("Cluster Manager user not found");
        } else if (data.empCode) {
            cmUser = await prisma.user.findUnique({ where: { empCode: data.empCode } });
            if (!cmUser) {
                if (!data.name) return fail("Name required to create a new Cluster Manager user");
                // Optional department for a manual add — resolved within this
                // branch. When present the new CM is created as a branch employee
                // too (departmentId/branchId/collarType set), which makes the
                // preserve-identity branch below apply automatically.
                let newDept = null;
                if (data.departmentName) {
                    newDept = await prisma.department.findFirst({ where: { name: data.departmentName, branchId } });
                    if (!newDept) return fail(`Department "${data.departmentName}" not found in ${branch.name}`);
                }
                // CM default password = `${Firstname}_${last 2 digits of empCode}`
                const plain = data.password || defaultPasswordFor({ role: "CLUSTER_MANAGER", empCode: data.empCode, name: data.name });
                const hash = await bcrypt.hash(plain, SALT_ROUNDS);
                cmUser = await prisma.user.create({
                    data: {
                        empCode: data.empCode,
                        name: data.name,
                        mobile: data.mobile || null,
                        password: hash,
                        role: "CLUSTER_MANAGER",
                        ...(newDept ? { departmentId: newDept.id, branchId } : {}),
                    },
                });
            }
        } else {
            return fail("Either cmUserId or empCode is required");
        }

        // Rule A — a person may actively hold only ONE of BM/CM/HR/Committee.
        const roleCheck = await assertSingleActiveRole(cmUser.id, "CLUSTER_MANAGER");
        if (!roleCheck.ok) {
            await prisma.auditLog.create({
                data: {
                    userId: user.userId,
                    action: "ASSIGNMENT_REJECTED",
                    details: {
                        type: "CLUSTER_MANAGER",
                        reason: "ROLE_CONFLICT",
                        message: roleCheck.message,
                        branchId,
                        targetUserId: cmUser.id,
                        empCode: cmUser.empCode,
                    },
                },
            }).catch((err) => { console.error("[CM-ASSIGN] Audit log failed:", err); });
            return conflict(roleCheck.message);
        }

        // Build the user-profile write. An existing EMPLOYEE keeps their branch
        // identity (department / branch / collar) so they stay in their original
        // branch's employee list with their CM role visible; a pure-staff CM
        // (no department) keeps the original detach-on-promote behavior. Mirrors
        // the HR-assign route's two cases.
        //
        //  (1) EXISTING EMPLOYEE → DUAL-LOGIN (login/route.js → isDualLoginStaff):
        //        - password    = empCode       → EMPLOYEE dashboard (main branch)
        //        - passwordHod = Firstname_##  → CM dashboard
        //      departmentId / branchId / collarType are left UNTOUCHED.
        //  (2) PURE STAFF (no department) → detach: staff formula is the primary
        //      password and the employee anchors stay null. User.branchId is not
        //      written — ClusterManagerBranchAssignment is the source of truth.
        let userProfileWrite;
        if (cmUser.departmentId) {
            const staffPlain = data.password || defaultPasswordFor({ role: "CLUSTER_MANAGER", empCode: cmUser.empCode, name: cmUser.name });
            userProfileWrite = {
                role: "CLUSTER_MANAGER",
                password: await bcrypt.hash(String(cmUser.empCode), SALT_ROUNDS),
                passwordHod: await bcrypt.hash(staffPlain, SALT_ROUNDS),
                // Employee identity + main branch preserved on purpose.
            };
        } else {
            userProfileWrite = {
                role: "CLUSTER_MANAGER",
                password: await hashStaffDefaultPassword({
                    role: "CLUSTER_MANAGER",
                    empCode: cmUser.empCode,
                    name: cmUser.name,
                    override: data.password,
                }),
                departmentId: null,
                branchId: null,
                passwordHod: null,
                collarType: null,
            };
        }

        // Spec rule 2: a branch can have only ONE Cluster Manager.
        // Re-saving the SAME CM on the same branch is still a no-op upsert below.
        const existing = await prisma.clusterManagerBranchAssignment.findFirst({
            where: { branchId },
        });
        if (existing && existing.cmUserId !== cmUser.id) {
            await prisma.auditLog.create({
                data: {
                    userId: user.userId,
                    action: "ASSIGNMENT_REJECTED",
                    details: {
                        type: "CLUSTER_MANAGER",
                        reason: "BRANCH_TAKEN",
                        message: "This branch already has a Cluster Manager assigned.",
                        branchId,
                        targetUserId: cmUser.id,
                        empCode: cmUser.empCode,
                    },
                },
            }).catch((err) => { console.error("[CM-ASSIGN] Audit log failed:", err); });
            return conflict("This branch already has a Cluster Manager assigned.");
        }

        // Profile write + assignment upsert in one transaction so a failure
        // can't leave a half-promoted user behind. The profile write preserves
        // (existing employee) or detaches (pure staff) per userProfileWrite above.
        // A bulk re-upload still can't demote a CM: the demotion guard keys off
        // role + assignment rows, not the (now-preserved) departmentId.
        let assignment;
        try {
            assignment = await prisma.$transaction(async (tx) => {
                await tx.user.update({
                    where: { id: cmUser.id },
                    data: userProfileWrite,
                });
                return tx.clusterManagerBranchAssignment.upsert({
                    where: { cmUserId_branchId: { cmUserId: cmUser.id, branchId } },
                    update: { assignedBy: user.userId, assignedAt: new Date() },
                    create: { cmUserId: cmUser.id, branchId, assignedBy: user.userId },
                    include: {
                        cm: { select: { id: true, empCode: true, name: true, mobile: true, role: true } },
                    },
                });
            });
        } catch (err) {
            // Concurrency safeguard: the unique index on branchId fires if a
            // parallel admin assigned a different CM in between our check and
            // this upsert.
            if (err && err.code === "P2002") {
                return conflict("This branch already has a Cluster Manager assigned.");
            }
            throw err;
        }

        await prisma.auditLog.create({
            data: {
                userId: user.userId,
                action: "CM_ASSIGNED_TO_BRANCH",
                details: { branchId, cmUserId: cmUser.id, empCode: cmUser.empCode },
            },
        }).catch((err) => { console.error("[CM-ASSIGN] Audit log failed:", err); });

        return created({ assignment });
    } catch (err) {
        return handleApiError(err, "CM-ASSIGN POST");
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
        const cmUserId = searchParams.get("cmUserId");
        if (!cmUserId) return fail("cmUserId query parameter is required");

        await prisma.$transaction(async (tx) => {
            await tx.clusterManagerBranchAssignment.delete({
                where: { cmUserId_branchId: { cmUserId, branchId } },
            });
            // Reset the user's role unless they still serve another branch as
            // CM — otherwise a removed CM lingers as a stale CLUSTER_MANAGER.
            const remaining = await tx.clusterManagerBranchAssignment.count({
                where: { cmUserId },
            });
            if (remaining === 0) {
                // A dual-role member (CM + Committee) who loses their CM role
                // falls back to COMMITTEE — not EMPLOYEE — so their committee
                // login keeps working.
                const stillCommittee = await tx.committeeBranchAssignment.findFirst({
                    where: { memberUserId: cmUserId }, select: { id: true },
                });
                await tx.user.updateMany({
                    where: { id: cmUserId, role: "CLUSTER_MANAGER" },
                    data: { role: stillCommittee ? "COMMITTEE" : "EMPLOYEE" },
                });
            }
        });

        await prisma.auditLog.create({
            data: {
                userId: user.userId,
                action: "CM_UNASSIGNED_FROM_BRANCH",
                details: { branchId, cmUserId },
            },
        }).catch((err) => { console.error("[CM-ASSIGN] Audit log failed:", err); });

        return ok({ removed: true });
    } catch (err) {
        return handleApiError(err, "CM-ASSIGN DELETE");
    }
});
