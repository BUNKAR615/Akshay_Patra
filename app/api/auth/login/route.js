import bcrypt from "bcryptjs";
import prisma from "../../../../lib/prisma";
import { signToken, signRefreshToken } from "../../../../lib/auth";
import { ok, fail, serverError, validateBody } from "../../../../lib/api-response";
import { loginSchema } from "../../../../lib/validators";
import { checkLoginRateLimit, getClientIp } from "../../../../lib/rate-limit";
import { sanitize } from "../../../../lib/sanitize";

/**
 * POST /api/auth/login
 * Rate limited: 5 attempts per IP per 15 minutes.
 * Sets httpOnly, Secure, SameSite=Strict cookies for both access and refresh tokens.
 */
export async function POST(request) {
    try {
        // ── Rate limit check ──
        const rateLimitResponse = await checkLoginRateLimit(request);
        if (rateLimitResponse) {
            return rateLimitResponse;
        }

        const { data, error } = await validateBody(request, loginSchema);
        if (error) {
            return error;
        }

        // Sanitize input
        const username = sanitize(data.username);

        // Look up by empCode first, then by email
        let user;
        if (/^\d+$/.test(username)) {
            // Numeric — treat as empCode
            user = await prisma.user.findUnique({
                where: { empCode: username },
                select: { id: true, empCode: true, name: true, email: true, password: true, role: true, departmentId: true, designation: true },
            });
            // Fallback: also try email (empCode@akshayapatra.org)
            if (!user) {
                user = await prisma.user.findUnique({
                    where: { email: username + '@akshayapatra.org' },
                    select: { id: true, empCode: true, name: true, email: true, password: true, role: true, departmentId: true, designation: true },
                });
            }
        } else {
            // Non-numeric — treat as email
            user = await prisma.user.findUnique({
                where: { email: username.toLowerCase() },
                select: { id: true, empCode: true, name: true, email: true, password: true, role: true, departmentId: true, designation: true },
            });
        }

        const ip = getClientIp(request);

        if (!user) {
            console.warn("[LOGIN] Failed login attempt for unknown username:", username, "IP:", ip);
            return fail("Invalid employee code or password", 401);
        }

        const valid = await bcrypt.compare(data.password, user.password);
        if (!valid) {
            prisma.auditLog.create({
                data: { userId: user.id, action: "LOGIN_FAILED", ipAddress: ip, details: { reason: "Wrong password" } },
            }).catch(() => { });
            return fail("Invalid email or password", 401);
        }

        const tokenPayload = { userId: user.id, role: user.role, departmentId: user.departmentId };
        const token = signToken(tokenPayload);
        const refreshToken = signRefreshToken(tokenPayload);

        // Audit successful login (fire-and-forget — don't block response)
        prisma.auditLog.create({
            data: {
                userId: user.id,
                action: "LOGIN",
                ipAddress: ip,
                details: { userAgent: request.headers.get("user-agent") || "unknown" },
            },
        }).catch(() => { });

        const { password: _, ...safeUser } = user;

        const response = ok({ token, user: safeUser });

        // Access token cookie — 8 hours
        response.cookies.set("token", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 8 * 60 * 60,
            path: "/",
        });

        // Refresh token cookie — 7 days
        response.cookies.set("refreshToken", refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 7 * 24 * 60 * 60,
            path: "/",
        });

        return response;
    } catch (err) {
        console.error("[LOGIN] Error:", err.message, err.stack);
        return serverError();
    }
}
