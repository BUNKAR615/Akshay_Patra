export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../lib/prisma";
import { withRole } from "../../../../lib/withRole";
import { ok, handleApiError } from "../../../../lib/api-response";

/**
 * Map a granted-key list to the human module labels it touches, in
 * PERMISSION_TREE order. Pure presentation — derived from the same keys the
 * detail screen already exposes; no permission logic is changed here.
 */
function summarizeModules(keys = []) {
    const has = (pred) => keys.some(pred);
    const mods = [];
    if (has((k) => k.startsWith("employees."))) mods.push("Employees");
    if (has((k) => k.startsWith("departments."))) mods.push("Departments");
    if (has((k) => k.startsWith("branch:") || k.startsWith("branches."))) mods.push("Branches");
    if (has((k) => k.startsWith("org.assign."))) mods.push("Org Structure");
    if (has((k) => k.startsWith("pipeline."))) mods.push("Pipeline");
    if (has((k) => k.startsWith("quarter."))) mods.push("Quarters");
    if (has((k) => k.startsWith("questions."))) mods.push("Questions");
    if (has((k) => k.startsWith("audit."))) mods.push("Audit Logs");
    if (has((k) => k.startsWith("reports."))) mods.push("Reports");
    return mods;
}

/**
 * GET /api/admin/users
 *
 * Lightweight, searchable user directory for the User Management screen.
 * ADMIN-only — only an admin may view or edit others' permissions.
 *
 * Returns each user's name + primary role plus a per-user permission summary
 * (isAdmin grant + number of granted keys) so the list can flag "Operator".
 */
export const GET = withRole(["ADMIN"], async (request) => {
    try {
        const { searchParams } = new URL(request.url);
        const search = (searchParams.get("search") || "").trim();
        const operatorsOnly = searchParams.get("operators") === "1";
        const limit = Math.min(parseInt(searchParams.get("limit") || "100", 10) || 100, 500);

        const clauses = [];
        if (search) {
            clauses.push({
                OR: [
                    { name: { contains: search, mode: "insensitive" } },
                    { empCode: { contains: search, mode: "insensitive" } },
                ],
            });
        }
        if (operatorsOnly) {
            // Users who hold any special access — a UserPermission row that is
            // either an admin override or has at least one granted key.
            clauses.push({
                permission: { is: { OR: [{ isAdmin: true }, { permissions: { isEmpty: false } }] } },
            });
        }
        const where = clauses.length ? { AND: clauses } : {};

        const users = await prisma.user.findMany({
            where,
            select: {
                id: true,
                empCode: true,
                name: true,
                role: true,
                designation: true,
                permission: { select: { isAdmin: true, permissions: true, operatorTitle: true } },
            },
            orderBy: { name: "asc" },
            take: limit,
        });

        const rows = users.map((u) => {
            const grantCount = u.permission?.permissions?.length || 0;
            const isAdminGrant = !!u.permission?.isAdmin;
            // "Operator" = a non-ADMIN user who holds any grant.
            const isOperator = u.role !== "ADMIN" && (isAdminGrant || grantCount > 0);
            return {
                id: u.id,
                empCode: u.empCode,
                name: u.name,
                role: u.role,
                designation: u.designation || null,
                isAdminGrant,
                grantCount,
                isOperator,
                // Human module labels this user can reach — for the at-a-glance
                // "special access" roster. Empty for admin-grant (they get all).
                modules: isAdminGrant ? [] : summarizeModules(u.permission?.permissions || []),
                // Admin-named "page role" (e.g. "HR Admin"), shown alongside the user.
                operatorTitle: isOperator ? (u.permission?.operatorTitle || null) : null,
            };
        });

        return ok({ users: rows, total: rows.length });
    } catch (err) {
        return handleApiError(err, "ADMIN USERS LIST");
    }
});
