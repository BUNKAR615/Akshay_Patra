export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import bcrypt from "bcryptjs";
import prisma from "../../../../../../lib/prisma";
import { withRole } from "../../../../../../lib/withRole";
import { ok, fail, created, conflict, serverError, notFound } from "../../../../../../lib/api-response";
import { requireBranchScope } from "../../../../../../lib/auth/requireBranchScope";
import { resolveBranch } from "../../../../../../lib/resolveBranch";
import { defaultPasswordFor } from "../../../../../../lib/auth/defaultPassword";
import { z } from "zod";

const SALT_ROUNDS = 10;

const assignSchema = z.object({
    // Either assign an existing user by id/empCode...
    cmUserId: z.string().optional(),
    empCode: z.string().optional(),
    // ...or create one on the fly
    name: z.string().min(1).optional(),
    mobile: z.string().optional(),
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
export const GET = withRole(["ADMIN"], async (request, { params, user }) => {
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
        console.error("[CM-ASSIGN GET] Error:", err.message);
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

        // Resolve or create CM user
        let cmUser = null;
        if (data.cmUserId) {
            cmUser = await prisma.user.findUnique({ where: { id: data.cmUserId } });
            if (!cmUser) return notFound("Cluster Manager user not found");
        } else if (data.empCode) {
            cmUser = await prisma.user.findUnique({ where: { empCode: data.empCode } });
            if (!cmUser) {
                if (!data.name) return fail("Name required to create a new Cluster Manager user");
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
                    },
                });
            }
        } else {
            return fail("Either cmUserId or empCode is required");
        }

        if (cmUser.role !== "CLUSTER_MANAGER") {
            await prisma.user.update({ where: { id: cmUser.id }, data: { role: "CLUSTER_MANAGER" } });
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

        // Upsert assignment (one row per (cmUserId, branchId); the new
        // @@unique([branchId]) also guarantees one CM per branch globally)
        let assignment;
        try {
            assignment = await prisma.clusterManagerBranchAssignment.upsert({
                where: { cmUserId_branchId: { cmUserId: cmUser.id, branchId } },
                update: { assignedBy: user.userId, assignedAt: new Date() },
                create: { cmUserId: cmUser.id, branchId, assignedBy: user.userId },
                include: {
                    cm: { select: { id: true, empCode: true, name: true, mobile: true, role: true } },
                },
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
        console.error("[CM-ASSIGN POST] Error:", err.message);
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

        const { searchParams } = new URL(request.url);
        const cmUserId = searchParams.get("cmUserId");
        if (!cmUserId) return fail("cmUserId query parameter is required");

        await prisma.clusterManagerBranchAssignment.delete({
            where: { cmUserId_branchId: { cmUserId, branchId } },
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
        console.error("[CM-ASSIGN DELETE] Error:", err.message);
        return serverError();
    }
});
