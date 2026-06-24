export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { z } from "zod";

import prisma from "../../../../../../lib/prisma";
import { withRole } from "../../../../../../lib/withRole";
import { ok, fail, notFound, handleApiError, validateBody } from "../../../../../../lib/api-response";
import { getClientIp } from "../../../../../../lib/http";
import { isValidPermissionKey } from "../../../../../../lib/permissions";

/**
 * GET /api/admin/users/[id]/permissions
 * Returns a single user's stored grants: { isAdmin, permissions }.
 * ADMIN-only.
 */
export const GET = withRole(["ADMIN"], async (request, { params }) => {
    try {
        const targetUserId = params?.id;
        if (!targetUserId) return fail("Missing user id", 400);

        const target = await prisma.user.findUnique({
            where: { id: targetUserId },
            select: {
                id: true, name: true, empCode: true, role: true,
                permission: { select: { isAdmin: true, permissions: true, operatorTitle: true } },
            },
        });
        if (!target) return notFound("User not found");

        return ok({
            user: { id: target.id, name: target.name, empCode: target.empCode, role: target.role },
            isAdmin: !!target.permission?.isAdmin,
            permissions: target.permission?.permissions || [],
            operatorTitle: target.permission?.operatorTitle || "",
        });
    } catch (err) {
        return handleApiError(err, "ADMIN USER PERMS GET");
    }
});

const updateSchema = z.object({
    isAdmin: z.boolean().default(false),
    permissions: z.array(z.string()).default([]),
    // Admin-named "page role" (e.g. "HR Admin"). Optional, trimmed, capped.
    operatorTitle: z.string().trim().max(60, "Role name is too long").optional().default(""),
});

/**
 * PUT /api/admin/users/[id]/permissions
 *
 * Persists a user's grants. Validates every key against the catalog
 * (lib/permissions.js) so the UI can never store an unknown key. Upserts the
 * UserPermission row, stamps updatedById, and writes an audit log. ADMIN-only.
 *
 * NOTE: a user's PAGE access to /dashboard/admin is gated by the `op` JWT claim,
 * which is recomputed at login/refresh — so newly granted/revoked page access
 * takes effect on their next session. UI tabs and APIs always check fresh DB.
 */
export const PUT = withRole(["ADMIN"], async (request, { params, user }) => {
    try {
        const targetUserId = params?.id;
        if (!targetUserId) return fail("Missing user id", 400);

        const { data, error } = await validateBody(request, updateSchema);
        if (error) return error;

        // Drop duplicates and silently prune any key not in the current catalog.
        // The catalog changed (granular per-branch model), so a user's previously
        // stored keys like "branches.view"/"pipeline.edit" are simply removed on
        // the next save rather than blocking it.
        const permissions = [...new Set(data.permissions)].filter((k) => isValidPermissionKey(k));
        // When isAdmin is set, the individual grants are redundant — store none.
        const storedPermissions = data.isAdmin ? [] : permissions;
        const operatorTitle = data.operatorTitle ? data.operatorTitle : null;

        const target = await prisma.user.findUnique({
            where: { id: targetUserId },
            select: { id: true, empCode: true, name: true },
        });
        if (!target) return notFound("User not found");

        const saved = await prisma.userPermission.upsert({
            where: { userId: target.id },
            create: {
                userId: target.id,
                isAdmin: data.isAdmin,
                permissions: storedPermissions,
                operatorTitle,
                updatedById: user.userId,
            },
            update: {
                isAdmin: data.isAdmin,
                permissions: storedPermissions,
                operatorTitle,
                updatedById: user.userId,
            },
            select: { isAdmin: true, permissions: true, operatorTitle: true },
        });

        await prisma.auditLog.create({
            data: {
                userId: user.userId,
                action: "USER_PERMISSIONS_UPDATED",
                ipAddress: getClientIp(request),
                details: {
                    targetUserId: target.id,
                    targetEmpCode: target.empCode,
                    isAdmin: saved.isAdmin,
                    permissions: saved.permissions,
                    operatorTitle: saved.operatorTitle,
                },
            },
        }).catch(() => {});

        return ok({ isAdmin: saved.isAdmin, permissions: saved.permissions, operatorTitle: saved.operatorTitle || "" });
    } catch (err) {
        return handleApiError(err, "ADMIN USER PERMS PUT");
    }
});
