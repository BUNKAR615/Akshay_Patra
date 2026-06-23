"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { NAV, resolveActive, ancestorIds, DASHBOARD_HOME } from "../../lib/dashboardNav";
import { filterAdminNav, hasPermission } from "../../lib/permissions";
import { api } from "../../lib/clientApi";
import { Ic } from "../ui/Icons";
import { AP, ROLE_LABEL } from "../ui/tokens";
import { Avatar } from "../ui";

const SECTIONS_KEY = "ap.sidebar.sections";
const NODES_KEY = "ap.sidebar.nodes";

// Per-branch sub-pages injected under each branch node (mirrors the order in
// components/admin/BranchSideNav.jsx). Each carries the granular permission key
// so an operator never sees a link they can't open.
const BRANCH_SUBPAGES = [
    { suffix: "/employees", label: "Employees", perm: "branches.employees" },
    { suffix: "/departments", label: "Departments", perm: "branches.departments" },
    { suffix: "/org", label: "Organizational Structure", perm: "branches.org" },
    { suffix: "/questions", label: "Questions", perm: "branches.questions" },
    { suffix: "/audit", label: "Audit Logs", perm: "branches.audit" },
];

/** Build the per-branch nodes that replace the `{ dynamic: "branches" }` slot. */
function buildBranchNodes(branches, ctx) {
    return (branches || []).map((b) => {
        const slug = b.slug || b.id;
        const base = `/dashboard/admin/${slug}`;
        const children = BRANCH_SUBPAGES
            .filter((p) => hasPermission(ctx, p.perm) || ctx.role === "ADMIN" || ctx.isAdmin)
            .map((p) => ({ id: `branch-${slug}${p.suffix}`, label: p.label, href: base + p.suffix }));
        return { id: `branch-${slug}`, label: b.name, href: base, children };
    });
}

// True when a child node is visible to ctx: ADMIN/full-admin see all; otherwise
// an explicit adminOnly hides it, an explicit perm is checked, and a child with
// neither inherits its (already-gated) parent's visibility.
function canSeeChild(node, ctx) {
    if (ctx?.role === "ADMIN" || ctx?.isAdmin) return true;
    if (node.adminOnly) return false;
    if (node.perm) return hasPermission(ctx, node.perm);
    return true;
}

// Recursively filter a children array for ctx and inject branch nodes at the
// `{ dynamic: "branches" }` placeholder.
function resolveChildren(children, ctx, branchNodes) {
    const out = [];
    for (const c of children || []) {
        if (c.dynamic === "branches") { out.push(...branchNodes); continue; }
        if (!canSeeChild(c, ctx)) continue;
        out.push(c.children ? { ...c, children: resolveChildren(c.children, ctx, branchNodes) } : c);
    }
    return out;
}

// Take the permission-filtered top-level groups and expand every item's
// `children` (gating + branch injection) into the effective tree the sidebar
// renders and resolves active state against.
function buildEffectiveGroups(groups, ctx, branchNodes) {
    return groups.map((g) => ({
        ...g,
        items: g.items.map((it) => (it.children ? { ...it, children: resolveChildren(it.children, ctx, branchNodes) } : it)),
    }));
}

/**
 * Responsive sidebar.
 *
 * Desktop (>= 768px):
 *   - Always visible, sticky to the left edge.
 *   - Width toggles between 234px (expanded) and 64px (icon-only) via the
 *     `collapsed` prop. Persisted by DashboardShell through localStorage.
 *
 * Mobile (< 768px):
 *   - Hidden off-canvas by default. Slides in from the left as a drawer when
 *     `drawerOpen` is true, with a translucent backdrop that closes it on tap.
 *   - Always renders at the expanded width (234px) — the icon-only mode makes
 *     no sense on a phone.
 *   - Body scroll lock + Esc close are handled by DashboardShell.
 */
