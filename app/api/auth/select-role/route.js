export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../lib/prisma";
import {
    signToken,
    signRefreshToken,
    verifyRoleSelectToken,
} from "../../../../lib/auth";
import { ok, fail, serverError } from "../../../../lib/api-response";
import { selectRoleSchema } from "../../../../lib/validators";
import { resolveRoleScope } from "../../../../lib/auth/loginRoles";
import { loadOpClaim } from "../../../../lib/auth/operatorClaim";

/**
 * POST /api/auth/select-role
 *
 * Stage-2 of the Admin+HOD login flow. The user has already authenticated
 * with empCode + password and received a stage1 `roleSelectToken` cookie
 * along with the list of roles they can act as. They pick one and POST it
 * here; we verify the stage1 token, confirm the role is one they're actually
 * eligible for (re-checking the DB so a stale cookie cannot grant a role
 * that was just removed), and issue the full JWT cookie.
 */
export async function POST(request) {
    try {
        const stage1 = request.cookies.get("roleSelectToken")?.value;
        if (!stage1) {
            return fail("Role selection session expired. Please sign in again.", 401);
        }
        const claims = await verifyRoleSelectToken(stage1);
        if (!claims?.userId || !Array.isArray(claims?.roles) || claims.roles.length === 0) {
            return fail("Role selection session expired. Please sign in again.", 401);
        }

        const body = await request.json().catch(() => ({}));
        const parsed = selectRoleSchema.safeParse(body);
        if (!parsed.success) return fail(parsed.error.errors[0].message);
        const { role } = parsed.data;

        const stage1Roles = claims.roles.map((r) => String(r));
        if (!stage1Roles.includes(role)) {
            return fail("That role was not offered for this login.", 403);
        }

        const userId = String(claims.userId);
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true, empCode: true, name: true, role: true,
                departmentId: true, designation: true, collarType: true,
                department: {
                    select: {
                        id: true, branchId: true,
                        branch: { select: { id: true, name: true, branchType: true } },
                    },
                },
            },
        });
        if (!user) return fail("Account not found.", 401);

        // Re-verify the chosen role is still actually held — assignments can
        // change between login stage 1 and this request, and a stale cookie must
        // never grant a role the user no longer has. Each role is checked against
        // its authoritative source (assignment table, or User.role for ADMIN).
        const stillAvailable = await roleStillAvailable(userId, role, user);
        if (!stillAvailable) {
            return fail("That role is no longer available for your account.", 403);
        }

        // Branch + department scope for the JWT — the same resolver login uses,
        // so a picked role yields a token identical to a direct single-role login.
        const scope = await resolveRoleScope(userId, role, user);
        if (scope.error) return fail(scope.error, 401);
        const { branchId, branchType, branchName, departmentIds } = scope;

        const op = await loadOpClaim(user.id);
        const tokenPayload = {
            userId: user.id,
            empCode: user.empCode,
            role,
            departmentIds,
            branchId,
            branchType,
            op,
        };
        const token = await signToken(tokenPayload);
        const refreshToken = await signRefreshToken(tokenPayload);

        await prisma.auditLog.create({
            data: {
                userId: user.id,
                action: "ROLE_SELECTED",
                details: { role, offered: stage1Roles },
            },
        }).catch(() => { });

        const { department: _dept, ...safeUser } = user;
        const response = ok({
            token,
            user: {
                ...safeUser,
                role,
                branchId,
                branchType,
                branchName,
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
        response.cookies.set("roleSelectToken", "", {
            httpOnly: true, sameSite: "lax", path: "/", maxAge: 0,
        });

        return response;
    } catch (err) {
        console.error("[SELECT-ROLE] Error:", err?.code, err?.message);
        return serverError();
    }
}

/**
 * Confirm `userId` still legitimately holds `role`, checking the authoritative
 * source for each role. Defends against a stale stage1 cookie granting a role
 * that was removed between login and this request.
 */
async function roleStillAvailable(userId, role, user) {
    switch (role) {
        case "HOD":
            return !!(await prisma.hodAssignment.findFirst({
                where: { hodUserId: userId, quarter: { status: "ACTIVE" } }, select: { id: true },
            }));
        case "BRANCH_MANAGER":
            return !!(await prisma.branchManagerAssignment.findUnique({
                where: { bmUserId: userId }, select: { id: true },
            }));
        case "CLUSTER_MANAGER":
            return !!(await prisma.clusterManagerBranchAssignment.findFirst({
                where: { cmUserId: userId }, select: { id: true },
            }));
        case "HR":
            return !!(await prisma.hrBranchAssignment.findFirst({
                where: { hrUserId: userId }, select: { id: true },
            }));
        case "COMMITTEE":
            return !!(await prisma.committeeBranchAssignment.findFirst({
                where: { memberUserId: userId }, select: { id: true },
            }));
        default:
            // ADMIN / EMPLOYEE — backed by the stored primary role.
            return user.role === role;
    }
}
