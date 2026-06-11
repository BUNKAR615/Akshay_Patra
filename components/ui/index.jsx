"use client";

import { useEffect } from "react";
import { AP, BADGE_PALETTE } from "./tokens";
import { Xicon } from "./Icons";
import { useFocusTrap, lockBodyScroll, unlockBodyScroll } from "./useFocusTrap";
import { Empty, EmptyState } from "./EmptyState";
import { KpiCard } from "./KpiCard";

export function Avatar({ name = "", size = 32, color = AP.blue }) {
    const ini = (name || "?").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
    return (
        <div
            style={{
                width: size,
                height: size,
                background: color,
                fontSize: Math.round(size * 0.38),
            }}
            className="rounded-full flex items-center justify-center shrink-0 text-white font-bold"
            aria-hidden="true"
        >
            {ini}
        </div>
    );
}

export function Badge({ label, color = "blue" }) {
    const p = BADGE_PALETTE[color] || BADGE_PALETTE.gray;
    return (
        <span
            style={{ background: p.bg, color: p.text, borderColor: p.bd }}
            className="inline-flex items-center border rounded-full px-2.5 py-0.5 text-[11px] font-bold leading-5 whitespace-nowrap"
        >
            {label}
        </span>
    );
}

const BTN_VARIANTS = {
    primary: "bg-ap-blue hover:bg-ap-blue-700 text-white border-transparent",
    green: "bg-ap-green hover:bg-ap-green-700 text-white border-transparent",
    orange: "bg-ap-orange hover:bg-ap-orange-600 text-white border-transparent",
    ghost: "bg-transparent hover:bg-gray-50 text-gray-700 border-gray-300",
    danger: "bg-red-600 hover:bg-red-700 text-white border-transparent",
    subtle: "bg-gray-100 hover:bg-gray-200 text-gray-700 border-transparent",
};
const BTN_SIZES = {
    sm: "px-[11px] py-[5px] text-xs",
    md: "px-4 py-2 text-[13px]",
    lg: "px-6 py-[11px] text-sm",
};

export function Btn({ children, variant = "primary", size = "md", onClick, disabled, icon, full, type = "button", title, loading }) {
    const isDisabled = disabled || loading;
    return (
        <button
            type={type}
            onClick={onClick}
            disabled={isDisabled}
            title={title}
            aria-busy={loading || undefined}
            className={`inline-flex items-center gap-1.5 border rounded-lg font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer justify-center leading-5 ${BTN_VARIANTS[variant] || BTN_VARIANTS.primary} ${BTN_SIZES[size] || BTN_SIZES.md} ${full ? "w-full" : ""}`}
        >
            {loading ? (
                <svg className="animate-spin h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
            ) : (
                icon && <span className="flex" aria-hidden="true">{icon}</span>
            )}
            {children}
        </button>
    );
}

export function Field({ label, required, error, hint, children }) {
    return (
        <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-gray-700 uppercase tracking-wide">
                {label}
                {required && <span className="text-red-600 ml-0.5" aria-hidden="true">*</span>}
            </label>
            {children}
            {hint && <span className="text-[11px] text-gray-400">{hint}</span>}
            {error && <span role="alert" className="text-[11px] text-red-600 font-semibold">{error}</span>}
        </div>
    );
}

export function TInput({ value, onChange, placeholder, type = "text", disabled, rows, name, invalid, autoComplete, inputMode, min, max, step }) {
    const base = `w-full border-[1.5px] ${invalid ? "border-red-400 focus:border-red-500" : "border-gray-300 focus:border-ap-blue"} rounded-lg px-3 py-2 text-[13px] bg-white text-gray-900 outline-none transition-colors disabled:bg-gray-50`;
    if (rows) {
        return (
            <textarea
                name={name}
                value={value}
                onChange={onChange}
                placeholder={placeholder}
                rows={rows}
                disabled={disabled}
                aria-invalid={invalid || undefined}
                className={`${base} resize-y`}
            />
        );
    }
    return (
        <input
            name={name}
            type={type}
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            disabled={disabled}
            autoComplete={autoComplete}
            inputMode={inputMode}
            min={min}
            max={max}
            step={step}
            aria-invalid={invalid || undefined}
            className={base}
        />
    );
}

export function Sel({ value, onChange, children, disabled, name }) {
    return (
        <select
            name={name}
            value={value}
            onChange={onChange}
            disabled={disabled}
            className="w-full border-[1.5px] border-gray-300 focus:border-ap-blue rounded-lg px-3 py-2 text-[13px] bg-white text-gray-900 outline-none disabled:bg-gray-50"
        >
            {children}
        </select>
    );
}

