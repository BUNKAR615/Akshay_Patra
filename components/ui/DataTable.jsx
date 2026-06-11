"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Empty } from "./EmptyState";
import { SkeletonTable } from "../Skeleton";

const HIDE_BELOW = {
    sm: "hidden sm:table-cell",
    md: "hidden md:table-cell",
    lg: "hidden lg:table-cell",
};
const ALIGN = { left: "text-left", center: "text-center", right: "text-right" };

function SortArrow({ dir }) {
    return (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0">
            {dir === "asc" ? (
                <path d="M12 5l6 8H6l6-8z" fill="currentColor" />
            ) : dir === "desc" ? (
                <path d="M12 19l-6-8h12l-6 8z" fill="currentColor" />
            ) : (
                <path d="M12 4l4 5H8l4-5zM12 20l-4-5h8l-4 5z" fill="currentColor" opacity="0.35" />
            )}
        </svg>
    );
}

function ColumnPicker({ columns, hiddenKeys, onToggle }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    useEffect(() => {
        if (!open) return;
        const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener("mousedown", onDown);
        return () => document.removeEventListener("mousedown", onDown);
    }, [open]);
    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                aria-haspopup="true"
                aria-expanded={open}
                className="inline-flex items-center gap-1.5 border border-ap-border rounded-lg px-2.5 py-1.5 text-xs font-bold text-gray-600 bg-white hover:bg-gray-50 cursor-pointer"
            >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <rect x="3" y="4" width="5" height="16" rx="1" stroke="currentColor" strokeWidth="1.8" />
                    <rect x="10" y="4" width="5" height="16" rx="1" stroke="currentColor" strokeWidth="1.8" />
                    <rect x="17" y="4" width="4" height="16" rx="1" stroke="currentColor" strokeWidth="1.8" />
                </svg>
                Columns
            </button>
            {open && (
                <div className="absolute right-0 top-full mt-1 z-30 bg-white border border-ap-border rounded-xl shadow-pop py-1.5 min-w-[180px]">
                    {columns.map((c) => (
                        <label key={c.key} className="flex items-center gap-2 px-3 py-1.5 text-[13px] text-gray-700 cursor-pointer hover:bg-gray-50">
                            <input
                                type="checkbox"
                                checked={!hiddenKeys.includes(c.key)}
                                onChange={() => onToggle(c.key)}
                                className="accent-ap-blue"
                            />
                            {typeof c.header === "string" ? c.header : c.key}
                        </label>
                    ))}
                </div>
            )}
        </div>
    );
}

function Pagination({ page, totalPages, total, onPageChange }) {
    if (!totalPages || totalPages <= 1) return null;
    const btn = "min-w-[32px] h-8 px-2 inline-flex items-center justify-center rounded-lg border text-xs font-bold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed";
    const pages = [];
    const start = Math.max(1, Math.min(page - 2, totalPages - 4));
    for (let p = start; p <= Math.min(totalPages, start + 4); p++) pages.push(p);
    return (
        <nav aria-label="Pagination" className="flex items-center justify-between gap-3 px-4 py-3 border-t border-ap-border flex-wrap">
            <span className="text-xs text-gray-500 font-medium">
                Page {page} of {totalPages}{typeof total === "number" ? ` · ${total} total` : ""}
            </span>
            <div className="flex items-center gap-1">
                <button type="button" className={`${btn} border-ap-border bg-white text-gray-600 hover:bg-gray-50`} disabled={page <= 1} onClick={() => onPageChange(page - 1)} aria-label="Previous page">‹</button>
                {pages.map((p) => (
                    <button
                        key={p}
                        type="button"
                        aria-current={p === page ? "page" : undefined}
                        className={`${btn} ${p === page ? "border-ap-blue bg-ap-blue text-white" : "border-ap-border bg-white text-gray-600 hover:bg-gray-50"}`}
                        onClick={() => onPageChange(p)}
                    >
                        {p}
                    </button>
                ))}
                <button type="button" className={`${btn} border-ap-border bg-white text-gray-600 hover:bg-gray-50`} disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} aria-label="Next page">›</button>
            </div>
        </nav>
    );
}

/**
 * Standard data table.
 *
 * columns: [{ key, header, render?(row, i), sortable?, sortAccessor?(row),
 *             width?, align? ('left'|'center'|'right'), hideBelow? ('sm'|'md'|'lg') }]
 * Sorting: controlled via `sort` {key,dir} + `onSortChange`, or uncontrolled
 *          client-side via `defaultSort`.
 * Pagination: pass `pagination` {page, totalPages, total?, onPageChange} (server-side)
 *          — client-side slicing stays in the caller, keeping data flow unchanged.
 * mobileCard: (row) => JSX — below `md` renders a card list instead of the table.
 */
