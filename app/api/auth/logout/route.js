export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../lib/prisma";
import { ok, serverError } from "../../../../lib/api-response";
import { getTokenExpiry } from "../../../../lib/auth";
import { getClientIp } from "../../../../lib/rate-limit";

/**
 * POST /api/auth/logout
 * Blacklists the current access token and clears both cookies.
 */
export async function POST(request) {
    try {
        const token = request.cookies.get("token")?.value;
        const userId = request.headers.get("x-user-id");
        const ip = getClientIp(request);

        // Blacklist the token so it can't be reused
        if (token) {
            const expiresAt = getTokenExpiry(token);
            await prisma.blacklistedToken.create({
                data: { token, expiresAt },
            }).catch(() => { }); // non-critical
        }

        // Audit the logout
        if (userId) {
            await prisma.auditLog.create({
                data: { userId, action: "LOGOUT", ipAddress: ip, details: {} },
            }).catch(() => { });
        }

        const response = ok({ message: "Logged out successfully" });

        response.cookies.set("token", "", {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            maxAge: 0,
            path: "/",
        });

        response.cookies.set("refreshToken", "", {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            maxAge: 0,
            path: "/",
        });

        return response;
    } catch (err) {
        console.error("Logout error:", err);
        return serverError();
    }
}
