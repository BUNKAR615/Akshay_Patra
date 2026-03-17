import { unauthorized, forbidden } from "./api-response";

/**
 * Higher-order function that wraps an API route handler with role-based access control.
 * Returns consistent { success: false, message } responses.
 *
 * @param {string[]} allowedRoles - Array of roles permitted to access this route
 * @param {(request: Request, context: { params: object, user: object }) => Promise<Response>} handler
 * @returns {(request: Request, context: object) => Promise<Response>}
 */
export function withRole(allowedRoles, handler) {
    return async (request, context) => {
        const userId = request.headers.get("x-user-id");
        const userRole = request.headers.get("x-user-role");
        const departmentId = request.headers.get("x-user-department-id");

        if (!userId || !userRole) {
            return unauthorized("Authentication required");
        }

        if (!allowedRoles.includes(userRole)) {
            return forbidden(
                `This action requires ${allowedRoles.join(" or ")} role. Your role: ${userRole}`
            );
        }

        const user = { userId, role: userRole, departmentId };
        return handler(request, { ...context, user });
    };
}
