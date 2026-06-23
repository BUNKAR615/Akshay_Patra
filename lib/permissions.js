// ════════════════════════════════════════════════════════════════════════
//  Per-user feature permissions — single source of truth.
//
//  Layered ON TOP of the existing role system (lib/withRole.js, JWT roles).
//  Admin grants a non-admin user a precise slice of admin capabilities; the
//  granted non-admin is shown as an "Operator" (a display label, e.g. "HR
//  Admin", not a Role enum value). Their admin page looks like the normal admin
//  page but every action they were NOT granted is hidden.
//
//  Rules:
//    - ADMIN role  → implicitly bypasses every check (always allowed).
//    - isAdmin grant (UserPermission.isAdmin) → master override, grants all.
//    - otherwise   → the user's granted key set (any-of).
//
//  Two kinds of grant keys:
//    - static action keys   e.g. "employees.add", "pipeline.winners"
//    - dynamic per-branch    "branch:<branchId>:<feature>" where feature ∈
//                            employees|departments|org|questions|audit
//
//  This module is PURE JS (no Prisma / no React) so it can be imported from
//  middleware (edge), API routes (node), and client components alike.
// ════════════════════════════════════════════════════════════════════════

// ── Per-branch grants ──────────────────────────────────────────────────
// Branches access is granted per individual branch × feature, so the key set
// is dynamic (depends on which branches exist). Keys look like
// "branch:clx123:employees". They are stored as plain strings in
// UserPermission.permissions[] alongside the static keys.
export const BRANCH_FEATURES = ["employees", "departments", "org", "questions", "audit"];
const BRANCH_FEATURE_SET = new Set(BRANCH_FEATURES);
const BRANCH_KEY_RE = /^branch:[A-Za-z0-9_-]+:(employees|departments|org|questions|audit)$/;

/** Build a per-branch grant key, e.g. branchKey("clx1", "employees"). */
export function branchKey(branchId, feature) {
    return `branch:${branchId}:${feature}`;
}

/** Parse a per-branch grant key → { branchId, feature } | null. */
export function parseBranchKey(key) {
    if (typeof key !== "string") return null;
    const parts = key.split(":");
    if (parts.length !== 3 || parts[0] !== "branch") return null;
    if (!BRANCH_FEATURE_SET.has(parts[2])) return null;
    return { branchId: parts[1], feature: parts[2] };
}

// ── Catalog — static action keys ──
export const PERMISSION_KEYS = [
    // Employees
    "employees.add",
    "employees.bulkupload",
    "employees.export",
    "employees.edit",
    // Departments (standalone Departments page)
    "departments.view",
    "departments.edit",
    // Branches — global actions (per-branch access uses dynamic branch:* keys)
    "branches.add",
    "branches.delete",
    // Organisation Structure — role assignment
    "org.assign.bm",
    "org.assign.cm",
    "org.assign.hr",
    "org.assign.committee",
    // Pipeline
    "pipeline.stages",
    "pipeline.winners",
    "pipeline.export",
    // Quarters
    "quarter.start",
    "quarter.pause",
    "quarter.close",
    // Questions
    "questions.add",
    "questions.select",
    "questions.editdelete",
    // Audit logs
    "audit.view",
    // Reports (per section)
    "reports.charts",
    "reports.answersheet",
    "reports.evaluator",
    "reports.stage",
    "reports.tables",
];

const PERMISSION_KEY_SET = new Set(PERMISSION_KEYS);

/** A key is valid if it's a known static key OR a well-formed per-branch key. */
export function isValidPermissionKey(key) {
    return PERMISSION_KEY_SET.has(key) || BRANCH_KEY_RE.test(key);
}

// No implications in the granular model — page visibility is derived from
// holding ANY key in a module's namespace (see viewVisibility), so we never
// need to synthesize a separate ".view" key. Kept (empty) for API compat.
export const IMPLIES = {};

/**
 * Expand a granted-key list. With no implications this just de-dupes into a Set,
 * but the shape is kept so /api/auth/me and callers don't need to change.
 * @param {string[]} permissions
 * @returns {Set<string>}
 */
export function expandGrants(permissions = []) {
    return new Set(permissions);
}

// Convenience "any-of" groups for routes that gate a whole module.
export const QUESTIONS_ANY = ["questions.add", "questions.select", "questions.editdelete"];
export const REPORTS_ANY = ["reports.charts", "reports.answersheet", "reports.evaluator", "reports.stage", "reports.tables"];

