"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const ToastContext = createContext(null);

const TYPE_STYLE = {
    success: { bar: "bg-ap-green", icon: "✓", iconBg: "bg-ap-green-50 text-ap-green" },
    error: { bar: "bg-red-600", icon: "!", iconBg: "bg-red-50 text-red-600" },
    info: { bar: "bg-ap-blue", icon: "i", iconBg: "bg-ap-blue-50 text-ap-blue" },
};

const MAX_TOASTS = 3;
const DEFAULT_DURATION = 4000;

function ToastItem({ toast, onDismiss }) {
    const [leaving, setLeaving] = useState(false);

    useEffect(() => {
        const t = setTimeout(() => setLeaving(true), toast.duration - 200);
        const t2 = setTimeout(() => onDismiss(toast.id), toast.duration);
        return () => { clearTimeout(t); clearTimeout(t2); };
    }, [toast, onDismiss]);

    const s = TYPE_STYLE[toast.type] || TYPE_STYLE.info;
    return (
        <div
            role="status"
            className={`pointer-events-auto flex items-center gap-3 bg-white border border-ap-border rounded-xl shadow-pop pl-3 pr-2 py-2.5 min-w-[260px] max-w-[380px] overflow-hidden relative transition-all duration-200 ${leaving ? "opacity-0 translate-y-2" : "opacity-100 translate-y-0"}`}
        >
            <span className={`absolute left-0 top-0 bottom-0 w-1 ${s.bar}`} aria-hidden="true" />
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-extrabold shrink-0 ${s.iconBg}`} aria-hidden="true">
                {s.icon}
            </span>
            <p className="m-0 text-[13px] font-semibold text-ap-text flex-1">{toast.message}</p>
            <button
                onClick={() => onDismiss(toast.id)}
                aria-label="Dismiss notification"
                className="bg-transparent border-none cursor-pointer text-gray-400 hover:text-gray-600 p-1 flex shrink-0"
            >
                <svg width="12" height="12" fill="none" viewBox="0 0 24 24">
                    <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
            </button>
        </div>
    );
}

export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);
    const [mounted, setMounted] = useState(false);
    const idRef = useRef(0);

    useEffect(() => setMounted(true), []);

    const dismiss = useCallback((id) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    const push = useCallback((type, message, opts = {}) => {
        const id = ++idRef.current;
        setToasts((prev) => [...prev.slice(-(MAX_TOASTS - 1)), { id, type, message, duration: opts.duration || DEFAULT_DURATION }]);
        return id;
    }, []);

    const api = useRef({
        success: (msg, opts) => push("success", msg, opts),
        error: (msg, opts) => push("error", msg, opts),
        info: (msg, opts) => push("info", msg, opts),
    });

    return (
        <ToastContext.Provider value={api.current}>
            {children}
            {mounted &&
                createPortal(
                    <div
                        aria-live="polite"
                        aria-label="Notifications"
                        className="fixed z-[2000] flex flex-col gap-2 pointer-events-none top-3 left-1/2 -translate-x-1/2 w-[calc(100%-24px)] items-center sm:top-auto sm:left-auto sm:translate-x-0 sm:bottom-5 sm:right-5 sm:w-auto sm:items-end pb-safe"
                    >
                        {toasts.map((t) => (
                            <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
                        ))}
                    </div>,
                    document.body
                )}
        </ToastContext.Provider>
    );
}

/** Toast API: `const toast = useToast(); toast.success("Saved")`. Safe no-op outside provider. */
export function useToast() {
    const ctx = useContext(ToastContext);
    if (ctx) return ctx;
    // No-op fallback so components don't crash if rendered without the provider.
    return { success: () => {}, error: () => {}, info: () => {} };
}
