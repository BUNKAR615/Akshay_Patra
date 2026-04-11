export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../../lib/prisma";
import { withRole } from "../../../../../lib/withRole";
import { ok, serverError } from "../../../../../lib/api-response";

/**
 * GET /api/admin/departments/all-assignments
 * Returns full org structure: all departments with their assigned evaluators
 * and the full employee list per department.
 */
export const GET = withRole(["ADMIN"], async () => {
    try {
        const departments = await prisma.department.findMany({
            orderBy: { name: "asc" },
            select: {
                id: true,
                name: true,
                collarType: true,
                branch: { select: { id: true, name: true, branchType: true } },
                departmentRoles: {
                    include: { user: { select: { id: true, empCode: true, name: true, designation: true, mobile: true } } },
                },
                users: {
                    select: {
                        id: true,
                        empCode: true,
                        name: true,
                        designation: true,
                        mobile: true,
                        role: true,
                        departmentRoles: {
                            select: { role: true, department: { select: { name: true } } },
                        },
                    },
                    orderBy: { name: "asc" },
                },
                _count: { select: { users: true } },
            },
        });

        const result = departments
            .filter((dept) => dept._count.users > 0 || dept.departmentRoles.length > 0)
            .map((dept) => {
                const roles = dept.departmentRoles;
                const supervisors = roles.filter((r) => r.role === "SUPERVISOR").map(r => ({
                    ...r.user,
                    mappedRole: "SUPERVISOR",
                }));
                const branchManagers = roles.filter((r) => r.role === "BRANCH_MANAGER").map(r => ({
                    ...r.user,
                    mappedRole: "BRANCH_MANAGER",
                }));
                const clusterManagers = roles.filter((r) => r.role === "CLUSTER_MANAGER").map(r => ({
                    ...r.user,
                    mappedRole: "CLUSTER_MANAGER",
                }));
                const hods = roles.filter((r) => r.role === "HOD").map(r => ({
                    ...r.user,
                    mappedRole: "HOD",
                }));

                // Build employee list with their effective roles
                const employees = dept.users.map((u) => {
                    const effectiveRoles = [];
                    if (u.role === "ADMIN") effectiveRoles.push("ADMIN");
                    effectiveRoles.push("EMPLOYEE");
                    for (const dr of u.departmentRoles) {
                        if (!effectiveRoles.includes(dr.role)) effectiveRoles.push(dr.role);
                    }
                    const evaluatorRoles = u.departmentRoles.map((dr) => ({
                        role: dr.role,
                        department: dr.department.name,
                    }));
                    return {
                        id: u.id,
                        empCode: u.empCode,
                        name: u.name,
                        designation: u.designation || null,
                        mobile: u.mobile || null,
                        role: u.role,
                        roles: effectiveRoles,
                        evaluatorRoles,
                    };
                });

                return {
                    id: dept.id,
                    name: dept.name,
                    branch: dept.branch.name,
                    branchType: dept.branch.branchType,
                    collarType: dept.collarType,
                    employeeCount: dept._count.users,
                    supervisor: supervisors[0] || null,
                    supervisors,
                    branchManager: branchManagers[0] || null,
                    branchManagers,
                    clusterManagers,
                    hods,
                    employees,
                };
            });

        return ok({ departments: result });
    } catch (err) {
        console.error("All assignments error:", err);
        return serverError();
    }
});
