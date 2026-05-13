export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../lib/prisma";
import { signToken, verifyRefreshToken } from "../../../../lib/auth";
import { ok, fail, serverError } from "../../../../lib/api-response";
import { resolveScopeBranch } from "../../../../lib/auth/resolveScopeBranch";

/**
 * POST /api/auth/refresh
 * Uses the refresh token cookie to issue a new access token.
 * Includes empCode, departmentIds, branchId, and branchType in the
 * refreshed token. Branch context is revalidated against the assignment
 * tables — if the user's CM/HR/COMMITTEE assignment has been removed,
 * the refresh fails so they have to log in again and re-pick a branch.
 */
export async function POST(request) {
    try {
        const refreshToken = request.cookies.get("refreshToken")?.value;
        if (!refreshToken) return fail("No refresh token", 401);

        const decoded = await verifyRefreshToken(refreshToken);
        if (!decoded) {
            return fail("Invalid or expired refresh token. Please login again.", 401);
        }

        // Reject tokens that were revoked at logout. Logout writes the token into
        // BlacklistedToken; without this check a logged-out refresh cookie would
        // keep minting access tokens until JWT expiry.
        const revoked = await prisma.blacklistedToken.findUnique({
            where: { token: refreshToken },
            select: { id: true },
        });
        if (revoked) {
            return fail("Refresh token has been revoked. Please login again.", 401);
        }

        // Verify user still exists and get fresh data
        const user = await prisma.user.findUnique({
            where: { id: decoded.userId },
            select: { id: true, empCode: true, role: true, departmentId: true },
        });
        if (!user) return fail("User no longer exists", 401);

        // Build fresh departmentIds from DepartmentRoleMapping table
        const deptRoleMappings = await prisma.departmentRoleMapping.findMany({
            where: { userId: user.id },
            select: { departmentId: true },
        });

        const deptIdsSet = new Set();
        if (user.departmentId) deptIdsSet.add(user.departmentId);
        deptRoleMappings.forEach(dr => deptIdsSet.add(dr.departmentId));
        const departmentIds = [...deptIdsSet];

        // Use the role from the decoded token (preserves selected role for multi-role users)
        const activeRole = decoded.role || user.role;

        // Re-validate branch context. The refresh token carries the branchId
        // the user picked at login (or that was auto-picked for single-branch
        // staff). For BM/CM/HR/COMMITTEE we re-check the assignment table —
        // if the assignment has been removed since login, the refresh must
        // fail so the user re-authenticates and picks a current branch.
        let branchId = "";
        let branchType = "";
        if (activeRole === "BRANCH_MANAGER" || activeRole === "CLUSTER_MANAGER" || activeRole === "HR" || activeRole === "COMMITTEE") {
            const { branch } = await resolveScopeBranch({
                userId: user.id,
                role: activeRole,
                branchId: decoded.branchId || "",
            });
            if (!branch) {
                return fail("Your branch assignment has changed. Please sign in again.", 401);
            }
            branchId = branch.id;
            branchType = branch.branchType || "";
        } else {
            // EMPLOYEE / HOD / ADMIN — preserve whatever the prior token had.
            branchId = decoded.branchId || "";
            branchType = decoded.branchType || "";
        }

        const newToken = await signToken({
            userId: user.id,
            empCode: user.empCode,
            role: activeRole,
            departmentIds,
            branchId,
            branchType,
        });

        const response = ok({ token: newToken });
        response.cookies.set("token", newToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 8 * 60 * 60, // 8 hours
            path: "/",
        });

        return response;
    } catch (err) {
        console.error("Refresh token error:", err);
        return serverError();
    }
}
