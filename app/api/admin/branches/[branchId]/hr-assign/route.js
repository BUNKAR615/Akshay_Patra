export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import bcrypt from "bcryptjs";
import prisma from "../../../../../../lib/prisma";
import { withRole } from "../../../../../../lib/withRole";
import { ok, fail, created, serverError, notFound } from "../../../../../../lib/api-response";
import { requireBranchScope } from "../../../../../../lib/auth/requireBranchScope";
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
        const { branchId, error } = requireBranchScope(user, params);
        if (error) return error;

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
        console.error("[HR-ASSIGN GET] Error:", err.message);
        return serverError();
    }
});

export const POST = withRole(["ADMIN"], async (request, { params, user }) => {
    try {
        const { branchId, error } = requireBranchScope(user, params);
        if (error) return error;

        const branch = await prisma.branch.findUnique({ where: { id: branchId } });
        if (!branch) return notFound("Branch not found");

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
                const plain = data.password || data.empCode;
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

        if (hrUser.role !== "HR") {
            await prisma.user.update({ where: { id: hrUser.id }, data: { role: "HR" } });
        }

        // Upsert assignment
        const assignment = await prisma.hrBranchAssignment.upsert({
            where: { hrUserId_branchId: { hrUserId: hrUser.id, branchId } },
            update: { assignedBy: user.userId, assignedAt: new Date() },
            create: { hrUserId: hrUser.id, branchId, assignedBy: user.userId },
            include: {
                hr: { select: { id: true, empCode: true, name: true, mobile: true, role: true } },
            },
        });

        await prisma.auditLog.create({
            data: {
                userId: user.userId,
                action: "HR_ASSIGNED_TO_BRANCH",
                details: { branchId, hrUserId: hrUser.id, empCode: hrUser.empCode },
            },
        }).catch(() => {});

        return created({ assignment });
    } catch (err) {
        console.error("[HR-ASSIGN POST] Error:", err.message);
        return serverError();
    }
});

export const DELETE = withRole(["ADMIN"], async (request, { params, user }) => {
    try {
        const { branchId, error } = requireBranchScope(user, params);
        if (error) return error;

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
        console.error("[HR-ASSIGN DELETE] Error:", err.message);
        return serverError();
    }
});
