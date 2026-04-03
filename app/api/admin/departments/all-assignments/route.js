export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../../lib/prisma";
import { withRole } from "../../../../../lib/withRole";
import { ok, serverError } from "../../../../../lib/api-response";

/**
 * GET /api/admin/departments/all-assignments
 * Returns full org structure: all departments with their assigned evaluators.
 */
export const GET = withRole(["ADMIN"], async () => {
    try {
        const departments = await prisma.department.findMany({
            orderBy: { name: "asc" },
            select: {
                id: true,
                name: true,
                branch: { select: { name: true } },
                departmentRoles: {
                    include: { user: { select: { id: true, name: true, email: true, designation: true } } },
                },
                _count: { select: { users: { where: { role: "EMPLOYEE" } } } },
            },
        });

        const result = departments
            .filter((dept) => dept._count.users > 0 || dept.departmentRoles.length > 0)
            .map((dept) => {
                const roles = dept.departmentRoles;
                const supervisors = roles.filter((r) => r.role === "SUPERVISOR").map(r => r.user);
                const branchManagers = roles.filter((r) => r.role === "BRANCH_MANAGER").map(r => r.user);
                const clusterManagers = roles.filter((r) => r.role === "CLUSTER_MANAGER").map(r => r.user);
                return {
                    id: dept.id,
                    name: dept.name,
                    branch: dept.branch.name,
                    employeeCount: dept._count.users,
                    supervisor: supervisors[0] || null,
                    supervisors,
                    branchManager: branchManagers[0] || null,
                    branchManagers,
                    clusterManagers,
                };
            });

        return ok({ departments: result });
    } catch (err) {
        console.error("All assignments error:", err);
        return serverError();
    }
});
