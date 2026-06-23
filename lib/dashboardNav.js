// Role-aware sidebar navigation config. Mirrors the design prototype's NAV.
// Each item: { id, label, icon, href }. Icon matches a key in components/ui/Icons.jsx `Ic`.
// href may include a ?view= query param — the sidebar active-highlight logic
// matches on both pathname AND `view` search param.

export const DASHBOARD_HOME = {
    ADMIN: "/dashboard/admin",
    BRANCH_MANAGER: "/dashboard/branch-manager",
    HOD: "/dashboard/hod",
    CLUSTER_MANAGER: "/dashboard/cluster-manager",
    HR: "/dashboard/hr",
    COMMITTEE: "/dashboard/committee",
    EMPLOYEE: "/dashboard/employee",
};

export const NAV = {
    // Items carry per-user-permission gating metadata consumed by
    // lib/permissions.js (filterAdminNav): `perm` = the permission key an
    // operator needs to see it; `adminOnly` = only the ADMIN role ever sees it.
    // Items with neither (e.g. dashboard) are visible to anyone already inside
    // the admin area. ADMIN sees every item regardless.
    ADMIN: [
        { items: [
            { id: "dashboard", label: "Dashboard", icon: "dashboard", href: "/dashboard/admin", adminOnly: true },
            { id: "modules", label: "Modules", icon: "exam", href: "/dashboard/modules", adminOnly: true },
        ] },
        {
            // People & places, ordered narrow → wide: an employee belongs to a
            // department, which belongs to a branch, which rolls up into the
            // org structure.
            section: "Organization",
            items: [
                { id: "employees", label: "Employees", icon: "employees", href: "/dashboard/admin?view=employees", perm: "employees.view" },
                { id: "org", label: "Departments", icon: "departments", href: "/dashboard/admin?view=org", perm: "departments.view" },
                {
                    id: "branches", label: "Branches", icon: "branches", href: "/dashboard/admin?view=branches", perm: "branches.view",
                    children: [
                        { id: "branches-add-emp", label: "Add Employees", href: "/dashboard/admin?view=employees&action=add", perm: "employees.view" },
                        { id: "branches-bulk", label: "Bulk Upload", href: "/dashboard/admin/bulk-upload-branches" },
                        { id: "branches-export", label: "Export Excel", href: "/dashboard/admin?view=pipeline&section=export", perm: "pipeline.view" },
                        { id: "branches-edit", label: "Edit Details", href: "/dashboard/admin?view=branches&section=list" },
                        // Render-time placeholder: the sidebar injects one node per
                        // branch here, each expanding to its five per-branch pages.
                        { dynamic: "branches" },
                        { id: "branches-add", label: "Add Branch", href: "/dashboard/admin?view=branches&section=add" },
                        { id: "branches-delete", label: "Delete Branch", href: "/dashboard/admin?view=branches&section=list", perm: "branches.delete" },
                    ],
                },
                {
                    id: "hrcommittee", label: "Org Structure", icon: "star", href: "/dashboard/admin/global/hr-committee", perm: "org.view",
                    children: [
                        { id: "org-bm", label: "Assign Branch Manager", href: "/dashboard/admin/global/hr-committee?focus=BM" },
                        { id: "org-cm", label: "Cluster Manager", href: "/dashboard/admin/global/hr-committee?focus=CM" },
                        { id: "org-hr", label: "HR Personnel", href: "/dashboard/admin/global/hr-committee?focus=HR" },
                        { id: "org-committee", label: "Committee", href: "/dashboard/admin/global/hr-committee?focus=COMMITTEE" },
                    ],
                },
            ],
        },
        {
            section: "Evaluation",
            items: [
                {
                    id: "pipeline", label: "Pipeline", icon: "pipeline", href: "/dashboard/admin?view=pipeline", perm: "pipeline.view",
                    children: [
                        { id: "pipeline-stages", label: "All Stage Access", href: "/dashboard/admin?view=pipeline&section=stages" },
                        { id: "pipeline-winners", label: "Branch Winners", href: "/dashboard/admin?view=pipeline&section=winners" },
                        { id: "pipeline-export", label: "Download Ongoing Evaluation", href: "/dashboard/admin?view=pipeline&section=export", perm: "pipeline.export" },
                    ],
                },
                {
                    id: "quarter", label: "Quarters", icon: "quarter", href: "/dashboard/admin?view=quarter", perm: "quarter.view",
                    children: [
                        { id: "quarter-start", label: "Start Quarter", href: "/dashboard/admin?view=quarter&section=start" },
                        { id: "quarter-stages", label: "Resume / Pause Any Stage", href: "/dashboard/admin?view=quarter&section=stages" },
                        { id: "quarter-close", label: "Close The Quarter", href: "/dashboard/admin?view=quarter&section=close" },
                    ],
                },
                {
                    id: "questions", label: "Questions", icon: "questions", href: "/dashboard/admin?view=questions", adminOnly: true,
                    children: [
                        { id: "questions-add", label: "Add Questions", href: "/dashboard/admin?view=questions&section=add" },
                        { id: "questions-select", label: "Select For Quarter", href: "/dashboard/admin?view=questions&section=select" },
                        { id: "questions-edit", label: "Edit / Delete Question", href: "/dashboard/admin?view=questions&section=list" },
                    ],
                },
            ],
        },
        {
            section: "Reports",
            items: [
                {
                    id: "reports", label: "Reports", icon: "reports", href: "/dashboard/admin?view=reports", adminOnly: true,
                    children: [
                        { id: "reports-charts", label: "Charts", href: "/dashboard/admin?view=reports&section=charts" },
                        { id: "reports-answersheet", label: "Answer Sheet", href: "/dashboard/admin?view=reports&section=answersheet" },
                        { id: "reports-evaluator", label: "By Evaluator", href: "/dashboard/admin?view=reports&section=evaluator" },
                        { id: "reports-stage", label: "By Stage", href: "/dashboard/admin?view=reports&section=stage" },
                        { id: "reports-tables", label: "Detailed Tables", href: "/dashboard/admin?view=reports&section=tables" },
                    ],
                },
            ],
        },
        {
            section: "System",
            items: [
                { id: "users", label: "User Management", icon: "employees", href: "/dashboard/admin?view=users", adminOnly: true },
                { id: "audit", label: "Audit Logs", icon: "audit", href: "/dashboard/admin?view=logs", adminOnly: true },
            ],
        },
    ],
    BRANCH_MANAGER: [
        { items: [
            { id: "evaluate", label: "Evaluation", icon: "assessment", href: "/dashboard/branch-manager" },
            { id: "shortlist", label: "Shortlist", icon: "trophy", href: "/dashboard/branch-manager?view=shortlist" },
            { id: "departments", label: "Departments", icon: "departments", href: "/dashboard/branch-manager?view=departments" },
            { id: "history", label: "History", icon: "audit", href: "/dashboard/branch-manager?view=history" },
        ] },
    ],
    HOD: [
        { items: [{ id: "dashboard", label: "Dashboard", icon: "dashboard", href: "/dashboard/hod" }] },
        {
            section: "Evaluation",
            items: [{ id: "evaluate", label: "Stage 2 Eval", icon: "assessment", href: "/dashboard/hod?view=evaluate" }],
        },
    ],
    CLUSTER_MANAGER: [
        { items: [{ id: "dashboard", label: "Dashboard", icon: "dashboard", href: "/dashboard/cluster-manager" }] },
        {
            section: "Evaluation",
            items: [{ id: "evaluate", label: "Stage 3 Eval", icon: "assessment", href: "/dashboard/cluster-manager?view=evaluate" }],
        },
    ],
    HR: [
        { items: [{ id: "dashboard", label: "Dashboard", icon: "dashboard", href: "/dashboard/hr" }] },
        {
            section: "Stage 4",
            items: [
                { id: "evaluate", label: "HR Evaluation", icon: "assessment", href: "/dashboard/hr?view=evaluate" },
            ],
        },
    ],
    COMMITTEE: [
        { items: [{ id: "dashboard", label: "Dashboard", icon: "dashboard", href: "/dashboard/committee" }] },
        {
            section: "Final Round",
            items: [{ id: "finalselect", label: "Final Selection", icon: "trophy", href: "/dashboard/committee?view=finalselect" }],
        },
    ],
    EMPLOYEE: [
        { items: [
            { id: "dashboard", label: "My Dashboard", icon: "dashboard", href: "/dashboard/employee" },
            { id: "assessment", label: "Self Assessment", icon: "assessment", href: "/dashboard/employee?view=assessment" },
        ] },
    ],
};

