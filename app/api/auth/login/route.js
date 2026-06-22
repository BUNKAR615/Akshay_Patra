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
import { computeOfferedRoles, resolveRoleScope } from "../../../../lib/auth/loginRoles";
import { hasAnyAdminAccess } from "../../../../lib/permissions";

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

        // Login rate limiting is intentionally disabled — logins are
        // unlimited. Many users legitimately share one office / NAT IP, and a
        // per-IP cap locked them out. `ip` is still resolved for audit logs.
        const ip = getClientIp(request);

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

        // Dual-login staff: a staff-role user (e.g. a Branch Manager / HR) who is
        // ALSO a member of a department. Their PRIMARY password (empCode) opens
        // the normal EMPLOYEE dashboard, while their SECONDARY password
        // (Firstname_##, stored in passwordHod) opens their own staff dashboard.
        // This mirrors the HOD dual-login but resolves to the user's own staff
        // role instead of HOD. It only activates when a user has BOTH a
        // departmentId AND a secondary password set, so every existing account
        // (staff carry no departmentId; HODs are role HOD) is unaffected.
        const DUAL_LOGIN_STAFF_ROLES = new Set(["BRANCH_MANAGER", "CLUSTER_MANAGER", "HR", "COMMITTEE"]);
        const isDualLoginStaff = !!user.departmentId && !!user.passwordHod && DUAL_LOGIN_STAFF_ROLES.has(user.role);

        let resolvedRole = null;
        if (user.password) {
            const ok1 = await bcrypt.compare(data.password, user.password);
            // empCode (primary) → employee dashboard for HODs and dual-login
            // staff; the user's own role otherwise.
            if (ok1) resolvedRole = (user.role === "HOD" || isDualLoginStaff) ? "EMPLOYEE" : user.role;
        }

        if (!resolvedRole && user.passwordHod) {
            const ok2 = await bcrypt.compare(data.password, user.passwordHod);
            if (ok2) {
                if (isDualLoginStaff) {
                    // Firstname_## (secondary) → this user's own staff dashboard.
                    resolvedRole = user.role;
                } else {
                    // HOD secondary password — gated on an active HOD assignment.
                    const hasHodAssignment = await prisma.hodAssignment.findFirst({
                        where: { hodUserId: user.id, quarter: { status: "ACTIVE" } },
                        select: { id: true },
                    });
                    if (hasHodAssignment) resolvedRole = "HOD";
                }
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

        // Multi-role "Continue as …" picker. A user may legitimately act as more
        // than one role — an evaluator (BM/CM/HR) who is ALSO a Committee member,
        // or the legacy Admin+HOD pairing. When more than one role is available
        // we issue a short-lived stage1 token and let them choose on the login
        // page (POST /api/auth/select-role). The same staff-format password
        // ("Firstname_##") unlocks every offered role, so one credential is enough.
        const offeredRoles = await computeOfferedRoles(user, resolvedRole);

        // Operator: a user granted a named admin "page role" (e.g. "HR Admin")
        // can additionally open the admin area. Offer it as an extra choice so
        // they pick which workspace to start in — their base role's pages stay
        // available either way. Admins already have everything, so skip them.
        const permRecord = await prisma.userPermission.findUnique({
            where: { userId: user.id },
            select: { isAdmin: true, permissions: true, operatorTitle: true },
        });
        const opAccess = hasAnyAdminAccess(permRecord);
        if (opAccess && resolvedRole !== "ADMIN" && !offeredRoles.includes("OPERATOR")) {
            offeredRoles.push("OPERATOR");
        }

        if (offeredRoles.length > 1) {
            const stage1 = await signRoleSelectToken({ userId: user.id, roles: offeredRoles });
            const response = ok({
                needsRoleSelection: true,
                roles: offeredRoles,
                operatorTitle: opAccess ? (permRecord?.operatorTitle || "Operator") : null,
                user: { id: user.id, empCode: user.empCode, name: user.name },
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

        // Branch + department scope for the JWT — role-aware and
        // assignment-table-authoritative. Shared with /api/auth/select-role so a
        // single-role login and a picked role produce identical tokens.
        const scope = await resolveRoleScope(user.id, resolvedRole, user);
        if (scope.error) return fail(scope.error, 401);
        const { branchId, branchType, branchName, departmentIds } = scope;

        const { password: _p, passwordHod: _ph, department: _dept, ...safeUser } = user;

        // Per-user feature grants → compact `op` claim that lets middleware admit
        // a granted non-admin ("Operator") into /dashboard/admin. Reuses the
        // permission record already loaded above.
        const op = opAccess;

        const tokenPayload = {
            userId: user.id,
            empCode: user.empCode,
            role: resolvedRole,
            departmentIds,
            branchId,
            branchType,
            op,
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
