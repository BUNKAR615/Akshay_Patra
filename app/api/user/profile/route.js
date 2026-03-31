export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../lib/prisma";
import { ok, unauthorized, serverError } from "../../../../lib/api-response";

/**
 * GET /api/user/profile
 *
 * Returns the logged-in user's profile details.
 * Excludes: password, doj, scores
 */
export async function GET(request) {
    try {
        const userId = request.headers.get("x-user-id");
        if (!userId) return unauthorized();

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                empCode: true,
                name: true,
                designation: true,
                mobile: true,
                role: true,
                department: {
                    select: { id: true, name: true, branch: { select: { name: true } } },
                },
                departmentRoles: {
                    select: {
                        role: true,
                        department: { select: { id: true, name: true } },
                    },
                },
            },
        });

        if (!user) return unauthorized("User not found");

        // Collect all unique roles from DepartmentRoleMapping + primary role
        const rolesSet = new Set();
        rolesSet.add(user.role);
        for (const dr of user.departmentRoles) {
            rolesSet.add(dr.role);
        }

        // Check if user is ADMIN (empCode 1800349 = RISHPAL KUMAWAT)
        if (user.empCode === '1800349') {
            rolesSet.add('ADMIN');
        }

        return ok({
            empCode: user.empCode,
            name: user.name,
            designation: user.designation || '',
            department: user.department?.name || '',
            branch: user.department?.branch?.name || 'Jaipur',
            mobile: user.mobile || '',
            roles: Array.from(rolesSet),
            departmentRoles: user.departmentRoles.map(dr => ({
                role: dr.role,
                departmentName: dr.department.name,
            })),
        });
    } catch (err) {
        console.error("Profile error:", err);
        return serverError();
    }
}