// ── Legacy aliases ──────────────────────────────────────────────────────
// Many existing API routes still call withPermission("employees.view"),
// withPermission("branches.employees"), etc. Those coarse keys were replaced by
// the granular catalog above, but rather than touch ~25 route files we make the
// NEW grants satisfy the OLD guards: each legacy key maps to a predicate over
// the user's held keys. (NOTE: the per-branch aliases are intentionally coarse —
// holding any `branch:*:<feature>` satisfies the global guard; precise
// per-branch API lockdown is enforced client-side today and can be tightened in
// the route handlers later.)
const LEGACY_ALIAS = {
    "employees.view": (h) => some(h, (k) => k.startsWith("employees.")),
    "branches.view": (h) => some(h, (k) => k.startsWith("branch:") || k.startsWith("branches.")),
    "branches.employees": (h) => some(h, (k) => /^branch:[^:]+:employees$/.test(k)),
    "branches.departments": (h) => some(h, (k) => /^branch:[^:]+:departments$/.test(k)),
    "branches.org": (h) => some(h, (k) => /^branch:[^:]+:org$/.test(k) || k.startsWith("org.assign.")),
    "branches.questions": (h) => some(h, (k) => /^branch:[^:]+:questions$/.test(k)),
    "branches.audit": (h) => some(h, (k) => /^branch:[^:]+:audit$/.test(k)),
    "org.view": (h) => some(h, (k) => k.startsWith("org.assign.")),
    "org.edit": (h) => some(h, (k) => k.startsWith("org.assign.")),
    "pipeline.view": (h) => some(h, (k) => k.startsWith("pipeline.")),
    "pipeline.edit": (h) => h.has("pipeline.stages"),
    "pipeline.export": (h) => h.has("pipeline.export"),
    "quarter.view": (h) => some(h, (k) => k.startsWith("quarter.")),
    "quarter.edit": (h) => h.has("quarter.start") || h.has("quarter.close") || h.has("quarter.pause"),
};

function some(set, fn) {
    for (const v of set) if (fn(v)) return true;
    return false;
}

/**
 * Does this user hold the given permission key (or ANY of an array of keys)?
 * A key is satisfied by a direct grant or, for legacy route guards, by the
 * matching new-catalog grant via LEGACY_ALIAS.
 * @param {{ role?: string, isAdmin?: boolean, permissions?: string[] }} user
 * @param {string | string[]} keyOrKeys
 */
