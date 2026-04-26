"use client";

import NotificationBell from "../NotificationBell";
import { Ic } from "../ui/Icons";
import { AP } from "../ui/tokens";

export default function TopBar({ onToggle, currentQuarter }) {
    return (
        <header
            className="h-14 bg-white border-b border-[#E4E7ED] flex items-center pr-3 sm:pr-5 sticky top-0 z-30 shrink-0 gap-2 sm:gap-3"
            style={{ paddingTop: "var(--safe-top, 0px)" }}
        >
            <button
                onClick={onToggle}
                aria-label="Toggle sidebar"
                className="w-12 h-14 sm:w-14 flex items-center justify-center bg-transparent border-none cursor-pointer text-gray-500 hover:text-gray-800 active:text-gray-900 shrink-0"
            >
                {Ic.menu}
            </button>
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
            <div className="flex-1" />
            <NotificationBell />
        </header>
    );
}