export default function DataTable({
    id,
    columns = [],
    rows = [],
    rowKey = (row, i) => row?.id ?? i,
    loading = false,
    error = null,
    emptyIcon = "📄",
    emptyTitle = "No records found",
    emptySub,
    emptyAction,
    sort,
    onSortChange,
    defaultSort = null,
    pagination = null,
    stickyHeader = true,
    maxHeight,
    columnVisibility = false,
    mobileCard,
    onRowClick,
    toolbar,
    footer,
    dense = false,
}) {
    const [innerSort, setInnerSort] = useState(defaultSort);
    const activeSort = sort !== undefined ? sort : innerSort;
    const controlled = sort !== undefined;

    const [hiddenKeys, setHiddenKeys] = useState([]);
    const storageKey = id ? `ap.table.${id}.cols` : null;
    useEffect(() => {
        if (!storageKey) return;
        try {
            const saved = JSON.parse(localStorage.getItem(storageKey) || "[]");
            if (Array.isArray(saved)) setHiddenKeys(saved);
        } catch { /* corrupt storage — ignore */ }
    }, [storageKey]);
    const toggleColumn = (key) => {
        setHiddenKeys((prev) => {
            const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
            if (storageKey) try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* quota — ignore */ }
            return next;
        });
    };

    const visibleColumns = columns.filter((c) => !hiddenKeys.includes(c.key));

    const handleSort = (col) => {
        if (!col.sortable) return;
        const next =
            activeSort?.key === col.key
                ? { key: col.key, dir: activeSort.dir === "asc" ? "desc" : "asc" }
                : { key: col.key, dir: "asc" };
        if (controlled) onSortChange?.(next);
        else setInnerSort(next);
    };

    const sortedRows = useMemo(() => {
        if (controlled || !activeSort) return rows;
        const col = columns.find((c) => c.key === activeSort.key);
        if (!col) return rows;
        const acc = col.sortAccessor || ((row) => row?.[col.key]);
        const dir = activeSort.dir === "desc" ? -1 : 1;
        return [...rows].sort((a, b) => {
            const va = acc(a);
            const vb = acc(b);
            if (va == null && vb == null) return 0;
            if (va == null) return 1;
            if (vb == null) return -1;
            if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
            return String(va).localeCompare(String(vb), undefined, { numeric: true }) * dir;
        });
    }, [rows, activeSort, controlled, columns]);

    const cellPad = dense ? "px-3 py-2" : "px-4 py-3";

    if (loading) return <SkeletonTable rows={5} cols={Math.min(visibleColumns.length || 4, 6)} />;

    const isEmpty = !sortedRows.length;

    const tableEl = (
        <div className="overflow-x-auto" style={maxHeight ? { maxHeight, overflowY: "auto" } : undefined}>
            <table className="w-full border-collapse text-[13px]">
                <thead className={stickyHeader ? "sticky top-0 z-10" : undefined}>
                    <tr className="bg-gray-50">
                        {visibleColumns.map((col) => {
                            const sorted = activeSort?.key === col.key;
                            return (
                                <th
                                    key={col.key}
                                    scope="col"
                                    style={col.width ? { width: col.width } : undefined}
                                    aria-sort={sorted ? (activeSort.dir === "asc" ? "ascending" : "descending") : undefined}
                                    className={`${cellPad} ${ALIGN[col.align] || "text-left"} ${col.hideBelow ? HIDE_BELOW[col.hideBelow] : ""} text-[11px] font-bold text-gray-500 uppercase tracking-wider border-b border-ap-border bg-gray-50 whitespace-nowrap`}
                                >
                                    {col.sortable ? (
                                        <button
                                            type="button"
                                            onClick={() => handleSort(col)}
                                            className={`inline-flex items-center gap-1 bg-transparent border-none p-0 cursor-pointer font-bold uppercase tracking-wider text-[11px] ${sorted ? "text-ap-blue" : "text-gray-500 hover:text-gray-700"}`}
                                        >
                                            {col.header}
                                            <SortArrow dir={sorted ? activeSort.dir : null} />
                                        </button>
                                    ) : (
                                        col.header
                                    )}
                                </th>
                            );
                        })}
                    </tr>
                </thead>
                <tbody>
                    {sortedRows.map((row, i) => (
                        <tr
                            key={rowKey(row, i)}
                            onClick={onRowClick ? () => onRowClick(row) : undefined}
                            className={`border-b border-ap-border last:border-b-0 ${onRowClick ? "cursor-pointer hover:bg-ap-blue-50/60" : "hover:bg-gray-50/60"} transition-colors`}
                        >
                            {visibleColumns.map((col) => (
                                <td
                                    key={col.key}
                                    className={`${cellPad} ${ALIGN[col.align] || "text-left"} ${col.hideBelow ? HIDE_BELOW[col.hideBelow] : ""} text-gray-700 align-middle`}
                                >
                                    {col.render ? col.render(row, i) : row?.[col.key]}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );

    return (
        <div className="bg-white border border-ap-border rounded-card overflow-hidden shadow-card">
            {(toolbar || columnVisibility) && (
                <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-ap-border flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">{toolbar}</div>
                    {columnVisibility && <ColumnPicker columns={columns} hiddenKeys={hiddenKeys} onToggle={toggleColumn} />}
                </div>
            )}
            {error ? (
                <Empty icon="⚠️" title="Something went wrong" sub={String(error)} />
            ) : isEmpty ? (
                <div>
                    <Empty icon={emptyIcon} title={emptyTitle} sub={emptySub} />
                    {emptyAction && <div className="flex justify-center pb-8 -mt-4">{emptyAction}</div>}
                </div>
            ) : mobileCard ? (
                <>
                    <div className="md:hidden divide-y divide-ap-border">
                        {sortedRows.map((row, i) => (
                            <div
                                key={rowKey(row, i)}
                                onClick={onRowClick ? () => onRowClick(row) : undefined}
                                className={`p-4 ${onRowClick ? "cursor-pointer active:bg-ap-blue-50/60" : ""}`}
                            >
                                {mobileCard(row, i)}
                            </div>
                        ))}
                    </div>
                    <div className="hidden md:block">{tableEl}</div>
                </>
            ) : (
                tableEl
            )}
            {!error && !isEmpty && pagination && <Pagination {...pagination} />}
            {footer}
        </div>
    );
}
