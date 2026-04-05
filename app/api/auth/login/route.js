export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 15

import bcrypt from "bcryptjs";
import prisma from "../../../../lib/prisma";
import { signToken, signRefreshToken } from "../../../../lib/auth";
import { ok, fail, serverError, validateBody } from "../../../../lib/api-response";
import { loginSchema } from "../../../../lib/validators";
import { getClientIp, withDbRetry } from "../../../../lib/http";
import { sanitize } from "../../../../lib/sanitize";

/**
 * POST /api/auth/login
 * Authenticates via empCode + password. No rate limiting.
 * Sets httpOnly, Secure, SameSite cookies for both access and refresh tokens.
 *
 * DB calls are wrapped in withDbRetry to gracefully handle Neon pooler
 * cold-start hiccups (first request after idle period can fail with a
 * transient connection error — retry makes login succeed on attempt 1).
 *
 * Multi-role support:
 *   If user has 1 role  → returns user object, token set in cookie
 *   If user has 2+ roles → returns requiresRoleSelection: true, availableRoles[]
 *                          Token is set with role=null (must call /api/auth/select-role to finalize)
 */
export async function POST(request) {
    try {
        const { data, error } = await validateBody(request, loginSchema);
        if (error) {
            return error;
        }

        // Sanitize input
        const empCode = sanitize(data.empCode);

        // Look up user by empCode only (retry on transient connection errors)
        const user = await withDbRetry(() => prisma.user.findUnique({
            where: { empCode },
            select: {
                id: true, empCode: true, name: true,
                password: true, role: true, departmentId: true, designation: true,
            },
        }));

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
        const deptRoleMappings = await withDbRetry(() => prisma.departmentRoleMapping.findMany({
            where: { userId: user.id },
            select: { role: true, departmentId: true },
        }));

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

        // Single role — use the resolved role (may differ from user.role for supervisor-only users)
        const resolvedRole = allRoles[0];
        const tokenPayload = {
            userId: user.id,
            empCode: user.empCode,
            role: resolvedRole,
            departmentIds,
        };
        const token = await signToken(tokenPayload);
        const refreshToken = await signRefreshToken(tokenPayload);

        const response = ok({ token, user: { ...safeUser, role: resolvedRole } });

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
        console.error("[LOGIN] Error:", err?.code, err?.message, err?.stack);
        // Detect DB connection errors that slipped through retries so the
        // client sees a clear 503 "try again" instead of a generic 500.
        const code = err?.code || "";
        const msg = String(err?.message || "");
        const isConnection =
            code === "P1001" || code === "P1002" || code === "P1008" || code === "P1017" || code === "P2024" ||
            /ECONNREFUSED|ECONNRESET|ETIMEDOUT|EPIPE|socket hang up|Connection terminated|Connection closed|Closed the connection/i.test(msg);
        if (isConnection) {
            return fail("Service is starting up. Please try again in a moment.", 503);
        }
        return serverError();
    }
}
