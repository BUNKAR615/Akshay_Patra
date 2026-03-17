import prisma from "../../../../lib/prisma";
import { signToken, verifyRefreshToken } from "../../../../lib/auth";
import { ok, fail, serverError } from "../../../../lib/api-response";

/**
 * POST /api/auth/refresh
 * Uses the refresh token cookie to issue a new access token.
 */
export async function POST(request) {
    try {
        const refreshToken = request.cookies.get("refreshToken")?.value;
        if (!refreshToken) return fail("No refresh token", 401);

        let decoded;
        try {
            decoded = verifyRefreshToken(refreshToken);
        } catch (err) {
            return fail(err.name === "TokenExpiredError" ? "Refresh token expired. Please login again." : "Invalid refresh token", 401);
        }

        // Verify user still exists
        const user = await prisma.user.findUnique({
            where: { id: decoded.userId },
            select: { id: true, role: true, departmentId: true },
        });
        if (!user) return fail("User no longer exists", 401);

        const newToken = signToken({ userId: user.id, role: user.role, departmentId: user.departmentId });

        const response = ok({ token: newToken });
        response.cookies.set("token", newToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            maxAge: 60 * 60, // 1h
            path: "/",
        });

        return response;
    } catch (err) {
        console.error("Refresh token error:", err);
        return serverError();
    }
}
