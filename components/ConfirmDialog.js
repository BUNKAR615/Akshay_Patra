"use client";

import { useEffect, useRef } from "react";

/**
 * Reusable confirmation dialog with overlay.
 *
 * Props:
 * - open: boolean
 * - title: string
 * - message: string
 * - confirmLabel?: string (default "Confirm")
 * - cancelLabel?: string (default "Cancel")
 * - variant?: "danger" | "warning" | "default"
 * - loading?: boolean
 * - onConfirm: () => void
 * - onCancel: () => void
 */
export default function ConfirmDialog({
    open,
    title,
    message,
    confirmLabel = "Yes, Submit",
    cancelLabel = "No, Go Back",
    variant = "warning",
    loading = false,
    onConfirm,
    onCancel,
}) {
    const dialogRef = useRef(null);

    // Focus trap
    useEffect(() => {
        if (open) dialogRef.current?.focus();
    }, [open]);

    // Escape key
    useEffect(() => {
        if (!open) return;
        const handler = (e) => { if (e.key === "Escape") onCancel(); };
        document.addEventListener("keydown", handler);
        return () => document.removeEventListener("keydown", handler);
    }, [open, onCancel]);

    if (!open) return null;

    const btnColors = {
        danger: "bg-[#D32F2F] hover:bg-[#D32F2F]/90 shadow-lg text-white",
        warning: "bg-[#F7941D] hover:bg-[#F7941D]/90 shadow-lg text-white",
        default: "bg-[#003087] hover:bg-[#00843D] shadow-lg text-white",
    };

    const iconColors = {
        danger: "text-[#D32F2F] bg-[#D32F2F]/10",
        warning: "text-[#F7941D] bg-[#F7941D]/10",
        default: "text-[#003087] bg-[#003087]/10",
    };

    // Note: Icons mappings omitted to save space
    const icons = {
        danger: "M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z",
        warning: "M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z",
        default: "M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z",
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
            {/* Overlay */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />

            {/* Dialog */}
            <div
                ref={dialogRef}
                tabIndex={-1}
                className="relative bg-white border border-[#E0E0E0] rounded-2xl shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in-95"
                style={{ animation: "dialogIn 0.2s ease-out" }}
            >
                <div className="flex items-start gap-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${iconColors[variant]}`}>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d={icons[variant]} />
                        </svg>
                    </div>
                    <div className="flex-1">
                        <h3 className="text-[18px] font-bold text-[#003087] leading-tight">{title}</h3>
                        <p className="text-[#333333] text-[14px] mt-2 leading-relaxed whitespace-pre-line">{message}</p>
                    </div>
                </div>

                <div className="flex justify-end gap-3 mt-8">
                    <button
                        onClick={onCancel}
                        disabled={loading}
                        className="min-h-[44px] min-w-[80px] px-5 py-2.5 text-[14px] font-bold text-[#333333] bg-white border border-[#CCCCCC] rounded-lg hover:bg-[#F5F7FA] transition-colors cursor-pointer disabled:bg-[#CCCCCC] disabled:text-[#666666] disabled:border-transparent"
                    >
                        {cancelLabel}
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={loading}
                        className={`min-h-[44px] min-w-[80px] px-5 py-2.5 text-[14px] text-white font-bold rounded-lg transition-all cursor-pointer disabled:!bg-[#CCCCCC] disabled:!text-[#666666] shadow-lg ${btnColors[variant]}`}
                    >
                        {loading ? (
                            <span className="flex items-center gap-2">
                                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                                Processing...
                            </span>
                        ) : confirmLabel}
                    </button>
                </div>
            </div>

            <style jsx>{`
        @keyframes dialogIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
        </div>
    );
}
