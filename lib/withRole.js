import { unauthorized, forbidden, handleApiError } from "./api-response";

/**
 * Higher-order function that wraps an API route handler with role-based access control.
 * Returns consistent { success: false, message } responses.
 *
 * @param {string[]} allowedRoles - Array of roles permitted to access this route
 * @param {(request: Request, context: { params: object, user: object }) => Promise<Response>} handler
 * @param {{ allowedEmpCodes?: string[] }} opts - Optional: empCodes that bypass role check
 * @returns {(request: Request, context: object) => Promise<Response>}
 */
export function withRole(allowedRoles, handler, opts = {}) {
    return async (request, context) => {
        const userId = request.headers.get("x-user-id");
        const userRole = request.headers.get("x-user-role");
        const departmentId = request.headers.get("x-user-department-id");
        const empCode = request.headers.get("x-user-empcode") || "";

        // Parse departmentIds array from header (set by middleware)
        let departmentIds = [];
        try {
            const deptIdsHeader = request.headers.get("x-user-department-ids");
            if (deptIdsHeader) {
                departmentIds = JSON.parse(deptIdsHeader);
            }
        } catch {
            departmentIds = departmentId ? [departmentId] : [];
        }

        if (!userId || !userRole) {
            return unauthorized("Authentication required");
        }

        // Allow specific empCodes to bypass role check (e.g. HR employee management)
        const empCodeAllowed = opts.allowedEmpCodes?.includes(empCode);

        if (!empCodeAllowed && !allowedRoles.includes(userRole)) {
            return forbidden(
                `This action requires ${allowedRoles.join(" or ")} role. Your role: ${userRole}`
            );
        }

        // Parse branchId and branchType from headers (set by middleware)
        const branchId = request.headers.get("x-user-branch-id") || "";
        const branchType = request.headers.get("x-user-branch-type") || "";

        const user = { userId, role: userRole, empCode, departmentId, departmentIds, branchId, branchType };

        // Safety net: any UNCAUGHT throw from a handler becomes a clean JSON
        // response (503 for transient DB errors, else 500) instead of
        // Next.js's raw HTML "Internal Server Error" page. Handlers that
        // catch their own errors and return a Response are unaffected.
        try {
            return await handler(request, { ...context, user });
        } catch (err) {
            let label = "API";
            try { label = `${request.method} ${new URL(request.url).pathname}`; } catch { /* ignore */ }
            return handleApiError(err, label);
        }
    };
}
