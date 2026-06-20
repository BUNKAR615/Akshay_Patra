"use client";

import Link from "next/link";
import { MODULES, LAUNCHER_ROUTE } from "../../lib/modules";
import { Icon } from "../ui/Icons";
import { AP } from "../ui/tokens";

/**
 * Persistent left rail (94px) — always shows all 3 modules in fixed order plus
 * a Home button that returns to the launcher. Active module: white icon on a
 * translucent tile + a 3px accent bar on the left edge.
 *
 * Uses prefetching <Link>s so switching modules / returning to the launcher is
 * instant (routes are warmed while the rail is on screen).
 */
export default function ModuleRail({ activeId }) {
    return (
        <div
            style={{ width: 94, background: AP.dark }}
            className="shrink-0 flex flex-col items-center py-4 gap-1 h-full overflow-y-auto"
        >
            <Link
                href={LAUNCHER_ROUTE}
                prefetch
                aria-label="Back to module launcher"
                title="Modules home"
                style={{ background: AP.orange }}
                className="w-11 h-11 rounded-[13px] flex items-center justify-center text-white mb-3 shrink-0 cursor-pointer border-none transition-transform hover:scale-105"
            >
                <svg width="20" height="20" fill="none" viewBox="0 0 24 24">
                    <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1V9.5z" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            </Link>

            {MODULES.map((m) => {
                const on = m.id === activeId;
                return (
                    <Link
                        key={m.id}
                        href={m.defaultRoute}
                        prefetch
                        aria-current={on ? "page" : undefined}
                        title={m.name}
                        className="group relative w-full flex flex-col items-center gap-1 py-2 bg-transparent border-none cursor-pointer no-underline"
                    >
                        {on && (
                            <span
                                style={{ background: m.accent }}
                                className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r"
                                aria-hidden="true"
                            />
                        )}
                        <span
                            style={{
                                background: on ? "rgba(255,255,255,0.12)" : "transparent",
                                color: on ? "#fff" : "rgba(255,255,255,0.5)",
                            }}
                            className="w-[42px] h-[42px] rounded-xl flex items-center justify-center transition-colors group-hover:bg-white/10 group-hover:text-white"
                        >
                            <Icon name={m.icon} size={22} sw={1.9} />
                        </span>
                        <span
                            style={{ color: on ? "#fff" : "rgba(255,255,255,0.45)" }}
                            className="text-[9.5px] font-bold text-center leading-tight px-0.5 transition-colors group-hover:text-white/80"
                        >
                            {m.short}
                        </span>
                    </Link>
                );
            })}
        </div>
    );
}
