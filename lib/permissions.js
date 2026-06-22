// ════════════════════════════════════════════════════════════════════════
//  Per-user feature permissions — single source of truth.
//
//  Layered ON TOP of the existing role system (lib/withRole.js, JWT roles).
//  Today only ADMIN holds these capabilities; this catalog lets an admin grant
//  individual non-admin users a slice of them. A granted non-admin is shown as
//  an "Operator" (a display label, not a Role enum value).
//
//  Rules:
//    - ADMIN role  → implicitly bypasses every check (always allowed).
//    - isAdmin grant (UserPermission.isAdmin) → master override, grants all.
//    - otherwise   → the user's granted key set (expanded with implications).
//
//  This module is PURE JS (no Prisma / no React) so it can be imported from
//  middleware (edge), API routes (node), and client components alike.
// ════════════════════════════════════════════════════════════════════════

// ── Catalog — namespaced `module.feature` keys ──
export const PERMISSION_KEYS = [
    "employees.view",
    "employees.edit",
    "departments.view",
    "departments.edit",
    "branches.view",
    "branches.delete",
    "branches.employees",
    "branches.departments",
    "branches.org",
    "branches.questions",
    "branches.audit",
    "org.view",
    "org.edit",
    "pipeline.view",
    "pipeline.edit",
    "pipeline.export",
    "quarter.view",
    "quarter.edit",
];

const PERMISSION_KEY_SET = new Set(PERMISSION_KEYS);

export function isValidPermissionKey(key) {
    return PERMISSION_KEY_SET.has(key);
}

// ── Implications — granting `edit` implies the matching `view`. ──
export const IMPLIES = {
    "employees.edit": ["employees.view"],
    "departments.edit": ["departments.view"],
    "org.edit": ["org.view"],
    "quarter.edit": ["quarter.view"],
};

/**
 * Expand a granted-key list with everything those keys imply.
 * @param {string[]} permissions
 * @returns {Set<string>}
 */
export function expandGrants(permissions = []) {
    const out = new Set();
    for (const key of permissions) {
        out.add(key);
        for (const implied of IMPLIES[key] || []) out.add(implied);
    }
    return out;
}

/**
 * Does this user hold the given permission key (or ANY of an array of keys)?
 * @param {{ role?: string, isAdmin?: boolean, permissions?: string[] }} user
 * @param {string | string[]} keyOrKeys
 */
export function hasPermission(user, keyOrKeys) {
    if (!user) return false;
    if (user.role === "ADMIN") return true; // role bypass
    if (user.isAdmin) return true; //           master-override grant
    const expanded = expandGrants(user.permissions || []);
    const keys = Array.isArray(keyOrKeys) ? keyOrKeys : [keyOrKeys];
    return keys.some((k) => expanded.has(k)); // array arg = any-of
}

/**
 * True when a UserPermission record gives the user *any* admin-area access.
 * Used to compute the compact `op` JWT claim that middleware gates pages on.
 * @param {{ isAdmin?: boolean, permissions?: string[] } | null} record
 */
export function hasAnyAdminAccess(record) {
    if (!record) return false;
    return !!record.isAdmin || (record.permissions || []).length > 0;
}

// ════════════════════════════════════════════════════════════════════════
//  Permission tree — the structure the User Management UI renders from.
//  kind "radio"    → None / View / Edit, mutually exclusive (Edit ⇒ View).
//  kind "checkbox" → independent toggles.
// ════════════════════════════════════════════════════════════════════════
export const PERMISSION_TREE = [
    {
        id: "employees",
        label: "Employees",
        kind: "radio",
        viewKey: "employees.view",
        editKey: "employees.edit",
        hint: "View employees across all branches, or full edit access.",
    },
    {
        id: "departments",
        label: "Departments",
        kind: "radio",
        viewKey: "departments.view",
        editKey: "departments.edit",
    },
    {
        id: "branches",
        label: "Branches",
        kind: "checkbox",
        options: [
            { key: "branches.view", label: "View branch details" },
            { key: "branches.delete", label: "Delete branch" },
            { key: "branches.employees", label: "Employees" },
            { key: "branches.departments", label: "Departments" },
            { key: "branches.org", label: "Organisation Structure" },
            { key: "branches.questions", label: "Questions" },
            { key: "branches.audit", label: "Audit Logs" },
        ],
    },
    {
        id: "org",
        label: "Organisation Structure",
        kind: "radio",
        viewKey: "org.view",
        editKey: "org.edit",
    },
    {
        id: "pipeline",
        label: "Pipeline",
        kind: "checkbox",
        options: [
            { key: "pipeline.view", label: "View" },
            { key: "pipeline.edit", label: "Edit (advance stages)" },
            { key: "pipeline.export", label: "Export" },
        ],
    },
    {
        id: "quarter",
        label: "Quarter",
        kind: "radio",
        viewKey: "quarter.view",
        editKey: "quarter.edit",
        hint: "Edit includes starting a quarter.",
    },
];

