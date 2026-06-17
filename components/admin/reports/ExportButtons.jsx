"use client";

import { useState } from "react";
import { activeFilterSummary } from "./helpers.js";
import { makeFileBase, exportExcel, exportCSV, exportPDF } from "./exporters.js";

// ── Shared "Download Report" control for every Reports section ──
// Hand it the same { columns, rows } that the section renders on screen and it
// exports the live, filtered data as Excel / PDF / CSV with the project theme.
// `filters` is optional (single-record views like the answer sheet omit it).
export default function ExportButtons({ title, columns, rows, quarter, filters, label = "Download" }) {
    const [busy, setBusy] = useState("");
    const [error, setError] = useState("");

    const quarterName = quarter?.name || "—";
    const quarterStatus = quarter?.status || "";
    const filterLine = filters ? activeFilterSummary(filters) : "";
    const disabled = !rows?.length;

    const run = async (kind, fn) => {
        setBusy(kind); setError("");
        try {
            await fn({
                fileBase: makeFileBase(title, quarterName),
                title, columns, rows,
                meta: [
                    { Field: "Quarter", Value: quarterName },
                    { Field: "Quarter Status", Value: quarterStatus },
                    { Field: "Filters", Value: filterLine || "None" },
                ],
                subtitle: `Quarter: ${quarterName} (${quarterStatus})   •   Generated: ${new Date().toLocaleString()}`,
                filterLine,
            });
        } catch (e) { setError(e.message || `${kind} export failed`); }
        setBusy("");
    };

    return (
        <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-2">
                {label && <span className="text-[11px] font-bold text-[#888] mr-0.5 hidden sm:inline">{label}:</span>}
                <Btn label="Excel" onClick={() => run("excel", exportExcel)} busy={busy === "excel"} disabled={disabled} color="#00843D" />
                <Btn label="PDF" onClick={() => run("pdf", exportPDF)} busy={busy === "pdf"} disabled={disabled} color="#C0392B" />
                <Btn label="CSV" onClick={() => run("csv", exportCSV)} busy={busy === "csv"} disabled={disabled} color="#003087" />
            </div>
            {error && <span className="text-[11px] text-[#C0392B] font-medium">{error}</span>}
        </div>
    );
}

function Btn({ label, onClick, busy, disabled, color }) {
    return (
        <button type="button" onClick={onClick} disabled={disabled || busy}
            className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg text-xs font-bold text-white disabled:opacity-50 transition-opacity"
            style={{ backgroundColor: color }}>
            <svg width="13" height="13" fill="none" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            {busy ? "…" : label}
        </button>
    );
}
