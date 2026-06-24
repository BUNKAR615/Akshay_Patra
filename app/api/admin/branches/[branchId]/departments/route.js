export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../../../lib/prisma";
import { withPermission } from "../../../../../../lib/withPermission";
import { ok, fail, serverError, notFound } from "../../../../../../lib/api-response";
import { requireBranchScope } from "../../../../../../lib/auth/requireBranchScope";
import { resolveBranch } from "../../../../../../lib/resolveBranch";
import { z } from "zod";

const createSchema = z.object({
    name: z.string().min(1, "Department name is required").max(100),
});

/**
 * GET /api/admin/branches/[branchId]/departments
 * Returns departments under a branch with per-department counts.
 */
export const GET = withPermission("branches.departments", async (request, { params, user }) => {
    try {
        const { branchId: slugOrId, error } = requireBranchScope(user, params);
        if (error) return error;

        const branch = await resolveBranch(slugOrId);
        if (!branch) return notFound("Branch not found");
        const branchId = branch.id;

        const departments = await prisma.department.findMany({
            where: { branchId },
            include: {
                _count: { select: { users: true } },
            },
            orderBy: { name: "asc" },
        });

        const withCounts = departments.map((d) => ({
            id: d.id,
            name: d.name,
            branchId: d.branchId,
            employeeCount: d._count.users,
            createdAt: d.createdAt,
        }));

        return ok({ departments: withCounts, branch: { id: branch.id, name: branch.name, branchType: branch.branchType } });
    } catch (err) {
        console.error("[BRANCH-DEPARTMENTS] Error:", err.message);
        return serverError();
    }
});

/**
 * POST /api/admin/branches/[branchId]/departments
 * Creates a department for this branch. Department names are unique per branch
 * (@@unique([name, branchId])) — the same name may exist in other branches.
 */
export const POST = withPermission("branches.departments", async (request, { params, user }) => {
    try {
        const { branchId: slugOrId, error } = requireBranchScope(user, params);
        if (error) return error;

        const branch = await resolveBranch(slugOrId);
        if (!branch) return notFound("Branch not found");
        const branchId = branch.id;

        const body = await request.json();
        const parsed = createSchema.safeParse(body);
        if (!parsed.success) return fail(parsed.error.errors[0].message);
        const name = parsed.data.name.trim();

        const duplicate = await prisma.department.findFirst({
            where: { branchId, name },
        });
        if (duplicate) return fail("This branch already has a department with that name", 409);

        const department = await prisma.department.create({
            data: { name, branchId },
        });

        await prisma.auditLog.create({
            data: {
                userId: user.userId,
                action: "DEPARTMENT_CREATED",
                details: { branchId, branchName: branch.name, departmentId: department.id, name },
            },
        }).catch(() => {});

        return ok({ department });
    } catch (err) {
        console.error("[BRANCH-DEPARTMENTS] Create error:", err.message);
        return serverError();
    }
});
