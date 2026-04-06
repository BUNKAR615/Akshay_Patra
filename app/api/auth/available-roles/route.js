export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../lib/prisma";
import { verifyToken } from "../../../../lib/auth";
import { ok, fail, serverError } from "../../../../lib/api-response";

/**
 * GET /api/auth/available-roles
 * Returns the full list of roles available to the currently authenticated user.
 * Used by the /select-role page when returning via "Switch Role" (no sessionStorage).
 */
export async function GET(request) {
    try {
        const token = request.cookies.get("token")?.value;
        if (!token) return fail("Authentication required", 401);

        const decoded = await verifyToken(token);
        if (!decoded) return fail("Invalid or expired token", 401);

        // If JWT already carries roles array, use it
        if (Array.isArray(decoded.roles) && decoded.roles.length > 0) {
            const user = await prisma.user.findUnique({
                where: { id: decoded.userId },
                select: { name: true },
            });
            return ok({ roles: decoded.roles, userName: user?.name || "" });
        }

        // Otherwise rebuild from DB (same logic as login)
        const user = await prisma.user.findUnique({
            where: { id: decoded.userId },
            select: { id: true, name: true, role: true, departmentId: true },
        });
        if (!user) return fail("User not found", 404);

        const deptRoleMappings = await prisma.departmentRoleMapping.findMany({
            where: { userId: user.id },
            select: { role: true },
        });

        const rolesSet = new Set();
        if (user.role === "ADMIN" || user.departmentId) {
            rolesSet.add(user.role);
        }
        deptRoleMappings.forEach(dr => rolesSet.add(dr.role));
        if (rolesSet.size === 0) rolesSet.add(user.role);

        return ok({ roles: [...rolesSet], userName: user.name });
    } catch (err) {
        console.error("[AVAILABLE-ROLES] Error:", err.message);
        return serverError();
    }
}
