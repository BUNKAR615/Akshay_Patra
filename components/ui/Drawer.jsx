"use client";

import { useEffect } from "react";
import { useFocusTrap, lockBodyScroll, unlockBodyScroll } from "./useFocusTrap";
import { Xicon } from "./Icons";

/**
 * Right-side detail sheet. Full-screen on mobile, fixed-width panel on desktop.
 */
export function Drawer({ open, onClose, title, width = 440, children, footer }) {
    const trapRef = useFocusTrap(open, onClose);

    useEffect(() => {
        if (!open) return;
        lockBodyScroll();
        return () => unlockBodyScroll();
    }, [open]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[1000]">
            <div onClick={onClose} className="absolute inset-0 bg-black/40 backdrop-blur-sm" aria-hidden="true" />
            <div
                ref={trapRef}
                role="dialog"
                aria-modal="true"
                aria-label={typeof title === "string" ? title : undefined}
                tabIndex={-1}
                style={{ maxWidth: width }}
                className="absolute right-0 top-0 bottom-0 w-full bg-white shadow-pop flex flex-col outline-none animate-[drawerIn_0.2s_ease-out]"
            >
                <div className="flex items-center justify-between px-5 py-4 border-b border-ap-border shrink-0 pt-safe">
                    <h2 className="m-0 text-base font-extrabold text-gray-900">{title}</h2>
                    <button
                        onClick={onClose}
                        aria-label="Close panel"
                        className="bg-gray-100 border-none rounded-lg w-8 h-8 flex items-center justify-center cursor-pointer text-gray-500 hover:bg-gray-200"
                    >
                        <Xicon />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
                {footer && <div className="px-5 py-3 border-t border-ap-border shrink-0 pb-safe">{footer}</div>}
            </div>
            <style jsx global>{`
                @keyframes drawerIn {
                    from { transform: translateX(24px); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                @media (prefers-reduced-motion: reduce) {
                    [class*="animate-[drawerIn"] { animation: none !important; }
                }
            `}</style>
        </div>
    );
}
