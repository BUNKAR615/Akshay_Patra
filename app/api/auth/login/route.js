export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 15

import bcrypt from "bcryptjs";
import prisma from "../../../../lib/prisma";
import { signToken, signRefreshToken, signBranchSelectToken, signRoleSelectToken } from "../../../../lib/auth";
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
 * Branch resolution policy (post multi-branch fix):
 *   - BM:                  one-per-user (BranchManagerAssignment.bmUserId @unique).
 *   - CM / HR / COMMITTEE: many-per-user. Login lists all branch assignments
 *                          and either auto-picks (1 row) or returns a stage1
 *                          token + branch list for the user to pick (2+ rows).
 *   - HOD / EMPLOYEE:      branch comes from user.department.branchId.
 *   - ADMIN:               no branch scope.
 *
 * IMPORTANT: User.branchId is NOT consulted for CM/HR/COMMITTEE — the
 * assignment table is the single source of truth. This prevents the
 * "last assigned branch wins" branch-leak bug for multi-branch staff.
 *
 * Dual-password HOD flow (big-branch blue-collar):
 *   - Try bcrypt(data.password, user.password) first → issue token with user.role.
 *   - If that fails AND user.passwordHod is set AND the user has an active
 *     HodAssignment, try bcrypt(data.password, user.passwordHod) → issue token
 *     with role=HOD.
 *   - Otherwise 401.
 */
export async function POST(request) {
    try {
        const { data, error } = await validateBody(request, loginSchema);
        if (error) return error;

        const empCode = sanitize(data.empCode);

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

        let resolvedRole = null;
        if (user.password) {
            const ok1 = await bcrypt.compare(data.password, user.password);
            if (ok1) resolvedRole = user.role === "HOD" ? "EMPLOYEE" : user.role;
        }

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

        await prisma.auditLog.create({
            data: {
                userId: user.id,
                action: "LOGIN",
                ipAddress: ip,
                details: { userAgent: request.headers.get("user-agent") || "unknown", role: resolvedRole },
            },
        }).catch(() => {});

        clearRateLimit(ipKey);
        clearRateLimit(userKey);

        // Admin+HOD role picker — spec: "If a person is both Admin and HOD, the
        // system must show a role selection screen after login when both roles
        // exist." Both passwords resolve to `Firstname_##` (defaultPasswordFor
        // for ADMIN === defaultHodSecondaryPasswordFor for HOD), so when the
        // primary password matched and the user is ADMIN with an active HOD
        // assignment, we surface the picker. Otherwise the resolved role is
        // used as-is.
        if (resolvedRole === "ADMIN" && user.passwordHod) {
            const hasHodAssignment = await prisma.hodAssignment.findFirst({
                where: { hodUserId: user.id, quarter: { status: "ACTIVE" } },
                select: { id: true },
            });
            if (hasHodAssignment) {
                const offered = ["ADMIN", "HOD"];
                const stage1 = await signRoleSelectToken({ userId: user.id, roles: offered });
                const response = ok({
                    needsRoleSelection: true,
                    roles: offered,
                    user: {
                        id: user.id,
                        empCode: user.empCode,
                        name: user.name,
                    },
                });
                response.cookies.set("roleSelectToken", stage1, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === "production",
                    sameSite: "lax",
                    maxAge: 5 * 60,
                    path: "/",
                });
                // Clear any stale stage1 branch-select cookie too.
                response.cookies.set("branchSelectToken", "", {
                    httpOnly: true, sameSite: "lax", path: "/", maxAge: 0,
                });
                return response;
            }
        }

        // Branch resolution — role-aware, assignment-table-authoritative for staff.
        let branchId = "";
        let branchType = user.department?.branch?.branchType || "";
        let branchName = user.department?.branch?.name || "";

        if (resolvedRole === "BRANCH_MANAGER") {
            const bm = await prisma.branchManagerAssignment.findUnique({
                where: { bmUserId: user.id },
                select: { branch: { select: { id: true, name: true, branchType: true } } },
            });
            if (bm?.branch) {
                branchId = bm.branch.id;
                branchType = bm.branch.branchType;
                branchName = bm.branch.name;
            }
        } else if (resolvedRole === "CLUSTER_MANAGER" || resolvedRole === "HR" || resolvedRole === "COMMITTEE") {
            // Multi-branch staff (CM / HR / COMMITTEE) — the spec changed:
            // the dashboard now owns branch selection via an in-page Total /
            // per-branch dropdown. We MUST NOT show the pre-dashboard branch
            // picker anymore. The JWT still carries one branchId (the first
            // assignment, deterministically ordered by `assignedAt`) so any
            // legacy code path that reads `user.branchId` keeps working; the
            // dashboard then drives the in-page filter by calling its API
            // with no `?branchId=` for Total, or `?branchId=<id>` to focus.
            const branches = await listStaffBranches(user.id, resolvedRole);
            if (branches.length === 0) {
                return fail("No branch assignment found for this account. Please contact your administrator.", 401);
            }
            branchId = branches[0].id;
            branchType = branches[0].branchType || branchType;
            branchName = branches[0].name || branchName;
        } else {
            // EMPLOYEE / HOD / ADMIN — fall back to user.department.branchId.
            branchId = user.department?.branchId || "";
        }

        // departmentIds for downstream routes — keep empty for pure evaluators (BM/CM/HR/COMMITTEE).
        const departmentIds = user.departmentId ? [user.departmentId] : [];
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

        // Clear any stale stage1 cookie from a prior login attempt.
        response.cookies.set("branchSelectToken", "", {
            httpOnly: true, sameSite: "lax", path: "/", maxAge: 0,
        });
        response.cookies.set("roleSelectToken", "", {
            httpOnly: true, sameSite: "lax", path: "/", maxAge: 0,
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

/**
 * List every branch a CM/HR/Committee user is assigned to. The assignment
 * table is the single source of truth — User.branchId is NOT consulted.
 */
async function listStaffBranches(userId, role) {
    if (role === "CLUSTER_MANAGER") {
        const rows = await prisma.clusterManagerBranchAssignment.findMany({
            where: { cmUserId: userId },
            select: { branch: { select: { id: true, name: true, branchType: true } } },
            orderBy: { assignedAt: "asc" },
        });
        return rows.map((r) => r.branch).filter(Boolean);
    }
    if (role === "HR") {
        const rows = await prisma.hrBranchAssignment.findMany({
            where: { hrUserId: userId },
            select: { branch: { select: { id: true, name: true, branchType: true } } },
            orderBy: { assignedAt: "asc" },
        });
        return rows.map((r) => r.branch).filter(Boolean);
    }
    if (role === "COMMITTEE") {
        const rows = await prisma.committeeBranchAssignment.findMany({
            where: { memberUserId: userId },
            select: { branch: { select: { id: true, name: true, branchType: true } } },
            orderBy: { assignedAt: "asc" },
        });
        return rows.map((r) => r.branch).filter(Boolean);
    }
    return [];
}
