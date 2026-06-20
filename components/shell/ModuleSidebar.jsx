"use client";

import Link from "next/link";
import { Ic, Icon } from "../ui/Icons";
import { Avatar } from "../ui";
import { AP } from "../ui/tokens";

/**
 * Per-module internal sidebar (248px). Mirrors the existing Sidebar visual
 * language but is scoped to one module: header tile in the module tint, nav
 * groups with optional uppercase section labels, active item = module tint bg +
 * accent text/icon, footer = admin avatar + name.
 */
export default function ModuleSidebar({ module, activeNavId, user }) {
    const groups = module.nav || [];
    const displayName = user?.name?.trim() || "Admin";
    return (
        <aside
            style={{ width: 248 }}
            className="shrink-0 bg-white border-r border-ap-border flex flex-col h-full"
        >
            <div className="h-[60px] flex items-center gap-2.5 px-4 border-b border-ap-border shrink-0">
                <span
                    style={{ background: module.tint, color: module.accent }}
                    className="w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0"
                >
                    <Icon name={module.icon} size={18} sw={1.8} />
                </span>
                <div className="min-w-0">
                    <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-ap-text-faint leading-tight">Module</p>
                    <p className="text-[13.5px] font-extrabold text-ap-text truncate leading-tight">{module.name}</p>
                </div>
            </div>

            <nav className="flex-1 overflow-y-auto py-3 px-2.5" style={{ scrollbarWidth: "none" }}>
                {groups.map((g, i) => (
                    <div key={i} className="mb-1">
                        {g.section && (
                            <p className="text-[10px] font-bold uppercase tracking-wider text-ap-text-faint px-2.5 pt-3 pb-1">
                                {g.section}
                            </p>
                        )}
                        {g.items.map((item) => {
                            const active = item.id === activeNavId;
                            return (
                                <Link
                                    key={item.id}
                                    href={item.href}
                                    aria-current={active ? "page" : undefined}
                                    style={{
                                        background: active ? module.tint : "transparent",
                                        color: active ? module.accent : "#475569",
                                    }}
                                    className="flex items-center gap-2.5 rounded-[10px] px-2.5 py-2.5 text-[13px] no-underline transition-colors hover:bg-ap-bg"
                                >
                                    <span style={{ color: active ? module.accent : "#94A3B8" }} className="flex shrink-0">
                                        {Ic[item.icon] || Ic.dashboard}
                                    </span>
                                    <span style={{ fontWeight: active ? 700 : 600 }} className="flex-1 truncate">
                                        {item.label}
                                    </span>
                                    {item.badge && (
                                        <span
                                            style={{ background: module.tint, color: module.accent }}
                                            className="text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
                                        >
                                            {item.badge}
                                        </span>
                                    )}
                                </Link>
                            );
                        })}
                    </div>
                ))}
            </nav>

            <div className="border-t border-ap-border p-3 flex items-center gap-2.5 shrink-0">
                <Avatar name={displayName} size={32} color={AP.blue} />
                <div className="min-w-0">
                    <p className="text-[12px] font-bold text-ap-text truncate">{displayName}</p>
                    <p className="text-[10.5px] text-ap-text-muted">Admin</p>
                </div>
            </div>
        </aside>
    );
}
