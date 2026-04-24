"use client";

import { useState } from "react";
import { AP, BADGE_PALETTE } from "./tokens";
import { Xicon } from "./Icons";

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

export function Btn({ children, variant = "primary", size = "md", onClick, disabled, icon, full, type = "button", title }) {
    const vs = {
        primary: { bg: AP.blue, text: "#fff", bd: "transparent", hov: "#002266" },
        green: { bg: AP.green, text: "#fff", bd: "transparent", hov: "#006B32" },
        orange: { bg: AP.orange, text: "#fff", bd: "transparent", hov: "#D87A0A" },
        ghost: { bg: "transparent", text: "#374151", bd: "#D1D5DB", hov: "#F9FAFB" },
        danger: { bg: "#DC2626", text: "#fff", bd: "transparent", hov: "#B91C1C" },
        subtle: { bg: "#F3F4F6", text: "#374151", bd: "transparent", hov: "#E5E7EB" },
    };
    const ss = {
        sm: { p: "5px 11px", fs: 12 },
        md: { p: "8px 16px", fs: 13 },
        lg: { p: "11px 24px", fs: 14 },
    };
    const v = vs[variant] || vs.primary;
    const s = ss[size] || ss.md;
    const [h, setH] = useState(false);
    return (
        <button
            type={type}
            onClick={onClick}
            disabled={disabled}
            title={title}
            onMouseEnter={() => setH(true)}
            onMouseLeave={() => setH(false)}
            style={{
                background: h && !disabled ? v.hov : v.bg,
                color: v.text,
                borderColor: v.bd,
                padding: s.p,
                fontSize: s.fs,
                width: full ? "100%" : "auto",
            }}
            className="inline-flex items-center gap-1.5 border rounded-lg font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer justify-center leading-5"
        >
            {icon && <span className="flex">{icon}</span>}
            {children}
        </button>
    );
}

export function Field({ label, required, error, hint, children }) {
    return (
        <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-gray-700 uppercase tracking-wide">
                {label}
                {required && <span className="text-red-600 ml-0.5">*</span>}
            </label>
            {children}
            {hint && <span className="text-[11px] text-gray-400">{hint}</span>}
            {error && <span className="text-[11px] text-red-600 font-semibold">{error}</span>}
        </div>
    );
}

export function TInput({ value, onChange, placeholder, type = "text", disabled, rows, name }) {
    const base = "w-full border-[1.5px] border-gray-300 focus:border-[#003087] rounded-lg px-3 py-2 text-[13px] bg-white text-gray-900 outline-none transition-colors disabled:bg-gray-50";
    if (rows) {
        return (
            <textarea
                name={name}
                value={value}
                onChange={onChange}
                placeholder={placeholder}
                rows={rows}
                disabled={disabled}
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
            className="w-full border-[1.5px] border-gray-300 rounded-lg px-3 py-2 text-[13px] bg-white text-gray-900 outline-none disabled:bg-gray-50"
        >
            {children}
        </select>
    );
}

export function Card({ children, className = "", style }) {
    return (
        <div style={style} className={`bg-white border border-[#E4E7ED] rounded-[14px] ${className}`}>
            {children}
        </div>
    );
}

export function Stat({ label, value, sub, color = AP.blue, icon }) {
    return (
        <Card className="px-5 py-4 flex flex-col gap-1.5">
            <div className="flex justify-between items-start">
                <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider m-0">{label}</p>
                {icon && <span style={{ color, opacity: 0.6 }}>{icon}</span>}
            </div>
            <p style={{ color }} className="text-[28px] font-extrabold m-0 leading-tight">{value}</p>
            {sub && <p className="text-xs text-gray-400 m-0 font-medium">{sub}</p>}
        </Card>
    );
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
            style={{ background: p.bg, borderColor: p.bd, color: p.text }}
            className="border rounded-lg px-4 py-2.5 flex justify-between items-center gap-3"
        >
            <p className="m-0 text-[13px] font-semibold">{message}</p>
            {onClose && (
                <button onClick={onClose} style={{ color: p.text }} className="bg-transparent border-none cursor-pointer opacity-70 hover:opacity-100 flex p-0">
                    <Xicon />
                </button>
            )}
        </div>
    );
}

export function Modal({ open, onClose, title, width = 560, children }) {
    if (!open) return null;
    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-5">
            <div onClick={onClose} className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
            <div
                style={{ maxWidth: width }}
                className="relative bg-white rounded-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl"
            >
                <div className="sticky top-0 bg-white z-10 flex items-center justify-between px-6 py-4 border-b border-[#E4E7ED]">
                    <h2 className="m-0 text-base font-extrabold text-gray-900">{title}</h2>
                    <button
                        onClick={onClose}
                        className="bg-gray-100 border-none rounded-lg w-8 h-8 flex items-center justify-center cursor-pointer text-gray-500 hover:bg-gray-200"
                    >
                        <Xicon />
                    </button>
                </div>
                <div className="px-6 py-5">{children}</div>
            </div>
        </div>
    );
}

export function Header({ title, subtitle, actions }) {
    return (
        <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
            <div>
                <h1 className="text-[21px] font-extrabold text-gray-900 m-0 tracking-tight">{title}</h1>
                {subtitle && <p className="text-[13px] text-gray-500 mt-1 m-0">{subtitle}</p>}
            </div>
            {actions && <div className="flex gap-2 flex-wrap">{actions}</div>}
        </div>
    );
}

export function Empty({ icon = "📄", title, sub }) {
    return (
        <div className="text-center py-12 px-6 text-gray-400">
            <div className="text-4xl mb-2.5">{icon}</div>
            <p className="text-sm font-bold text-gray-700 mb-1 m-0">{title}</p>
            {sub && <p className="text-xs m-0">{sub}</p>}
        </div>
    );
}

export function ProgressBar({ value, color = AP.blue, height = 6 }) {
    return (
        <div style={{ height }} className="bg-gray-100 rounded-full overflow-hidden">
            <div
                style={{ width: `${Math.min(value, 100)}%`, background: color }}
                className="h-full rounded-full transition-all duration-500"
            />
        </div>
    );
}

export function Toggle({ on, onChange }) {
    return (
        <button
            type="button"
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
