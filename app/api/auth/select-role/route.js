export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { verifyToken, signToken, signRefreshToken } from "../../../../lib/auth";
import { ok, fail, serverError, validateBody } from "../../../../lib/api-response";
import { selectRoleSchema } from "../../../../lib/validators";

/**
 * POST /api/auth/select-role
 * After multi-role login, the user selects which role to continue as.
 * Re-issues JWT with the chosen role set.
 */
export async function POST(request) {
    try {
        const token = request.cookies.get("token")?.value;
        if (!token) {
            return fail("Authentication required", 401);
        }

        const decoded = await verifyToken(token);
        if (!decoded) {
            return fail("Invalid or expired token. Please login again.", 401);
        }

        // Validate body
        const { data, error } = await validateBody(request, selectRoleSchema);
        if (error) {
            return error;
        }

        // Ensure user actually has the selected role
        const availableRoles = decoded.roles;
        if (!Array.isArray(availableRoles) || !availableRoles.includes(data.role)) {
            return fail("You do not have the selected role", 403);
        }

        // Issue new JWT with the selected role
        const newPayload = {
            userId: decoded.userId,
            empCode: decoded.empCode,
            role: data.role,
            departmentIds: decoded.departmentIds || [],
        };

        const newToken = await signToken(newPayload);
        const newRefreshToken = await signRefreshToken(newPayload);

        const response = ok({ role: data.role });

        // Access token cookie — 8 hours
        response.cookies.set("token", newToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 8 * 60 * 60,
            path: "/",
        });

        // Refresh token cookie — 7 days
        response.cookies.set("refreshToken", newRefreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 7 * 24 * 60 * 60,
            path: "/",
        });

        return response;
    } catch (err) {
        console.error("[SELECT-ROLE] Error:", err.message, err.stack);
        return serverError();
    }
}
