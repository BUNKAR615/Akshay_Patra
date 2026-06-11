"use client";

import NotificationBell from "../NotificationBell";
import Breadcrumbs from "./Breadcrumbs";
import { Ic } from "../ui/Icons";
import { AP } from "../ui/tokens";

export default function TopBar({ onToggle, currentQuarter, breadcrumbs, onOpenSearch }) {
    return (
        <header
            className="h-14 bg-white border-b border-ap-border flex items-center pr-3 sm:pr-5 sticky top-0 z-30 shrink-0 gap-2 sm:gap-3"
            style={{ paddingTop: "var(--safe-top, 0px)" }}
        >
            <button
                onClick={onToggle}
                aria-label="Toggle sidebar"
                className="w-12 h-14 sm:w-14 flex items-center justify-center bg-transparent border-none cursor-pointer text-gray-500 hover:text-gray-800 active:text-gray-900 shrink-0"
            >
                {Ic.menu}
            </button>

            <Breadcrumbs items={breadcrumbs} />

            <div className="flex-1" />

            {onOpenSearch && (
                <button
                    type="button"
                    onClick={onOpenSearch}
                    aria-label="Search (Ctrl+K)"
                    className="flex items-center gap-2 bg-gray-50 hover:bg-gray-100 border border-ap-border rounded-lg px-2.5 py-1.5 cursor-pointer text-gray-400 hover:text-gray-600 transition-colors shrink-0"
                >
                    <span className="flex" aria-hidden="true">{Ic.search}</span>
                    <span className="hidden md:inline text-xs font-semibold">Search</span>
                    <kbd className="hidden md:inline-flex text-[9.5px] font-bold border border-ap-border rounded px-1 py-px bg-white">Ctrl K</kbd>
                </button>
            )}

            {currentQuarter && (
                <div
                    style={{ background: "#EBF7F1", borderColor: "#A3D9BC" }}
                    className="flex items-center gap-1.5 border rounded-md px-2 py-1 sm:px-2.5"
                >
                    <div style={{ background: AP.green }} className="w-1.5 h-1.5 rounded-full" />
                    <span style={{ color: AP.green }} className="text-[10px] sm:text-xs font-bold whitespace-nowrap">
                        {currentQuarter} <span className="hidden xs:inline">ACTIVE</span>
                    </span>
                </div>
            )}
            <NotificationBell />
        </header>
    );
}