export function hasPermission(user, keyOrKeys) {
    if (!user) return false;
    if (user.role === "ADMIN") return true; // role bypass
    if (user.isAdmin) return true; //           master-override grant
    const held = new Set(user.permissions || []);
    const keys = Array.isArray(keyOrKeys) ? keyOrKeys : [keyOrKeys];
    return keys.some((k) => held.has(k) || (LEGACY_ALIAS[k] ? LEGACY_ALIAS[k](held) : false));
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
//  kind "radio"        → None / View / Edit, mutually exclusive (Edit ⇒ View).
//  kind "checkbox"     → independent toggles (options[]).
//  kind "branchMatrix" → one row per branch × `features`, plus `globalOptions`
//                        toggles. Branches are fetched live by the UI.
// ════════════════════════════════════════════════════════════════════════
export const PERMISSION_TREE = [
    {
        id: "employees",
        label: "Employees",
        kind: "checkbox",
        hint: "Grant any combination of employee actions. Any grant lets them open the Employees page.",
        options: [
            { key: "employees.add", label: "Add employees" },
            { key: "employees.bulkupload", label: "Bulk upload" },
            { key: "employees.export", label: "Export excel" },
            { key: "employees.edit", label: "Edit details" },
        ],
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
        kind: "branchMatrix",
        hint: "Grant access to specific branches and which features within each.",
        features: [
            { feature: "employees", label: "Employees" },
            { feature: "departments", label: "Departments" },
            { feature: "org", label: "Organizational Structure" },
            { feature: "questions", label: "Questions" },
            { feature: "audit", label: "Audit Logs" },
        ],
        globalOptions: [
            { key: "branches.add", label: "Add branch" },
            { key: "branches.delete", label: "Delete branch" },
        ],
    },
    {
        id: "org",
        label: "Organisation Structure",
        kind: "checkbox",
        hint: "Assign branch-level roles.",
        options: [
            { key: "org.assign.bm", label: "Assign branch manager" },
            { key: "org.assign.cm", label: "Assign cluster manager" },
            { key: "org.assign.hr", label: "Assign HR personnel" },
            { key: "org.assign.committee", label: "Assign committee" },
        ],
    },
    {
        id: "pipeline",
        label: "Pipeline",
        kind: "checkbox",
        options: [
            { key: "pipeline.stages", label: "All stage access" },
            { key: "pipeline.winners", label: "Branch winners" },
            { key: "pipeline.export", label: "Download ongoing evaluation" },
        ],
    },
    {
        id: "quarter",
        label: "Quarters",
        kind: "checkbox",
        options: [
            { key: "quarter.start", label: "Start quarter" },
            { key: "quarter.pause", label: "Resume / pause any stage" },
            { key: "quarter.close", label: "Close the quarter" },
        ],
    },
    {
        id: "questions",
        label: "Questions",
        kind: "checkbox",
        options: [
            { key: "questions.add", label: "Add questions (any stage)" },
            { key: "questions.select", label: "Select questions for the quarter" },
            { key: "questions.editdelete", label: "Edit / delete questions" },
        ],
    },
    {
        id: "audit",
        label: "Audit Logs",
        kind: "checkbox",
        hint: "See who signed in, when, what they did, and from which IP.",
        options: [
            { key: "audit.view", label: "View audit logs" },
        ],
    },
    {
        id: "reports",
        label: "Reports",
        kind: "checkbox",
        options: [
            { key: "reports.charts", label: "Charts" },
            { key: "reports.answersheet", label: "Answer sheet" },
            { key: "reports.evaluator", label: "By evaluator" },
            { key: "reports.stage", label: "By stage" },
            { key: "reports.tables", label: "Detailed tables" },
        ],
    },
];

// ════════════════════════════════════════════════════════════════════════
//  Nav / tab gating
//
//  A page/tab is visible to an operator when they hold ANY key in that page's
//  namespace. `id` matches both the NAV item id (lib/dashboardNav.js) and the
//  ?view= tab id on app/dashboard/admin/page.js (they're the same except the
//  Audit Logs item, whose nav id is "audit" but ?view= is "logs").
// ════════════════════════════════════════════════════════════════════════

/** True if the user holds any granted key starting with `prefix`. */
function anyKey(ctx, prefix) {
    return (ctx?.permissions || []).some((k) => k.startsWith(prefix));
}

function ctxIsAdmin(ctx) {
    return ctx?.role === "ADMIN" || !!ctx?.isAdmin;
}

/**
 * Is the given admin page/tab visible to a (non-admin) operator?
 * dashboard / modules / users have no grantable keys → operator-invisible.
 * @param {string} id  nav item id or ?view= tab id
 */
export function viewVisibility(id, ctx) {
    switch (id) {
        case "employees": return anyKey(ctx, "employees.");
        case "org": return anyKey(ctx, "departments."); //          "Departments" tab id is "org"
        case "branches": return anyKey(ctx, "branch:") || anyKey(ctx, "branches.");
        case "hrcommittee": return anyKey(ctx, "org.assign."); //   "Org Structure" page
        case "pipeline": return anyKey(ctx, "pipeline.");
        case "quarter": return anyKey(ctx, "quarter.");
        case "questions": return anyKey(ctx, "questions.");
        case "reports": return anyKey(ctx, "reports.");
        case "logs":
        case "audit": return (ctx?.permissions || []).includes("audit.view");
        default: return false; // dashboard, modules, users — admin only
    }
}

/**
 * Can this user open a given admin ?view= tab?
 * @param {string} viewId
 * @param {{ role?: string, isAdmin?: boolean, permissions?: string[] }} ctx
 */
export function canAccessView(viewId, ctx) {
    if (ctxIsAdmin(ctx)) return true;
    return viewVisibility(viewId, ctx);
}

/**
 * Is a single NAV item visible to this user? Resolved purely from the granular
 * key namespaces (the item's legacy `perm`/`adminOnly` fields are ignored).
 */
export function canSeeNavItem(item, ctx) {
    if (ctxIsAdmin(ctx)) return true;
    return viewVisibility(item.id, ctx);
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
