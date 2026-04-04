import { unauthorized, forbidden } from "./api-response";

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

        const user = { userId, role: userRole, empCode, departmentId, departmentIds };
        return handler(request, { ...context, user });
    };
}