// Parse an href like "/dashboard/admin?view=pipeline&section=export" into
// { path, view, section }. `section` (and `action`/`focus`) deep-link a
// submenu item to a block inside a view.
export function parseHref(href) {
    const q = href.indexOf("?");
    if (q === -1) return { path: href, view: null, section: null };
    const path = href.slice(0, q);
    const qs = new URLSearchParams(href.slice(q + 1));
    return { path, view: qs.get("view"), section: qs.get("section") };
}

// Flatten a NAV tree (groups → items → nested children) into a single list of
// linkable nodes, preserving order. The `{ dynamic: ... }` placeholder and any
// childless container without an href are skipped — only navigable nodes matter
// for active-state resolution.
export function flattenNav(groups) {
    const out = [];
    const walk = (nodes) => {
        for (const n of nodes || []) {
            if (n.dynamic) continue;
            if (n.href) out.push(n);
            if (n.children) walk(n.children);
        }
    };
    for (const g of groups || []) walk(g.items);
    return out;
}

// Pick the active nav item id based on current pathname + view + section query
// params. Returns the MOST specific node id (a child wins over its parent), so
// the sidebar can highlight the leaf and expand its ancestors.
export function resolveActive(role, pathname, view, section = null, groupsOverride = null) {
    const groups = groupsOverride || NAV[role];
    if (!groups) return null;
    const all = flattenNav(groups);
    // Canonical owner wins: the same `?view=X&section=Y` can be linked from more
    // than one place (e.g. Branches "Export Excel" reuses Pipeline's export), so
    // when both params are present prefer the node literally named `X-Y`.
    if (view && section) {
        const canonical = all.find((i) => i.id === `${view}-${section}` && parseHref(i.href).path === pathname);
        if (canonical) return canonical.id;
    }
    // Exact match first (pathname + view + section)
    let hit = all.find((i) => {
        const p = parseHref(i.href);
        return p.path === pathname && p.view === view && (p.section || null) === (section || null);
    });
    if (hit) return hit.id;
    // pathname + view, ignoring section (lands on the parent view item)
    hit = all.find((i) => {
        const p = parseHref(i.href);
        return p.path === pathname && p.view === view && !p.section;
    });
    if (hit) return hit.id;
    // Pathname match when href carries no view
    hit = all.find((i) => {
        const p = parseHref(i.href);
        return p.path === pathname && !p.view;
    });
    if (hit) return hit.id;
    // Pathname prefix match (for nested routes like /dashboard/admin/<branch>/...)
    hit = all.find((i) => {
        const p = parseHref(i.href);
        return pathname.startsWith(p.path) && p.path !== DASHBOARD_HOME[role];
    });
    return hit?.id || null;
}

// Build the chain of ancestor ids leading to `activeId` so the sidebar can keep
// every collapsible parent of the active leaf open. Returns a Set of ids.
export function ancestorIds(groups, activeId) {
    const chain = new Set();
    if (!activeId) return chain;
    const walk = (nodes, trail) => {
        for (const n of nodes || []) {
            if (n.dynamic) continue;
            const nextTrail = [...trail, n.id];
            if (n.id === activeId) { trail.forEach((id) => chain.add(id)); return true; }
            if (n.children && walk(n.children, nextTrail)) return true;
        }
        return false;
    };
    for (const g of groups || []) walk(g.items, []);
    return chain;
}
