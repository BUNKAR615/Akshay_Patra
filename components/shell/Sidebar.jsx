"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { NAV, resolveActive, DASHBOARD_HOME } from "../../lib/dashboardNav";
import { Ic } from "../ui/Icons";
import { AP, ROLE_LABEL } from "../ui/tokens";
import { Avatar } from "../ui";

const LS_KEY = "ap.sidebar.collapsed";

export default function Sidebar({ user, role, collapsed, onToggle }) {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const view = searchParams.get("view");
    const activeId = resolveActive(role, pathname, view);
    const groups = NAV[role] || NAV.ADMIN;
    const w = collapsed ? 64 : 234;

    const handleLogout = async (e) => {
        e.preventDefault();
        await fetch("/api/auth/logout", { method: "POST" });
        window.location.replace("/login");
    };

    return (
        <aside
            style={{ width: w, minWidth: w, background: AP.dark }}
            className="flex flex-col h-screen sticky top-0 transition-[width] duration-200 overflow-hidden shrink-0 z-40"
        >
            <div
                className="h-14 flex items-center border-b border-white/10 gap-3 shrink-0"
                style={{ padding: collapsed ? "0 17px" : "0 18px" }}
            >
                <Link href={DASHBOARD_HOME[role] || "/dashboard/admin"} className="flex items-center gap-3 no-underline">
                    <div
                        style={{ background: AP.orange }}
                        className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
                    >
                        <svg width="13" height="13" fill="none" viewBox="0 0 24 24">
                            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </div>
                    {!collapsed && (
                        <span className="text-[13.5px] font-extrabold text-white tracking-tight whitespace-nowrap">
                            Akshaya Patra
                        </span>
                    )}
                </Link>
            </div>

            <nav className="flex-1 overflow-y-auto py-2.5" style={{ scrollbarWidth: "none" }}>
                {groups.map((grp, gi) => (
                    <div key={gi} className="mb-0.5">
                        {grp.section && !collapsed && (
                            <p className="text-[9.5px] font-bold text-white/30 uppercase tracking-[0.12em] px-[18px] pt-2.5 pb-1 m-0">
                                {grp.section}
                            </p>
                        )}
                        {grp.section && collapsed && <div className="h-px bg-white/5 mx-2.5 my-2" />}
                        {grp.items.map((item) => {
                            const active = activeId === item.id;
                            return (
                                <SidebarItem
                                    key={item.id}
                                    item={item}
                                    active={active}
                                    collapsed={collapsed}
                                />
                            );
                        })}
                    </div>
                ))}
            </nav>

            <div
                className="border-t border-white/10 shrink-0"
                style={{ padding: collapsed ? "12px 0" : "12px 14px" }}
            >
                {collapsed ? (
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
                            className="bg-transparent border-none cursor-pointer text-white/35 hover:text-white/80 flex p-1 transition-colors"
                        >
                            {Ic.logout}
                        </button>
                    </div>
                )}
            </div>
        </aside>
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
                padding: collapsed ? "10px 0" : "8px 18px",
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