export default function Sidebar({
    user,
    role,
    collapsed,
    isMobile = false,
    drawerOpen = false,
    onDrawerClose = () => {},
}) {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const view = searchParams.get("view");
    const section = searchParams.get("section");
    // Nav set is chosen by AREA, not just role. Inside /dashboard/admin we always
    // render the ADMIN nav filtered by the user's effective permissions — ADMIN
    // sees everything; a granted non-admin ("Operator", role !== ADMIN) sees only
    // the items they hold. Everywhere else it's strict per-role nav. If role is
    // unknown (loading / unrecognized) render empty groups — never silently fall
    // back to the ADMIN tabset.
    const inAdminArea = pathname.startsWith("/dashboard/admin");
    const ctx = { role, isAdmin: user?.isAdmin, permissions: user?.permissions };

    // Branches power the Branches submenu (one node per branch). Fetched once
    // when we enter the admin area; harmless elsewhere (we never use it).
    const [branches, setBranches] = useState([]);
    useEffect(() => {
        if (!inAdminArea) return;
        let alive = true;
        api("/api/admin/branches")
            .then((d) => { if (alive) setBranches(d.branches || []); })
            .catch(() => { /* sidebar still renders without the branch list */ });
        return () => { alive = false; };
    }, [inAdminArea]);

    const branchNodes = inAdminArea ? buildBranchNodes(branches, ctx) : [];
    const groups = inAdminArea
        ? buildEffectiveGroups(filterAdminNav(NAV.ADMIN, ctx), ctx, branchNodes)
        : (NAV[role] || []);

    // Most-specific active node id, resolved against the EFFECTIVE tree so a
    // per-branch leaf (injected at render) and section-deep-links both match.
    const activeId = inAdminArea
        ? resolveActive(role, pathname, view, section, groups)
        : resolveActive(role, pathname, view, section);
    const activeAncestors = ancestorIds(groups, activeId);

    // Collapsible labeled sections, persisted separately from the icon-collapse
    // state (`ap.sidebar.collapsed` is owned by DashboardShell and untouched).
    const [closedSections, setClosedSections] = useState({});
    // Per-node expand/collapse state for nested submenus (Branches, Pipeline…).
    const [openNodes, setOpenNodes] = useState({});
    useEffect(() => {
        try {
            const saved = JSON.parse(localStorage.getItem(SECTIONS_KEY) || "{}");
            if (saved && typeof saved === "object") setClosedSections(saved);
            const savedNodes = JSON.parse(localStorage.getItem(NODES_KEY) || "{}");
            if (savedNodes && typeof savedNodes === "object") setOpenNodes(savedNodes);
        } catch { /* corrupt storage — ignore */ }
    }, []);
    const toggleSection = (name) => {
        setClosedSections((prev) => {
            const next = { ...prev, [name]: !prev[name] };
            try { localStorage.setItem(SECTIONS_KEY, JSON.stringify(next)); } catch { /* quota — ignore */ }
            return next;
        });
    };
    const toggleNode = (id) => {
        setOpenNodes((prev) => {
            const next = { ...prev, [id]: !prev[id] };
            try { localStorage.setItem(NODES_KEY, JSON.stringify(next)); } catch { /* quota — ignore */ }
            return next;
        });
    };
    // Never leave the active item hidden inside a closed section. Match against
    // the active leaf OR any of its ancestors (the section holds the top-level
    // parent, e.g. "Branches", while the leaf is a per-branch sub-page).
    useEffect(() => {
        if (!activeId) return;
        const inGroup = (g) => g.section && g.items.some((i) => i.id === activeId || activeAncestors.has(i.id));
        const grp = groups.find(inGroup);
        if (grp && closedSections[grp.section]) {
            setClosedSections((prev) => ({ ...prev, [grp.section]: false }));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeId, role]);

    // On mobile we always render in expanded mode; the desktop collapsed flag
    // is ignored so users still get readable labels on a small screen.
    const isCollapsed = isMobile ? false : collapsed;
    const w = isCollapsed ? 64 : 234;

    const handleLogout = async (e) => {
        e.preventDefault();
        await fetch("/api/auth/logout", { method: "POST" });
        // Clear the legacy localStorage.userRole hint so a different user
        // signing in on this device doesn't inherit the previous user's role.
        try { localStorage.removeItem("userRole"); } catch {}
        window.location.replace("/login");
    };

    // Mobile: off-canvas drawer with backdrop. Desktop: sticky in flow.
    const containerClass = isMobile
        ? `fixed inset-y-0 left-0 z-50 flex flex-col h-[100dvh] transition-transform duration-200 will-change-transform overflow-hidden ${
            drawerOpen ? "translate-x-0" : "-translate-x-full"
        }`
        : "flex flex-col h-screen sticky top-0 transition-[width] duration-200 overflow-hidden shrink-0 z-40";

    return (
        <>
            {/* Mobile-only backdrop. Pointer-events disabled while closed so it
                never intercepts taps on the page underneath. */}
            {isMobile && (
                <div
                    onClick={onDrawerClose}
                    aria-hidden="true"
                    className={`fixed inset-0 bg-black/50 backdrop-blur-[1px] z-40 transition-opacity duration-200 ${
                        drawerOpen ? "opacity-100" : "opacity-0 pointer-events-none"
                    }`}
                />
            )}

            <aside
                style={{
                    width: w,
                    minWidth: w,
                    background: AP.dark,
                    paddingTop: isMobile ? "var(--safe-top, 0px)" : 0,
                    paddingBottom: isMobile ? "var(--safe-bottom, 0px)" : 0,
                }}
                className={containerClass}
                aria-hidden={isMobile && !drawerOpen}
            >
                <div
                    className="h-14 flex items-center border-b border-white/10 gap-3 shrink-0"
                    style={{ padding: isCollapsed ? "0 17px" : "0 18px" }}
                >
                    <Link
                        href={DASHBOARD_HOME[role] || "/login"}
                        onClick={isMobile ? onDrawerClose : undefined}
                        className="flex items-center gap-3 no-underline flex-1 min-w-0"
                    >
                        <div
                            style={{ background: AP.orange }}
                            className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
                        >
                            <svg width="13" height="13" fill="none" viewBox="0 0 24 24">
                                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </div>
                        {!isCollapsed && (
                            <span className="text-[13.5px] font-extrabold text-white tracking-tight whitespace-nowrap">
                                Akshaya Patra
                            </span>
                        )}
                    </Link>
                    {/* Mobile-only close button — gives users a clear affordance
                        to dismiss the drawer beyond just tapping the backdrop. */}
                    {isMobile && (
                        <button
                            onClick={onDrawerClose}
                            aria-label="Close menu"
                            className="w-9 h-9 -mr-1 flex items-center justify-center bg-transparent border-none cursor-pointer text-white/60 hover:text-white shrink-0"
                        >
                            <svg width="20" height="20" fill="none" viewBox="0 0 24 24">
                                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                            </svg>
                        </button>
                    )}
                </div>

                <nav className="flex-1 overflow-y-auto py-2.5" style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}>
                    {groups.map((grp, gi) => {
                        const sectionClosed = grp.section && !isCollapsed && closedSections[grp.section];
                        return (
                            <div key={gi} className="mb-0.5">
                                {grp.section && !isCollapsed && (
                                    <button
                                        type="button"
                                        onClick={() => toggleSection(grp.section)}
                                        aria-expanded={!sectionClosed}
                                        className="w-full flex items-center justify-between bg-transparent border-none cursor-pointer text-[9.5px] font-bold text-white/30 hover:text-white/60 uppercase tracking-[0.12em] px-[18px] pt-2.5 pb-1 transition-colors"
                                    >
                                        {grp.section}
                                        <svg
                                            width="10" height="10" fill="none" viewBox="0 0 24 24"
                                            aria-hidden="true"
                                            className={`transition-transform duration-150 ${sectionClosed ? "-rotate-90" : ""}`}
                                        >
                                            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                                        </svg>
                                    </button>
                                )}
                                {grp.section && isCollapsed && <div className="h-px bg-white/5 mx-2.5 my-2" />}
                                {!sectionClosed && grp.items.map((item) => (
                                    <SidebarNode
                                        key={item.id}
                                        node={item}
                                        depth={0}
                                        collapsed={isCollapsed}
                                        activeId={activeId}
                                        activeAncestors={activeAncestors}
                                        openNodes={openNodes}
                                        toggleNode={toggleNode}
                                        onNavigate={isMobile ? onDrawerClose : undefined}
                                    />
                                ))}
                            </div>
                        );
                    })}
                </nav>

                <div
                    className="border-t border-white/10 shrink-0"
                    style={{ padding: isCollapsed ? "12px 0" : "12px 14px" }}
                >
                    {(() => {
                        // Trim trailing whitespace from DB-stored names so the
                        // sidebar never shows a bogus "U" avatar initial or a
                        // dangling space. Fall back to empty during the brief
                        // /api/auth/me load — better than a stale "User"
                        // placeholder + an empty role line under it.
                        const displayName = user?.name?.trim() || "";
                        // In the admin area an operator (granted non-admin) is shown by
                        // their admin-given page-role name (e.g. "HR Admin") rather than
                        // their base role — that's the hat they're wearing here.
                        const displayRole = (inAdminArea && user?.operatorTitle)
                            ? user.operatorTitle
                            : role
                                ? (ROLE_LABEL[role] || role.replace(/_/g, " "))
                                : "";
                        return isCollapsed ? (
                            <div className="flex justify-center">
                                <Avatar name={displayName || "?"} size={30} color={AP.blue} />
                            </div>
                        ) : (
                            <div className="flex items-center gap-2.5">
                                <Avatar name={displayName || "?"} size={30} color={AP.blue} />
                                <div className="flex-1 min-w-0">
                                    <p className="m-0 text-xs font-bold text-white whitespace-nowrap overflow-hidden text-ellipsis uppercase">
                                        {displayName || " "}
                                    </p>
                                    <p className="m-0 text-[10.5px] text-white/60 font-medium">
                                        {displayRole || " "}
                                    </p>
                                </div>
                                <button
                                    onClick={handleLogout}
                                    aria-label="Logout"
                                    className="bg-transparent border-none cursor-pointer text-white/35 hover:text-white/80 flex p-2 -m-1 transition-colors"
                                >
                                    {Ic.logout}
                                </button>
                            </div>
                        );
                    })()}
                </div>
            </aside>
        </>
    );
}

