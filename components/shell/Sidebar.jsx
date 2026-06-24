"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { NAV, resolveActive, DASHBOARD_HOME } from "../../lib/dashboardNav";
import { filterAdminNav } from "../../lib/permissions";
import { Ic } from "../ui/Icons";
import { AP, ROLE_LABEL } from "../ui/tokens";
import { Avatar } from "../ui";
import BrandLogo from "../ui/BrandLogo";

const SECTIONS_KEY = "ap.sidebar.sections";

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
    const activeId = resolveActive(role, pathname, view);
    // Nav set is chosen by AREA, not just role. Inside /dashboard/admin we always
    // render the ADMIN nav filtered by the user's effective permissions — ADMIN
    // sees everything; a granted non-admin ("Operator", role !== ADMIN) sees only
    // the items they hold. Everywhere else it's strict per-role nav. If role is
    // unknown (loading / unrecognized) render empty groups — never silently fall
    // back to the ADMIN tabset.
    const inAdminArea = pathname.startsWith("/dashboard/admin");
    const groups = inAdminArea
        ? filterAdminNav(NAV.ADMIN, { role, isAdmin: user?.isAdmin, permissions: user?.permissions })
        : (NAV[role] || []);

    // Collapsible labeled sections, persisted separately from the icon-collapse
    // state (`ap.sidebar.collapsed` is owned by DashboardShell and untouched).
    const [closedSections, setClosedSections] = useState({});
    useEffect(() => {
        try {
            const saved = JSON.parse(localStorage.getItem(SECTIONS_KEY) || "{}");
            if (saved && typeof saved === "object") setClosedSections(saved);
        } catch { /* corrupt storage — ignore */ }
    }, []);
    const toggleSection = (name) => {
        setClosedSections((prev) => {
            const next = { ...prev, [name]: !prev[name] };
            try { localStorage.setItem(SECTIONS_KEY, JSON.stringify(next)); } catch { /* quota — ignore */ }
            return next;
        });
    };
    // Never leave the active item hidden inside a closed section.
    useEffect(() => {
        if (!activeId) return;
        const grp = groups.find((g) => g.section && g.items.some((i) => i.id === activeId));
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
                    style={{ padding: isCollapsed ? "0 8px" : "0 18px" }}
                >
                    <Link
                        href={DASHBOARD_HOME[role] || "/login"}
                        onClick={isMobile ? onDrawerClose : undefined}
                        className={`flex items-center no-underline flex-1 min-w-0 ${isCollapsed ? "justify-center" : ""}`}
                        aria-label="Akshaya Patra"
                    >
                        {isCollapsed ? <BrandLogo height={18} padX={4} padY={3} /> : <BrandLogo height={26} />}
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
                                {!sectionClosed && grp.items.map((item) => {
                                    const active = activeId === item.id;
                                    return (
                                        <SidebarItem
                                            key={item.id}
                                            item={item}
                                            active={active}
                                            collapsed={isCollapsed}
                                            onNavigate={isMobile ? onDrawerClose : undefined}
                                        />
                                    );
                                })}
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

function SidebarItem({ item, active, collapsed, onNavigate }) {
    const [hover, setHover] = useState(false);
    const icon = Ic[item.icon] || Ic.dashboard;
    return (
        <Link
            href={item.href}
            onClick={onNavigate}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            title={collapsed ? item.label : undefined}
            style={{
                // 44px-tall touch target on mobile (iOS HIG min); desktop keeps tighter rhythm.
                padding: collapsed ? "12px 0" : "11px 18px",
                background: active ? "rgba(255,255,255,0.11)" : hover ? "rgba(255,255,255,0.06)" : "transparent",
                borderLeft: `3px solid ${active ? AP.orange : "transparent"}`,
                color: active || hover ? "#fff" : "rgba(255,255,255,0.5)",
                justifyContent: collapsed ? "center" : "flex-start",
            }}
            className="w-full flex items-center gap-[11px] border-none cursor-pointer transition-colors no-underline"
        >
            <span className="flex shrink-0">{icon}</span>
            {!collapsed && (
                <span style={{ fontWeight: active ? 700 : 500 }} className="text-[13px] whitespace-nowrap">
                    {item.label}
                </span>
            )}
        </Link>
    );
}
