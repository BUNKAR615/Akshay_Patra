import { unauthorized, forbidden, handleApiError } from "./api-response";
import { hasPermission } from "./permissions";
import prisma from "./prisma";

/**
 * Higher-order function that wraps an API route handler with per-user
 * feature-permission access control. Mirrors lib/withRole.js.
 *
 * ADMIN role bypasses all checks. Otherwise the caller's UserPermission row is
 * loaded (one indexed query by userId) and checked against `keyOrKeys`. An
 * array of keys is satisfied by holding ANY of them (any-of).
 *
 * @param {string|string[]} keyOrKeys - permission key(s) required (see lib/permissions.js)
 * @param {(request: Request, context: { params: object, user: object }) => Promise<Response>} handler
 * @param {{ allowedEmpCodes?: string[] }} opts - empCodes that bypass the check (mirrors withRole)
 * @returns {(request: Request, context: object) => Promise<Response>}
 */
export function withPermission(keyOrKeys, handler, opts = {}) {
    return async (request, context) => {
        const userId = request.headers.get("x-user-id");
        const userRole = request.headers.get("x-user-role");
        const empCode = request.headers.get("x-user-empcode") || "";

        if (!userId || !userRole) {
            return unauthorized("Authentication required");
        }

        // Pre-existing per-empCode bypass (e.g. designated HR employee-managers),
        // mirrors lib/withRole.js opts.allowedEmpCodes.
        const empCodeAllowed = opts.allowedEmpCodes?.includes(empCode);

        // Parse the same scope headers withRole exposes, so handlers swapped from
        // withRole → withPermission keep the identical `user` shape.
        const departmentId = request.headers.get("x-user-department-id") || "";
        let departmentIds = [];
        try {
            const deptIdsHeader = request.headers.get("x-user-department-ids");
            if (deptIdsHeader) departmentIds = JSON.parse(deptIdsHeader);
        } catch {
            departmentIds = departmentId ? [departmentId] : [];
        }
        const branchId = request.headers.get("x-user-branch-id") || "";
        const branchType = request.headers.get("x-user-branch-type") || "";

        let isAdminGrant = false;
        let permissions = [];

        // ADMIN role and the empCode bypass short-circuit the DB lookup entirely.
        if (userRole !== "ADMIN" && !empCodeAllowed) {
            try {
                const record = await prisma.userPermission.findUnique({
                    where: { userId },
                    select: { isAdmin: true, permissions: true },
                });
                isAdminGrant = !!record?.isAdmin;
                permissions = record?.permissions || [];
            } catch (err) {
                return handleApiError(err, "withPermission lookup");
            }
        }

        const user = {
            userId,
            role: userRole,
            empCode,
            departmentId,
            departmentIds,
            branchId,
            branchType,
            isAdmin: isAdminGrant,
            permissions,
        };

        if (!empCodeAllowed && !hasPermission(user, keyOrKeys)) {
            const need = Array.isArray(keyOrKeys) ? keyOrKeys.join(" or ") : keyOrKeys;
            return forbidden(`This action requires the "${need}" permission.`);
        }

        // Same safety net as withRole: uncaught throws become clean JSON.
        try {
            return await handler(request, { ...context, user });
        } catch (err) {
            let label = "API";
            try { label = `${request.method} ${new URL(request.url).pathname}`; } catch { /* ignore */ }
            return handleApiError(err, label);
        }
    };
}
