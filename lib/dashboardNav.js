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
    ADMIN: [
        { items: [{ id: "dashboard", label: "Dashboard", icon: "dashboard", href: "/dashboard/admin" }] },
        {
            section: "Records",
            items: [
                { id: "employees", label: "Employees", icon: "employees", href: "/dashboard/admin?view=employees" },
                { id: "branches", label: "Branches", icon: "branches", href: "/dashboard/admin?view=branches" },
                { id: "org", label: "Departments", icon: "departments", href: "/dashboard/admin?view=org" },
            ],
        },
        {
            section: "Evaluation",
            items: [
                { id: "pipeline", label: "Pipeline", icon: "pipeline", href: "/dashboard/admin?view=pipeline" },
                { id: "quarter", label: "Quarter", icon: "quarter", href: "/dashboard/admin?view=quarter" },
                { id: "questions", label: "Questions", icon: "questions", href: "/dashboard/admin?view=questions" },
                { id: "hodassign", label: "HOD Assignments", icon: "hod", href: "/dashboard/admin?view=hodassign" },
            ],
        },
        {
            section: "Admin",
            items: [
                { id: "hrcommittee", label: "HR & Committee", icon: "star", href: "/dashboard/admin/global/hr-committee" },
                { id: "audit", label: "Audit Logs", icon: "audit", href: "/dashboard/admin?view=logs" },
            ],
        },
    ],
    BRANCH_MANAGER: [
        { items: [{ id: "dashboard", label: "Dashboard", icon: "dashboard", href: "/dashboard/branch-manager" }] },
        {
            section: "Evaluation",
            items: [
                { id: "evaluate", label: "Stage 2 Eval", icon: "assessment", href: "/dashboard/branch-manager?view=evaluate" },
            ],
        },
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
                { id: "management", label: "Employees", icon: "employees", href: "/dashboard/hr?view=management" },
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

// Parse an href like "/dashboard/admin?view=employees" into { path, view }
export function parseHref(href) {
    const q = href.indexOf("?");
    if (q === -1) return { path: href, view: null };
    const path = href.slice(0, q);
    const qs = new URLSearchParams(href.slice(q + 1));
    return { path, view: qs.get("view") };
}

// Pick the active nav item id based on current pathname + view query param.
export function resolveActive(role, pathname, view) {
    const groups = NAV[role] || NAV.ADMIN;
    const all = groups.flatMap((g) => g.items);
    // Exact match first (pathname + view)
    let hit = all.find((i) => {
        const p = parseHref(i.href);
        return p.path === pathname && p.view === view;
    });
    if (hit) return hit.id;
    // Pathname match when href carries no view
    hit = all.find((i) => {
        const p = parseHref(i.href);
        return p.path === pathname && !p.view;
    });
    if (hit) return hit.id;
    // Pathname prefix match (for nested routes like /dashboard/admin/global/...)
    hit = all.find((i) => {
        const p = parseHref(i.href);
        return pathname.startsWith(p.path) && p.path !== DASHBOARD_HOME[role];
    });
    return hit?.id || null;
}
