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

        const globalBM = await prisma.user.findFirst({
            where: { role: "BRANCH_MANAGER" },
            select: { id: true, name: true, email: true, designation: true }
        });
        const globalCM = await prisma.user.findFirst({
            where: { role: "CLUSTER_MANAGER" },
            select: { id: true, name: true, email: true, designation: true }
        });

        const result = departments.map((dept) => {
            const roles = dept.departmentRoles;
            return {
                id: dept.id,
                name: dept.name,
                branch: dept.branch.name,
                employeeCount: dept._count.users,
                supervisor: roles.find((r) => r.role === "SUPERVISOR")?.user || null,
                branchManager: globalBM,
                clusterManagers: globalCM ? [globalCM] : [],
            };
        });

        return ok({ departments: result });
    } catch (err) {
        console.error("All assignments error:", err);
        return serverError();
    }
});
