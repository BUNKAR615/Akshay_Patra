import prisma from "../../../../../lib/prisma";
import { withRole } from "../../../../../lib/withRole";
import { ok, fail, serverError } from "../../../../../lib/api-response";

/**
 * GET /api/admin/departments/roles?departmentId=...
 * Returns role assignments for a specific department.
 */
export const GET = withRole(["ADMIN"], async (request) => {
    try {
        const { searchParams } = new URL(request.url);
        const departmentId = searchParams.get("departmentId");
        if (!departmentId) return fail("departmentId query parameter is required");

        const dept = await prisma.department.findUnique({
            where: { id: departmentId },
            select: { id: true, name: true },
        });
        if (!dept) return fail("Department not found");

        const roles = await prisma.departmentRole.findMany({
            where: { departmentId },
            include: { user: { select: { id: true, name: true, email: true, designation: true, role: true } } },
        });

        const supervisor = roles.find((r) => r.role === "SUPERVISOR")?.user || null;
        const branchManager = roles.find((r) => r.role === "BRANCH_MANAGER")?.user || null;
        const clusterManagers = roles.filter((r) => r.role === "CLUSTER_MANAGER").map((r) => r.user);

        return ok({
            department: dept.name,
            departmentId: dept.id,
            supervisor,
            branchManager,
            clusterManagers,
        });
    } catch (err) {
        console.error("Get dept roles error:", err);
        return serverError();
    }
});