// ════════════════════════════════════════════════════════════════════════
//  Nav / tab gating
//
//  The admin area uses NAV.ADMIN (lib/dashboardNav.js). Each item carries
//  either `perm` (the key required to see it) or `adminOnly: true` (only the
//  ADMIN role, never an operator). Items with neither (e.g. dashboard) are
//  visible to anyone already in the admin area.
//
//  `view` ids match the ?view= tab ids on app/dashboard/admin/page.js.
// ════════════════════════════════════════════════════════════════════════

/** Permission key required to access a given ?view= tab id (admin page). */
export const VIEW_PERMISSION = {
    employees: "employees.view",
    org: "departments.view", //   nav "Departments" tab id is "org"
    branches: "branches.view",
    pipeline: "pipeline.view",
    quarter: "quarter.view",
};

/** ?view= tabs only the ADMIN role may open (hidden from operators). */
export const ADMIN_ONLY_VIEWS = new Set(["dashboard", "questions", "reports", "logs", "users"]);

function ctxIsAdmin(ctx) {
    return ctx?.role === "ADMIN" || !!ctx?.isAdmin;
}

/**
 * Can this user open a given admin ?view= tab?
 * @param {string} viewId
 * @param {{ role?: string, isAdmin?: boolean, permissions?: string[] }} ctx
 */
export function canAccessView(viewId, ctx) {
    if (ctxIsAdmin(ctx)) return true;
    if (ADMIN_ONLY_VIEWS.has(viewId)) return false;
    const key = VIEW_PERMISSION[viewId];
    if (!key) return false; // unknown / ungated-but-admin-only landing
    return hasPermission(ctx, key);
}

/**
 * Is a single NAV item visible to this user? Items use `adminOnly` or `perm`.
 */
export function canSeeNavItem(item, ctx) {
    if (ctxIsAdmin(ctx)) return true;
    if (item.adminOnly) return false;
    if (item.perm) return hasPermission(ctx, item.perm);
    return false; // operators only see explicitly-granted items
}

/**
 * Filter NAV.ADMIN groups down to what `ctx` may see, dropping empty groups.
 * ADMIN sees everything unchanged.
 * @param {Array<{section?: string, items: any[]}>} groups
 * @param {{ role?: string, isAdmin?: boolean, permissions?: string[] }} ctx
 */
export function filterAdminNav(groups, ctx) {
    if (ctxIsAdmin(ctx)) return groups;
    return groups
        .map((g) => ({ ...g, items: g.items.filter((i) => canSeeNavItem(i, ctx)) }))
        .filter((g) => g.items.length > 0);
}

/**
 * First ?view= tab an operator is allowed to open, scanning NAV order.
 * Returns null when the user can open nothing in the admin area.
 */
export function firstAllowedView(groups, ctx) {
    if (ctxIsAdmin(ctx)) return "dashboard";
    for (const g of groups) {
        for (const item of g.items) {
            if (!canSeeNavItem(item, ctx)) continue;
            // Resolve the ?view= id from the item href (e.g. ...?view=employees).
            const m = /[?&]view=([^&]+)/.exec(item.href || "");
            if (m) return decodeURIComponent(m[1]);
        }
    }
    return null;
}
