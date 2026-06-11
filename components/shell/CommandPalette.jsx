"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { NAV } from "../../lib/dashboardNav";
import { Ic } from "../ui/Icons";
import { useFocusTrap, lockBodyScroll, unlockBodyScroll } from "../ui/useFocusTrap";

/**
 * Global command palette (Ctrl/Cmd+K, or "/" outside inputs).
 * - All roles: jump to any nav destination for their role.
 * - ADMIN: additionally searches employees live via the existing
 *   GET /api/admin/employees?search= endpoint (no new APIs).
 */
export default function CommandPalette({ role, open, onOpen, onClose }) {
    const router = useRouter();
    const [query, setQuery] = useState("");
    const [highlight, setHighlight] = useState(0);
    const [employees, setEmployees] = useState([]);
    const [searching, setSearching] = useState(false);
    const trapRef = useFocusTrap(open, onClose);
    const debounceRef = useRef(null);
    const listRef = useRef(null);

    // Global shortcuts. "/" only when no editable element has focus.
    useEffect(() => {
        const onKey = (e) => {
            const mod = e.ctrlKey || e.metaKey;
            if (mod && e.key.toLowerCase() === "k") {
                e.preventDefault();
                open ? onClose() : onOpen();
                return;
            }
            if (e.key === "/" && !open) {
                const t = e.target;
                const tag = t?.tagName;
                if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t?.isContentEditable) return;
                e.preventDefault();
                onOpen();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onOpen, onClose]);

    // Reset on open/close + scroll lock.
    useEffect(() => {
        if (!open) return;
        setQuery("");
        setEmployees([]);
        setHighlight(0);
        lockBodyScroll();
        return () => unlockBodyScroll();
    }, [open]);

    const navItems = useMemo(() => {
        const groups = NAV[role] || [];
        return groups.flatMap((g) =>
            g.items.map((item) => ({
                type: "nav",
                id: `nav-${item.id}`,
                label: item.label,
                sub: g.section || "Navigation",
                icon: item.icon,
                href: item.href,
            }))
        );
    }, [role]);

    const filteredNav = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return navItems;
        return navItems.filter((i) => i.label.toLowerCase().includes(q) || i.sub.toLowerCase().includes(q));
    }, [navItems, query]);

    // ADMIN live employee search (debounced).
    useEffect(() => {
        if (role !== "ADMIN" || !open) return;
        const q = query.trim();
        clearTimeout(debounceRef.current);
        if (q.length < 2) {
            setEmployees([]);
            setSearching(false);
            return;
        }
        setSearching(true);
        debounceRef.current = setTimeout(async () => {
            try {
                const res = await fetch(`/api/admin/employees?search=${encodeURIComponent(q)}&page=1`);
                const json = await res.json();
                if (json.success) {
                    setEmployees(
                        (json.data.employees || []).slice(0, 5).map((e) => ({
                            type: "employee",
                            id: `emp-${e.id}`,
                            label: e.name,
                            sub: [e.empCode, e.designation].filter(Boolean).join(" · "),
                            icon: "employees",
                            href: `/dashboard/admin?view=employees&search=${encodeURIComponent(e.empCode || e.name)}`,
                        }))
                    );
                }
            } catch { /* network failure — nav results still usable */ }
            setSearching(false);
        }, 300);
        return () => clearTimeout(debounceRef.current);
    }, [query, role, open]);

    const results = useMemo(() => [...filteredNav, ...employees], [filteredNav, employees]);

    useEffect(() => setHighlight(0), [results.length, query]);

    const go = (item) => {
        onClose();
        router.push(item.href);
    };

    const onInputKeyDown = (e) => {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlight((h) => Math.min(h + 1, results.length - 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((h) => Math.max(h - 1, 0));
        } else if (e.key === "Enter" && results[highlight]) {
            e.preventDefault();
            go(results[highlight]);
        }
    };

    // Keep the highlighted option scrolled into view.
    useEffect(() => {
        const el = listRef.current?.querySelector(`[data-idx="${highlight}"]`);
        el?.scrollIntoView({ block: "nearest" });
    }, [highlight]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[1500] flex items-start justify-center px-4 pt-[12vh]">
            <div onClick={onClose} className="absolute inset-0 bg-black/40 backdrop-blur-sm" aria-hidden="true" />
            <div
                ref={trapRef}
                role="dialog"
                aria-modal="true"
                aria-label="Search"
                tabIndex={-1}
                className="relative bg-white rounded-2xl shadow-pop w-full max-w-[560px] overflow-hidden outline-none"
            >
                <div className="flex items-center gap-2.5 px-4 py-3 border-b border-ap-border">
                    <span className="text-gray-400 flex shrink-0" aria-hidden="true">{Ic.search}</span>
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={onInputKeyDown}
                        placeholder={role === "ADMIN" ? "Search pages or employees…" : "Search pages…"}
                        aria-label="Search pages"
                        role="combobox"
                        aria-expanded="true"
                        aria-controls="cp-results"
                        className="flex-1 border-none outline-none text-sm text-gray-900 bg-transparent placeholder:text-gray-400"
                    />
                    <kbd className="hidden sm:inline-flex text-[10px] font-bold text-gray-400 border border-ap-border rounded px-1.5 py-0.5">ESC</kbd>
                </div>
                <div ref={listRef} id="cp-results" role="listbox" aria-label="Results" className="max-h-[50vh] overflow-y-auto py-1.5">
                    {results.length === 0 && !searching && (
                        <p className="text-center text-[13px] text-gray-400 py-8 m-0">No matches — try a different term</p>
                    )}
                    {results.map((item, idx) => (
                        <button
                            key={item.id}
                            type="button"
                            role="option"
                            aria-selected={idx === highlight}
                            data-idx={idx}
                            onMouseEnter={() => setHighlight(idx)}
                            onClick={() => go(item)}
                            className={`w-full flex items-center gap-3 px-4 py-2.5 border-none cursor-pointer text-left ${idx === highlight ? "bg-ap-blue-50" : "bg-transparent"}`}
                        >
                            <span className={`flex shrink-0 ${idx === highlight ? "text-ap-blue" : "text-gray-400"}`} aria-hidden="true">
                                {Ic[item.icon] || Ic.dashboard}
                            </span>
                            <span className="flex-1 min-w-0">
                                <span className={`block text-[13px] font-bold truncate ${idx === highlight ? "text-ap-blue" : "text-gray-800"}`}>
                                    {item.label}
                                </span>
                                <span className="block text-[11px] text-gray-400 truncate">{item.sub}</span>
                            </span>
                            {item.type === "employee" && (
                                <span className="text-[10px] font-bold text-gray-400 uppercase shrink-0">Employee</span>
                            )}
                        </button>
                    ))}
                    {searching && (
                        <p className="text-center text-[12px] text-gray-400 py-2 m-0" role="status">Searching employees…</p>
                    )}
                </div>
                <div className="flex items-center gap-3 px-4 py-2 border-t border-ap-border bg-gray-50 text-[10.5px] text-gray-400 font-medium">
                    <span><kbd className="font-bold">↑↓</kbd> navigate</span>
                    <span><kbd className="font-bold">↵</kbd> open</span>
                    <span className="ml-auto">Ctrl+K to toggle</span>
                </div>
            </div>
        </div>
    );
}
