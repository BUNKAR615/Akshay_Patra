export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

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
 * Authenticates via empCode + password.
 * Sets httpOnly, Secure, SameSite cookies for both access and refresh tokens.
 * 
 * Multi-role support:
 *   If user has 1 role  → returns user object, token set in cookie
 *   If user has 2+ roles → returns requiresRoleSelection: true, availableRoles[]
 *                          Token is set with role=null (must call /api/auth/select-role to finalize)
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
        const empCode = sanitize(data.empCode);

        // Look up user by empCode only
        const user = await prisma.user.findUnique({
            where: { empCode },
            select: {
                id: true, empCode: true, name: true, email: true,
                password: true, role: true, departmentId: true, designation: true,
            },
        });

        const ip = getClientIp(request);

        if (!user) {
            console.warn("[LOGIN] Failed login attempt for unknown empCode:", empCode, "IP:", ip);
            return fail("Invalid employee code or password", 401);
        }

        const valid = await bcrypt.compare(data.password, user.password);
        if (!valid) {
            await prisma.auditLog.create({
                data: { userId: user.id, action: "LOGIN_FAILED", ipAddress: ip, details: { reason: "Wrong password" } },
            }).catch(() => { });
            return fail("Invalid employee code or password", 401);
        }

        // ── Build roles list from DepartmentRoleMapping table ──
        const deptRoleMappings = await prisma.departmentRoleMapping.findMany({
            where: { userId: user.id },
            select: { role: true, departmentId: true },
        });

        // Collect unique roles: primary role + all department roles
        // Only include EMPLOYEE role if user actually has a department (not a pure evaluator)
        const rolesSet = new Set();
        if (user.role === 'ADMIN' || user.departmentId) {
            rolesSet.add(user.role);
        }
        deptRoleMappings.forEach(dr => rolesSet.add(dr.role));
        // If no roles found at all (shouldn't happen), fall back to base role
        if (rolesSet.size === 0) rolesSet.add(user.role);
        const allRoles = [...rolesSet];

        // Collect unique departmentIds
        const deptIdsSet = new Set();
        if (user.departmentId) deptIdsSet.add(user.departmentId);
        deptRoleMappings.forEach(dr => deptIdsSet.add(dr.departmentId));
        const departmentIds = [...deptIdsSet];

        // Audit successful login
        await prisma.auditLog.create({
            data: {
                userId: user.id,
                action: "LOGIN",
                ipAddress: ip,
                details: { userAgent: request.headers.get("user-agent") || "unknown" },
            },
        }).catch((e) => { console.error("Audit log failed:", e); });

        const { password: _, ...safeUser } = user;

        // ── Multi-role vs single-role ──
        if (allRoles.length > 1) {
            // Multi-role: issue a temporary JWT with no role selected
            const tokenPayload = {
                userId: user.id,
                empCode: user.empCode,
                role: null,
                roles: allRoles,
                departmentIds,
            };
            const token = await signToken(tokenPayload);
            const refreshToken = await signRefreshToken(tokenPayload);

            const response = ok({
                token,
                user: { ...safeUser, roles: allRoles },
                requiresRoleSelection: true,
                availableRoles: allRoles,
            });

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
        }

        // Single role
        const tokenPayload = {
            userId: user.id,
            empCode: user.empCode,
            role: user.role,
            departmentIds,
        };
        const token = await signToken(tokenPayload);
        const refreshToken = await signRefreshToken(tokenPayload);

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
