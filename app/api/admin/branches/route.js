export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../lib/prisma";
import { withRole } from "../../../../lib/withRole";
import { ok, fail, serverError, created, validateBody } from "../../../../lib/api-response";
import { z } from "zod";

const createBranchSchema = z.object({
    name: z.string().min(1, "Branch name is required"),
    location: z.string().min(1, "Location is required"),
    branchType: z.enum(["SMALL", "BIG"]).default("SMALL"),
});

const updateBranchSchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1).optional(),
    location: z.string().min(1).optional(),
    branchType: z.enum(["SMALL", "BIG"]).optional(),
});

/**
 * GET /api/admin/branches
 * List all branches with department counts
 */
export const GET = withRole(["ADMIN"], async (request, { user }) => {
    try {
        const branches = await prisma.branch.findMany({
            include: {
                departments: {
                    select: { id: true, name: true },
                },
                _count: {
                    select: { departments: true },
                },
            },
            orderBy: { name: "asc" },
        });

        return ok({ branches });
    } catch (err) {
        console.error("[BRANCHES] GET Error:", err.message);
        return serverError();
    }
});

/**
 * POST /api/admin/branches
 * Create a new branch or update an existing one
 */
export const POST = withRole(["ADMIN"], async (request, { user }) => {
    try {
        const body = await request.json();

        // If body has 'id', treat as update
        if (body.id) {
            const { data, error } = (() => {
                const result = updateBranchSchema.safeParse(body);
                return result.success
                    ? { data: result.data, error: null }
                    : { data: null, error: fail(result.error.errors[0].message) };
            })();
            if (error) return error;

            const updated = await prisma.branch.update({
                where: { id: data.id },
                data: {
                    ...(data.name && { name: data.name }),
                    ...(data.location && { location: data.location }),
                    ...(data.branchType && { branchType: data.branchType }),
                },
            });

            await prisma.auditLog.create({
                data: {
                    userId: user.userId,
                    action: "BRANCH_UPDATED",
                    details: { branchId: updated.id, changes: data },
                },
            }).catch(() => {});

            return ok({ branch: updated });
        }

        // Create new branch
        const { data, error } = (() => {
            const result = createBranchSchema.safeParse(body);
            return result.success
                ? { data: result.data, error: null }
                : { data: null, error: fail(result.error.errors[0].message) };
        })();
        if (error) return error;

        const existing = await prisma.branch.findUnique({ where: { name: data.name } });
        if (existing) return fail("Branch with this name already exists", 409);

        const branch = await prisma.branch.create({
            data: {
                name: data.name,
                location: data.location,
                branchType: data.branchType,
            },
        });

        await prisma.auditLog.create({
            data: {
                userId: user.userId,
                action: "BRANCH_CREATED",
                details: { branchId: branch.id, name: branch.name, branchType: branch.branchType },
            },
        }).catch(() => {});

        return created({ branch });
    } catch (err) {
        console.error("[BRANCHES] POST Error:", err.message);
        return serverError();
    }
});
