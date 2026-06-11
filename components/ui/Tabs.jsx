"use client";

import { useRef } from "react";

/**
 * Accessible in-page tab strip. Purely presentational — tab state stays in
 * the page (often synced to a `?view=` URL param).
 *
 * tabs: [{ id, label, count?, icon? }]
 */
export function Tabs({ tabs = [], active, onChange, ariaLabel = "Views" }) {
    const refs = useRef({});

    const onKeyDown = (e) => {
        const idx = tabs.findIndex((t) => t.id === active);
        let next = null;
        if (e.key === "ArrowRight") next = tabs[(idx + 1) % tabs.length];
        else if (e.key === "ArrowLeft") next = tabs[(idx - 1 + tabs.length) % tabs.length];
        else if (e.key === "Home") next = tabs[0];
        else if (e.key === "End") next = tabs[tabs.length - 1];
        if (next) {
            e.preventDefault();
            onChange?.(next.id);
            refs.current[next.id]?.focus();
        }
    };

    return (
        <div
            role="tablist"
            aria-label={ariaLabel}
            onKeyDown={onKeyDown}
            className="flex items-center gap-1 border-b border-ap-border mb-5 overflow-x-auto"
        >
            {tabs.map((t) => {
                const selected = t.id === active;
                return (
                    <button
                        key={t.id}
                        ref={(el) => (refs.current[t.id] = el)}
                        role="tab"
                        type="button"
                        aria-selected={selected}
                        tabIndex={selected ? 0 : -1}
                        onClick={() => onChange?.(t.id)}
                        className={`relative inline-flex items-center gap-1.5 px-3.5 py-2.5 text-[13px] font-bold whitespace-nowrap bg-transparent border-none cursor-pointer transition-colors -mb-px border-b-2 ${
                            selected
                                ? "text-ap-blue border-b-ap-blue"
                                : "text-gray-500 hover:text-gray-700 border-b-transparent"
                        }`}
                    >
                        {t.icon && <span className="flex" aria-hidden="true">{t.icon}</span>}
                        {t.label}
                        {typeof t.count === "number" && (
                            <span className={`text-[10px] font-extrabold rounded-full px-1.5 py-0.5 leading-none ${selected ? "bg-ap-blue-50 text-ap-blue" : "bg-gray-100 text-gray-500"}`}>
                                {t.count}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}
