export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../lib/prisma";
import { signToken, verifyRefreshToken } from "../../../../lib/auth";
import { ok, fail, serverError } from "../../../../lib/api-response";

/**
 * POST /api/auth/refresh
 * Uses the refresh token cookie to issue a new access token.
 * Includes empCode and departmentIds in the refreshed token.
 */
export async function POST(request) {
    try {
        const refreshToken = request.cookies.get("refreshToken")?.value;
        if (!refreshToken) return fail("No refresh token", 401);

        const decoded = await verifyRefreshToken(refreshToken);
        if (!decoded) {
            return fail("Invalid or expired refresh token. Please login again.", 401);
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

        const newToken = await signToken({
            userId: user.id,
            empCode: user.empCode,
            role: activeRole,
            departmentIds,
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
