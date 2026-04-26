"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import { NAV, resolveActive, DASHBOARD_HOME } from "../../lib/dashboardNav";
import { Ic } from "../ui/Icons";
import { AP, ROLE_LABEL } from "../ui/tokens";
import { Avatar } from "../ui";

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
    const groups = NAV[role] || NAV.ADMIN;

    // On mobile we always render in expanded mode; the desktop collapsed flag
    // is ignored so users still get readable labels on a small screen.
    const isCollapsed = isMobile ? false : collapsed;
    const w = isCollapsed ? 64 : 234;

    const handleLogout = async (e) => {
        e.preventDefault();
        await fetch("/api/auth/logout", { method: "POST" });
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
                        href={DASHBOARD_HOME[role] || "/dashboard/admin"}
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
                    {groups.map((grp, gi) => (
                        <div key={gi} className="mb-0.5">
                            {grp.section && !isCollapsed && (
                                <p className="text-[9.5px] font-bold text-white/30 uppercase tracking-[0.12em] px-[18px] pt-2.5 pb-1 m-0">
                                    {grp.section}
                                </p>
                            )}
                            {grp.section && isCollapsed && <div className="h-px bg-white/5 mx-2.5 my-2" />}
                            {grp.items.map((item) => {
                                const active = activeId === item.id;
                                return (
                                    <SidebarItem
                                        key={item.id}
                                        item={item}
                                        active={active}
                                        collapsed={isCollapsed}
                                    />
                                );
                            })}
                        </div>
                    ))}
                </nav>

                <div
                    className="border-t border-white/10 shrink-0"
                    style={{ padding: isCollapsed ? "12px 0" : "12px 14px" }}
                >
                    {isCollapsed ? (
                        <div className="flex justify-center">
                            <Avatar name={user?.name || "U"} size={30} color={AP.blue} />
                        </div>
                    ) : (
                        <div className="flex items-center gap-2.5">
                            <Avatar name={user?.name || "User"} size={30} color={AP.blue} />
                            <div className="flex-1 min-w-0">
                                <p className="m-0 text-xs font-bold text-white whitespace-nowrap overflow-hidden text-ellipsis">
                                    {user?.name || "User"}
                                </p>
                                <p className="m-0 text-[10.5px] text-white/40 font-medium">
                                    {ROLE_LABEL[role] || role?.replace(/_/g, " ")}
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
                    )}
                </div>
            </aside>
        </>
    );
}

function SidebarItem({ item, active, collapsed }) {
    const [hover, setHover] = useState(false);
    const icon = Ic[item.icon] || Ic.dashboard;
    return (
        <Link
            href={item.href}
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
