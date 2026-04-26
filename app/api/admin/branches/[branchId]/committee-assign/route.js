export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import bcrypt from "bcryptjs";
import prisma from "../../../../../../lib/prisma";
import { withRole } from "../../../../../../lib/withRole";
import { ok, fail, created, serverError, notFound } from "../../../../../../lib/api-response";
import { requireBranchScope } from "../../../../../../lib/auth/requireBranchScope";
import { resolveBranch } from "../../../../../../lib/resolveBranch";
import { defaultPasswordFor } from "../../../../../../lib/auth/defaultPassword";
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
 * GET  /api/admin/branches/[branchId]/committee-assign — list committee members
 * POST /api/admin/branches/[branchId]/committee-assign — assign (create if new)
 * DELETE /api/admin/branches/[branchId]/committee-assign?memberUserId=... — remove
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
        console.error("[COMMITTEE-ASSIGN GET] Error:", err.message);
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

        if (member.role !== "COMMITTEE") {
            await prisma.user.update({ where: { id: member.id }, data: { role: "COMMITTEE" } });
        }

        const assignment = await prisma.committeeBranchAssignment.upsert({
            where: { memberUserId_branchId: { memberUserId: member.id, branchId } },
            update: { assignedBy: user.userId, assignedAt: new Date() },
            create: { memberUserId: member.id, branchId, assignedBy: user.userId },
            include: {
                member: { select: { id: true, empCode: true, name: true, mobile: true, role: true } },
            },
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
        console.error("[COMMITTEE-ASSIGN POST] Error:", err.message);
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
        const memberUserId = searchParams.get("memberUserId");
        if (!memberUserId) return fail("memberUserId query parameter is required");

        await prisma.committeeBranchAssignment.delete({
            where: { memberUserId_branchId: { memberUserId, branchId } },
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
        console.error("[COMMITTEE-ASSIGN DELETE] Error:", err.message);
        return serverError();
    }
});
