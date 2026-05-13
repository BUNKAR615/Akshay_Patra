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

        // Re-verify the chosen role is still actually available — a HodAssignment
        // could have been removed between login stage 1 and this request.
        if (role === "HOD") {
            const hasHodAssignment = await prisma.hodAssignment.findFirst({
                where: { hodUserId: userId, quarter: { status: "ACTIVE" } },
                select: { id: true },
            });
            if (!hasHodAssignment) return fail("HOD role is no longer assigned to your account.", 403);
        } else {
            // For non-HOD roles, the stored User.role must match the chosen one.
            if (user.role !== role) return fail("That role is no longer available for your account.", 403);
        }

        // Branch + departmentIds in the issued token, role-aware.
        let branchId = "";
        let branchType = user.department?.branch?.branchType || "";
        let branchName = user.department?.branch?.name || "";
        const departmentIds = user.departmentId ? [user.departmentId] : [];

        if (role === "HOD") {
            // HOD's branch comes from any of their HodAssignment rows (all same branch).
            const hodAssignments = await prisma.hodAssignment.findMany({
                where: { hodUserId: userId, quarter: { status: "ACTIVE" } },
                select: {
                    departmentId: true,
                    branch: { select: { id: true, name: true, branchType: true } },
                },
            });
            for (const a of hodAssignments) {
                if (!departmentIds.includes(a.departmentId)) departmentIds.push(a.departmentId);
                if (!branchId && a.branch) {
                    branchId = a.branch.id;
                    branchType = a.branch.branchType;
                    branchName = a.branch.name;
                }
            }
        }
        // ADMIN has no branch scope — leave branchId/branchType blank/derived.

        const tokenPayload = {
            userId: user.id,
            empCode: user.empCode,
            role,
            departmentIds,
            branchId,
            branchType,
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
