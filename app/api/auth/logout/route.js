export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../lib/prisma";
import { ok, serverError } from "../../../../lib/api-response";
import { getTokenExpiry } from "../../../../lib/auth";
import { getClientIp } from "../../../../lib/http";

/**
 * POST /api/auth/logout
 * Blacklists the current refresh token and clears both cookies.
 */
export async function POST(request) {
    try {
        const refreshToken = request.cookies.get("refreshToken")?.value;
        const userId = request.headers.get("x-user-id");
        const ip = getClientIp(request);

        // Blacklist the REFRESH token so it can't mint new access tokens after
        // logout — /api/auth/refresh checks this table before issuing one. The
        // row's expiresAt matches the refresh cookie's 7-day lifetime, so
        // prune-blacklist can clear it once it could no longer be replayed.
        if (refreshToken) {
            const expiresAt = getTokenExpiry(7 * 24);
            await prisma.blacklistedToken.create({
                data: { token: refreshToken, expiresAt },
            }).catch(() => { }); // non-critical (e.g. double logout: token already blacklisted)
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
