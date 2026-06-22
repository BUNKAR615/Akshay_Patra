export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../lib/prisma";
import {
    signToken,
    signRefreshToken,
    verifyBranchSelectToken,
} from "../../../../lib/auth";
import { ok, fail, serverError } from "../../../../lib/api-response";
import { z } from "zod";
import { loadOpClaim } from "../../../../lib/auth/operatorClaim";

const bodySchema = z.object({
    branchId: z.string().min(1, "branchId is required"),
});

/**
 * POST /api/auth/select-branch
 *
 * Stage-2 of the multi-branch login flow. The user has already authenticated
 * with empCode + password and received a stage1 `branchSelectToken` cookie
 * along with a list of branches they're assigned to. They pick one and POST
 * its id here; we verify the stage1 token, confirm the branch belongs to the
 * user's role assignment table, and issue the full JWT cookie.
 */
export async function POST(request) {
    try {
        const stage1 = request.cookies.get("branchSelectToken")?.value;
        if (!stage1) {
            return fail("Branch selection session expired. Please sign in again.", 401);
        }
        const claims = await verifyBranchSelectToken(stage1);
        if (!claims?.userId || !claims?.role) {
            return fail("Branch selection session expired. Please sign in again.", 401);
        }

        const body = await request.json().catch(() => ({}));
        const parsed = bodySchema.safeParse(body);
        if (!parsed.success) return fail(parsed.error.errors[0].message);
        const { branchId } = parsed.data;

        const userId = String(claims.userId);
        const role = String(claims.role);

        // Verify the picked branch belongs to this user's assignments.
        const assignment = await branchAssignmentFor(userId, role, branchId);
        if (!assignment?.branch) {
            return fail("That branch is not assigned to your account.", 403);
        }

        // Re-fetch the user for the full JWT payload.
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true, empCode: true, name: true, role: true,
                departmentId: true, designation: true, collarType: true,
            },
        });
        if (!user) return fail("Account not found.", 401);

        const op = await loadOpClaim(user.id);
        const tokenPayload = {
            userId: user.id,
            empCode: user.empCode,
            role,
            departmentIds: user.departmentId ? [user.departmentId] : [],
            branchId: assignment.branch.id,
            branchType: assignment.branch.branchType,
            op,
        };
        const token = await signToken(tokenPayload);
        const refreshToken = await signRefreshToken(tokenPayload);

        await prisma.auditLog.create({
            data: {
                userId: user.id,
                action: "BRANCH_SELECTED",
                details: { role, branchId: assignment.branch.id },
            },
        }).catch(() => {});

        const response = ok({
            token,
            user: {
                ...user,
                role,
                branchId: assignment.branch.id,
                branchType: assignment.branch.branchType,
                branchName: assignment.branch.name,
            },
        });

        response.cookies.set("token", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 8 * 60 * 60,
            path: "/",
        });
        response.cookies.set("refreshToken", refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 7 * 24 * 60 * 60,
            path: "/",
        });
        // Drop the stage1 cookie now that we've upgraded.
        response.cookies.set("branchSelectToken", "", {
            httpOnly: true, sameSite: "lax", path: "/", maxAge: 0,
        });

        return response;
    } catch (err) {
        console.error("[SELECT-BRANCH] Error:", err?.code, err?.message);
        return serverError();
    }
}

async function branchAssignmentFor(userId, role, branchId) {
    if (role === "CLUSTER_MANAGER") {
        return prisma.clusterManagerBranchAssignment.findUnique({
            where: { cmUserId_branchId: { cmUserId: userId, branchId } },
            select: { branch: { select: { id: true, name: true, branchType: true } } },
        });
    }
    if (role === "HR") {
        return prisma.hrBranchAssignment.findUnique({
            where: { hrUserId_branchId: { hrUserId: userId, branchId } },
            select: { branch: { select: { id: true, name: true, branchType: true } } },
        });
    }
    if (role === "COMMITTEE") {
        return prisma.committeeBranchAssignment.findUnique({
            where: { memberUserId_branchId: { memberUserId: userId, branchId } },
            select: { branch: { select: { id: true, name: true, branchType: true } } },
        });
    }
    return null;
}
