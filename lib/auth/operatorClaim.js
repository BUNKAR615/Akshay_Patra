import prisma from "../prisma";
import { hasAnyAdminAccess } from "../permissions";

/**
 * Compute the compact `op` JWT claim for a user: true when they hold ANY
 * per-user admin-area grant (UserPermission.isAdmin or a non-empty permission
 * list). Middleware gates operator access to /dashboard/admin on this claim
 * (the ADMIN role is allowed regardless). Best-effort: any DB error → false.
 *
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
export async function loadOpClaim(userId) {
    try {
        const record = await prisma.userPermission.findUnique({
            where: { userId },
            select: { isAdmin: true, permissions: true },
        });
        return hasAnyAdminAccess(record);
    } catch {
        return false;
    }
}