/**
 * Recursive sidebar entry. Renders a navigable row (depth 0 carries the icon;
 * deeper levels indent and drop the icon for a bullet) and, when the node has
 * children, a chevron that expands its submenu. Expansion is user-toggled
 * (persisted) but forced open whenever the node is an ancestor of the active
 * leaf. In desktop icon-collapsed mode only depth-0 icons render — submenus are
 * suppressed, exactly as before nesting existed.
 */
function SidebarNode({ node, depth, collapsed, activeId, activeAncestors, openNodes, toggleNode, onNavigate }) {
    const [hover, setHover] = useState(false);
    const hasChildren = node.children && node.children.length > 0;
    const active = activeId === node.id;
    const onPath = activeAncestors.has(node.id);
    // Top-level submenus (Branches, Pipeline, Quarters…) start EXPANDED so the
    // sub-options are visible on load; deeper levels (each branch's 5 pages)
    // start collapsed to keep the list manageable. A stored toggle wins over the
    // default; an ancestor of the active page is always forced open.
    const defaultOpen = depth === 0;
    const stored = openNodes[node.id];
    const isOpen = hasChildren && (onPath || (stored === undefined ? defaultOpen : stored));
    const icon = depth === 0 ? (Ic[node.icon] || Ic.dashboard) : null;
    const padLeft = collapsed ? 0 : 18 + depth * 15;
    const labelColor = active || hover || onPath ? "#fff" : depth === 0 ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.42)";
    const rowBg = active ? "rgba(255,255,255,0.11)" : hover ? "rgba(255,255,255,0.06)" : "transparent";

    return (
        <>
            <div
                onMouseEnter={() => setHover(true)}
                onMouseLeave={() => setHover(false)}
                style={{ background: rowBg, borderLeft: `3px solid ${active ? AP.orange : "transparent"}` }}
                className="relative flex items-stretch"
            >
                <Link
                    href={node.href}
                    onClick={onNavigate}
                    title={collapsed ? node.label : undefined}
                    style={{
                        // 44px-tall touch target on mobile; tighter for nested rows.
                        paddingTop: collapsed ? 12 : depth === 0 ? 11 : 8,
                        paddingBottom: collapsed ? 12 : depth === 0 ? 11 : 8,
                        paddingLeft: collapsed ? 0 : padLeft,
                        paddingRight: hasChildren && !collapsed ? 36 : 18,
                        color: labelColor,
                        justifyContent: collapsed ? "center" : "flex-start",
                    }}
                    className="flex-1 min-w-0 flex items-center gap-[11px] border-none cursor-pointer transition-colors no-underline"
                >
                    {icon && <span className="flex shrink-0">{icon}</span>}
                    {!collapsed && depth > 0 && (
                        <span className="shrink-0 w-1 h-1 rounded-full" style={{ background: "currentColor", opacity: 0.5 }} aria-hidden="true" />
                    )}
                    {!collapsed && (
                        <span
                            style={{ fontWeight: active ? 700 : depth === 0 ? 500 : 400, fontSize: depth === 0 ? 13 : 12.5 }}
                            className="whitespace-nowrap overflow-hidden text-ellipsis"
                        >
                            {node.label}
                        </span>
                    )}
                </Link>
                {hasChildren && !collapsed && (
                    <button
                        type="button"
                        onClick={() => toggleNode(node.id)}
                        aria-label={isOpen ? `Collapse ${node.label}` : `Expand ${node.label}`}
                        aria-expanded={isOpen}
                        className="absolute right-0 top-0 bottom-0 px-2.5 flex items-center bg-transparent border-none cursor-pointer text-white/60 hover:text-white"
                    >
                        <svg width="13" height="13" fill="none" viewBox="0 0 24 24" aria-hidden="true" className={`transition-transform duration-150 ${isOpen ? "" : "-rotate-90"}`}>
                            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                        </svg>
                    </button>
                )}
            </div>
            {hasChildren && !collapsed && isOpen && node.children.map((child) => (
                <SidebarNode
                    key={child.id}
                    node={child}
                    depth={depth + 1}
                    collapsed={collapsed}
                    activeId={activeId}
                    activeAncestors={activeAncestors}
                    openNodes={openNodes}
                    toggleNode={toggleNode}
                    onNavigate={onNavigate}
                />
            ))}
        </>
    );
}
