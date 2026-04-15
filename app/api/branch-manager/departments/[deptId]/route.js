export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../../lib/prisma";
import { withRole } from "../../../../../lib/withRole";
import { ok, fail, serverError, notFound } from "../../../../../lib/api-response";
import { z } from "zod";

const renameSchema = z.object({
    name: z.string().min(1, "Department name is required").max(100),
});

/**
 * PATCH /api/branch-manager/departments/[deptId]
 * Renames a department. Scoped to BM's own branch.
 */
export const PATCH = withRole(["BRANCH_MANAGER"], async (request, { params, user }) => {
    try {
        const branchId = user.branchId;
        if (!branchId) return fail("No branch scope assigned", 403);

        const { deptId } = params;
        if (!deptId) return fail("Department ID is required");

        const body = await request.json();
        const parsed = renameSchema.safeParse(body);
        if (!parsed.success) return fail(parsed.error.errors[0].message);

        const dept = await prisma.department.findUnique({ where: { id: deptId } });
        if (!dept) return notFound("Department not found");
        if (dept.branchId !== branchId) return fail("Department does not belong to your branch", 403);

        // Prevent duplicate names within the same branch
        const duplicate = await prisma.department.findFirst({
            where: { branchId, name: parsed.data.name, NOT: { id: deptId } },
        });
        if (duplicate) return fail("Another department in this branch already uses that name", 409);

        const updated = await prisma.department.update({
            where: { id: deptId },
            data: { name: parsed.data.name },
        });

        await prisma.auditLog.create({
            data: {
                userId: user.userId,
                action: "BM_DEPARTMENT_RENAMED",
                details: { branchId, departmentId: deptId, from: dept.name, to: parsed.data.name },
            },
        }).catch(() => {});

        return ok({ department: updated });
    } catch (err) {
        console.error("[BM-DEPT-RENAME] Error:", err.message);
        return serverError();
    }
});
