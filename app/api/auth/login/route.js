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
import { checkAndRecord, clear as clearRateLimit } from "../../../../lib/rate-limit";

/**
 * POST /api/auth/login
 *
 * Single-role auth (no /select-role). Every user has exactly one primary role.
 *
 * Dual-password HOD flow (big-branch blue-collar):
 *   - Try bcrypt(data.password, user.password) first → issue token with user.role.
 *   - If that fails AND user.passwordHod is set AND the user has an active
 *     HodAssignment, try bcrypt(data.password, user.passwordHod) → issue token
 *     with role=HOD.
 *   - Otherwise 401.
 *
 * The login form sends only { empCode, password }. No role toggle.
 */
export async function POST(request) {
    try {
        const { data, error } = await validateBody(request, loginSchema);
        if (error) return error;

        const empCode = sanitize(data.empCode);

        // Rate-limit: per-IP and per-empCode, before any DB call.
        // Checked BEFORE recording so the IP key isn't poisoned by a legitimate
        // user's first wrong attempt; the per-empCode key carries that.
        const ip = getClientIp(request);
        const ipKey = `login:ip:${ip}`;
        const userKey = `login:emp:${empCode}`;
        const ipGate = checkAndRecord(ipKey, { maxAttempts: 20 });
        const userGate = checkAndRecord(userKey, { maxAttempts: 8 });
        if (!ipGate.allowed || !userGate.allowed) {
            const retryAfterMs = Math.max(ipGate.retryAfterMs, userGate.retryAfterMs);
            const seconds = Math.ceil(retryAfterMs / 1000);
            return fail(`Too many login attempts. Try again in ${seconds} seconds.`, 429);
        }

        const user = await withDbRetry(() => prisma.user.findUnique({
            where: { empCode },
            select: {
                id: true, empCode: true, name: true,
                password: true, passwordHod: true, role: true,
                departmentId: true, designation: true, collarType: true,
                branchId: true,
                department: {
                    select: {
                        id: true,
                        branchId: true,
                        name: true,
                        branch: { select: { id: true, name: true, branchType: true } }
                    }
                }
            },
        }));

        if (!user) {
            console.warn("[LOGIN] Failed login attempt for unknown empCode:", empCode, "IP:", ip);
            return fail("Invalid employee code or password", 401);
        }

        // Attempt 1 — primary password → user.role
        let resolvedRole = null;
        if (user.password) {
            const ok1 = await bcrypt.compare(data.password, user.password);
            if (ok1) resolvedRole = user.role;
        }

        // Attempt 2 — HOD secondary password, only if user has an active HOD assignment
        if (!resolvedRole && user.passwordHod) {
            const hasHodAssignment = await prisma.hodAssignment.findFirst({
                where: { hodUserId: user.id, quarter: { status: "ACTIVE" } },
                select: { id: true },
            });
            if (hasHodAssignment) {
                const ok2 = await bcrypt.compare(data.password, user.passwordHod);
                if (ok2) resolvedRole = "HOD";
            }
        }

        if (!resolvedRole) {
            await prisma.auditLog.create({
                data: { userId: user.id, action: "LOGIN_FAILED", ipAddress: ip, details: { reason: "Wrong password" } },
            }).catch(() => {});
            return fail("Invalid employee code or password", 401);
        }

        // Audit successful login
        await prisma.auditLog.create({
            data: {
                userId: user.id,
                action: "LOGIN",
                ipAddress: ip,
                details: { userAgent: request.headers.get("user-agent") || "unknown", role: resolvedRole },
            },
        }).catch(() => {});

        // Success — clear rate-limit counters for this IP + empCode.
        clearRateLimit(ipKey);
        clearRateLimit(userKey);

        // Branch resolution: prefer User.branchId, fall back to department.branchId
        const branchId = user.branchId || user.department?.branchId || "";
        const branchType = user.department?.branch?.branchType || "";
        const branchName = user.department?.branch?.name || "";

        // departmentIds for downstream routes — keep empty for pure evaluators (BM/CM/HR/COMMITTEE)
        const departmentIds = user.departmentId ? [user.departmentId] : [];
        // For HOD, include all departments the HOD is assigned to this quarter
        if (resolvedRole === "HOD") {
            const hodAssignments = await prisma.hodAssignment.findMany({
                where: { hodUserId: user.id, quarter: { status: "ACTIVE" } },
                select: { departmentId: true },
            });
            for (const a of hodAssignments) {
                if (!departmentIds.includes(a.departmentId)) departmentIds.push(a.departmentId);
            }
        }

        const { password: _p, passwordHod: _ph, department: _dept, ...safeUser } = user;

        const tokenPayload = {
            userId: user.id,
            empCode: user.empCode,
            role: resolvedRole,
            departmentIds,
            branchId,
            branchType,
        };
        const token = await signToken(tokenPayload);
        const refreshToken = await signRefreshToken(tokenPayload);

        const response = ok({
            token,
            user: {
                ...safeUser,
                role: resolvedRole,
                branchId,
                branchType,
                branchName,
            },
        });

        response.cookies.set("token", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 8 * 60 * 60,
            path: "/",
        });

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