export function Card({ children, className = "", style }) {
    return (
        <div style={style} className={`bg-white border border-ap-border rounded-card shadow-card ${className}`}>
            {children}
        </div>
    );
}

/** Legacy stat card — thin wrapper over KpiCard so existing call sites keep working. */
export function Stat({ label, value, sub, color = AP.blue, icon }) {
    return <KpiCard label={label} value={value} sub={sub} color={color} icon={icon} />;
}

export function Alert({ type = "info", message, onClose }) {
    const p = {
        success: { bg: "#F0FDF4", text: "#166534", bd: "#86EFAC" },
        error: { bg: "#FEF2F2", text: "#991B1B", bd: "#FCA5A5" },
        warning: { bg: "#FFFBEB", text: "#92400E", bd: "#FCD34D" },
        info: { bg: "#EFF6FF", text: "#1E40AF", bd: "#93C5FD" },
    }[type] || { bg: "#EFF6FF", text: "#1E40AF", bd: "#93C5FD" };
    return (
        <div
            role={type === "error" ? "alert" : "status"}
            style={{ background: p.bg, borderColor: p.bd, color: p.text }}
            className="border rounded-lg px-4 py-2.5 flex justify-between items-center gap-3"
        >
            <p className="m-0 text-[13px] font-semibold">{message}</p>
            {onClose && (
                <button onClick={onClose} aria-label="Dismiss message" style={{ color: p.text }} className="bg-transparent border-none cursor-pointer opacity-70 hover:opacity-100 flex p-0">
                    <Xicon />
                </button>
            )}
        </div>
    );
}

export function Modal({ open, onClose, title, width = 560, children, footer }) {
    const trapRef = useFocusTrap(open, onClose);

    useEffect(() => {
        if (!open) return;
        lockBodyScroll();
        return () => unlockBodyScroll();
    }, [open]);

    if (!open) return null;
    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center sm:p-5">
            <div onClick={onClose} className="absolute inset-0 bg-black/40 backdrop-blur-sm" aria-hidden="true" />
            <div
                ref={trapRef}
                role="dialog"
                aria-modal="true"
                aria-label={typeof title === "string" ? title : undefined}
                tabIndex={-1}
                style={{ maxWidth: width }}
                className="relative bg-white w-full flex flex-col outline-none shadow-2xl h-full max-h-[100dvh] rounded-none sm:h-auto sm:max-h-[90vh] sm:rounded-2xl"
            >
                <div className="bg-white z-10 flex items-center justify-between px-6 py-4 border-b border-ap-border shrink-0 pt-safe sm:pt-4 rounded-t-none sm:rounded-t-2xl">
                    <h2 className="m-0 text-base font-extrabold text-gray-900">{title}</h2>
                    <button
                        onClick={onClose}
                        aria-label="Close dialog"
                        className="bg-gray-100 border-none rounded-lg w-8 h-8 flex items-center justify-center cursor-pointer text-gray-500 hover:bg-gray-200"
                    >
                        <Xicon />
                    </button>
                </div>
                <div className="px-6 py-5 overflow-y-auto flex-1">{children}</div>
                {footer && (
                    <div className="px-6 py-4 border-t border-ap-border shrink-0 pb-safe sm:pb-4 rounded-b-none sm:rounded-b-2xl bg-white">
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );
}

export function ProgressBar({ value, color = AP.blue, height = 6 }) {
    return (
        <div
            style={{ height }}
            className="bg-gray-100 rounded-full overflow-hidden"
            role="progressbar"
            aria-valuenow={Math.round(Math.min(value, 100))}
            aria-valuemin={0}
            aria-valuemax={100}
        >
            <div
                style={{ width: `${Math.min(value, 100)}%`, background: color }}
                className="h-full rounded-full transition-all duration-500"
            />
        </div>
    );
}

export function Toggle({ on, onChange, label }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-label={label}
            onClick={() => onChange(!on)}
            style={{ background: on ? AP.green : "#D1D5DB" }}
            className="w-10 h-[22px] rounded-full border-none cursor-pointer relative transition-colors shrink-0"
        >
            <div
                style={{ left: on ? 21 : 3 }}
                className="absolute top-[3px] w-4 h-4 rounded-full bg-white transition-all"
            />
        </button>
    );
}

// ── Design-system additions (Phase 1 redesign) ──
export { Empty, EmptyState };
export { KpiCard };
export { PageHeader, Header } from "./PageHeader";
export { Tabs } from "./Tabs";
export { SearchInput } from "./SearchInput";
export { Drawer } from "./Drawer";
export { FormField, useForm } from "./FormField";
export { ToastProvider, useToast } from "./Toast";
export { default as DataTable } from "./DataTable";
