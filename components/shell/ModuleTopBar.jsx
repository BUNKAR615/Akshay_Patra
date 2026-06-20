"use client";

import { useRouter } from "next/navigation";
import NotificationBell from "../NotificationBell";
import { LAUNCHER_ROUTE } from "../../lib/modules";
import { AP } from "../ui/tokens";

/**
 * Module top bar (60px). Left: a "Back to Modules" button → launcher, then a
 * breadcrumb "Module / Current view". Right: active-quarter pill + notification
 * bell (reused from the existing shell).
 */
export default function ModuleTopBar({ module, crumb, currentQuarter = "Q2 2026" }) {
    const router = useRouter();
    return (
        <header className="h-[60px] bg-white border-b border-ap-border flex items-center gap-3 px-4 sm:px-5 shrink-0 sticky top-0 z-20">
            <button
                onClick={() => router.push(LAUNCHER_ROUTE)}
                className="flex items-center gap-1.5 bg-[#F4F6FA] border border-ap-border rounded-lg px-3 py-1.5 text-[13px] font-semibold text-ap-text-muted hover:bg-gray-100 cursor-pointer transition-colors shrink-0"
            >
                <svg width="15" height="15" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="hidden sm:inline">Back to Modules</span>
            </button>

            <div className="text-[13px] font-semibold text-ap-text-muted min-w-0 truncate">
                <span>{module.name}</span>
                {crumb && (
                    <>
                        <span className="mx-1.5 text-ap-text-faint" aria-hidden="true">/</span>
                        <span className="text-ap-text">{crumb}</span>
                    </>
                )}
            </div>

            <div className="flex-1" />

            {currentQuarter && (
                <div
                    style={{ background: "#EBF7F1", borderColor: "#A3D9BC" }}
                    className="hidden xs:flex items-center gap-1.5 border rounded-md px-2.5 py-1 shrink-0"
                >
                    <div style={{ background: AP.green }} className="w-1.5 h-1.5 rounded-full" />
                    <span style={{ color: AP.green }} className="text-xs font-bold whitespace-nowrap">
                        {currentQuarter} ACTIVE
                    </span>
                </div>
            )}
            <NotificationBell />
        </header>
    );
}
