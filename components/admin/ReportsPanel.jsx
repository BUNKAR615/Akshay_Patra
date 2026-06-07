"use client";

import { useState, useEffect, useMemo } from "react";

// ── Shared fetch helper (mirrors the admin dashboard's resilient fetch) ──
async function api(url, { retries = 4 } = {}) {
    let lastErr;
    for (let attempt = 0; attempt < retries; attempt++) {
        let res;
        try { res = await fetch(url); }
        catch (e) {
            lastErr = e;
            if (attempt < retries - 1) { await new Promise(r => setTimeout(r, 500 * (attempt + 1))); continue; }
            throw e;
        }
        let json = null;
        try { json = await res.json(); } catch { json = null; }
        if (res.status === 503 && attempt < retries - 1) {
            lastErr = new Error((json && json.message) || "Service starting up");
            await new Promise(r => setTimeout(r, 600 * (attempt + 1)));
            continue;
        }
        if (!res.ok || !json || !json.success) {
            const err = new Error((json && json.message) || "Request failed");
            err.status = res.status;
            throw err;
        }
        return json.data;
    }
    throw lastErr || new Error("Request failed");
}

// ── Formatters ──
const fmtScore = (v) => {
    if (v === null || v === undefined) return "";
    const n = Number(v);
    if (Number.isNaN(n)) return "";
    return Math.round(n * 100) / 100;
};
const fmtDate = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
};
const collarLabel = (ct) => ct === "WHITE_COLLAR" ? "White Collar" : ct === "BLUE_COLLAR" ? "Blue Collar" : "—";
const stageLabel = (n) => ["Not Started", "Stage 1 · Self", "Stage 2 · BM/HOD", "Stage 3 · CM", "Stage 4 · HR", "Winner"][n] || `Stage ${n}`;

// Best available score for an employee row (highest stage reached).
function rowScore(e) {
    return e.stage4?.shortlistCombinedScore ?? e.stage4?.hrEval?.combinedScore ??
        e.stage3?.shortlistCombinedScore ?? e.stage3?.cmEval?.finalScore ??
        e.stage2?.shortlistCombinedScore ?? e.stage2?.bmEval?.combinedScore ?? e.stage2?.hodEval?.combinedScore ??
        e.stage1?.normalizedScore ?? null;
}
// Latest submission date across all stages (for the date-range filter).
function rowLatestDate(e) {
    const ds = [
        e.stage1?.submittedAt, e.stage2?.bmEval?.submittedAt, e.stage2?.hodEval?.submittedAt,
        e.stage3?.cmEval?.submittedAt, e.stage4?.hrEval?.submittedAt,
    ].filter(Boolean).map(d => new Date(d).getTime()).filter(t => !Number.isNaN(t));
    return ds.length ? new Date(Math.max(...ds)) : null;
}
function rowEvaluatorCodes(e) {
    return [
        e.stage2?.bmEval?.evaluatorEmpCode, e.stage2?.hodEval?.evaluatorEmpCode,
        e.stage3?.cmEval?.evaluatorEmpCode, e.stage4?.hrEval?.evaluatorEmpCode,
    ].filter(Boolean);
}

const REPORT_TYPES = [
    { id: "employees", label: "Employee List" },
    { id: "fullsheet", label: "Full Evaluation Sheet" },
    { id: "stage", label: "Stage-wise Progress" },
    { id: "branch", label: "Branch-wise" },
    { id: "department", label: "Department-wise" },
    { id: "evaluator", label: "Evaluator-wise" },
    { id: "role", label: "Role-wise" },
];

const BLANK_FILTERS = {
    branch: "", department: "", search: "", stage: "", role: "", evaluator: "",
    status: "", collar: "", dateFrom: "", dateTo: "", scoreMin: "", scoreMax: "",
};

export default function ReportsPanel() {
    const [quarters, setQuarters] = useState([]);
    const [selectedQuarterId, setSelectedQuarterId] = useState(null);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [reportType, setReportType] = useState("employees");
    const [colored, setColored] = useState(true);
    const [filters, setFilters] = useState(BLANK_FILTERS);
    const [busy, setBusy] = useState("");

    const setFilter = (k, v) => setFilters(f => ({ ...f, [k]: v }));

    // Load quarter list once.
    useEffect(() => {
        (async () => {
            try {
                const d = await api("/api/admin/quarters/list");
                setQuarters(d.quarters || []);
                setSelectedQuarterId(prev => prev || d.activeQuarterId || d.quarters?.[0]?.id || null);
            } catch { setQuarters([]); }
        })();
    }, []);

    // Load report dataset whenever the selected quarter changes.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true); setError("");
            try {
                const qs = selectedQuarterId ? `?quarterId=${encodeURIComponent(selectedQuarterId)}` : "";
                const d = await api(`/api/admin/reports${qs}`);
                if (!cancelled) {
                    setData(d);
                    if (!selectedQuarterId && d.quarter?.id) setSelectedQuarterId(d.quarter.id);
                }
            } catch (e) {
                if (!cancelled) { setError(e.message || "Failed to load report data"); setData(null); }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [selectedQuarterId]);

    const employees = data?.employees || [];

    // Distinct role/designation list for the Role filter.
    const designations = useMemo(() => {
        const set = new Set();
        employees.forEach(e => { if (e.designation) set.add(e.designation); });
        return Array.from(set).sort();
    }, [employees]);

    // Departments scoped to the chosen branch.
    const deptOptions = useMemo(() => {
        const list = data?.departments || [];
        if (!filters.branch) return list;
        return list.filter(d => d.branch === filters.branch);
    }, [data, filters.branch]);

    // ── Apply filters to the employee universe ──
    const filtered = useMemo(() => {
        const q = filters.search.trim().toLowerCase();
        const sMin = filters.scoreMin !== "" ? Number(filters.scoreMin) : null;
        const sMax = filters.scoreMax !== "" ? Number(filters.scoreMax) : null;
        const from = filters.dateFrom ? new Date(filters.dateFrom).getTime() : null;
        const to = filters.dateTo ? new Date(filters.dateTo).getTime() + 86400000 : null;
        return employees.filter(e => {
            if (filters.branch && e.branchName !== filters.branch) return false;
            if (filters.department && e.department !== filters.department) return false;
            if (filters.collar && e.collarType !== filters.collar) return false;
            if (filters.role && e.designation !== filters.role) return false;
            if (q) {
                const hay = `${e.name} ${e.empCode} ${e.designation}`.toLowerCase();
                if (!hay.includes(q)) return false;
            }
            if (filters.stage) {
                if (filters.stage === "winner") { if (!e.isWinner) return false; }
                else if ((e.currentStage || 0) < Number(filters.stage)) return false;
            }
            if (filters.status) {
                if (filters.status === "not_started" && (e.currentStage || 0) !== 0) return false;
                if (filters.status === "in_progress" && !((e.currentStage || 0) >= 1 && !e.isWinner)) return false;
                if (filters.status === "winner" && !e.isWinner) return false;
            }
            if (filters.evaluator) {
                if (!rowEvaluatorCodes(e).includes(filters.evaluator)) return false;
            }
            if (sMin !== null || sMax !== null) {
                const sc = rowScore(e);
                if (sc === null) return false;
                if (sMin !== null && sc < sMin) return false;
                if (sMax !== null && sc > sMax) return false;
            }
            if (from !== null || to !== null) {
                const d = rowLatestDate(e);
                if (!d) return false;
                const t = d.getTime();
                if (from !== null && t < from) return false;
                if (to !== null && t >= to) return false;
            }
            return true;
        });
    }, [employees, filters]);

    // ── Build the active report's columns + rows ──
    const report = useMemo(() => buildReport(reportType, filtered), [reportType, filtered]);

    // Summary stat cards (computed off the filtered set).
    const stats = useMemo(() => {
        const total = filtered.length;
        const s1 = filtered.filter(e => e.stage1?.submitted).length;
        const winners = filtered.filter(e => e.isWinner).length;
        const inProg = filtered.filter(e => (e.currentStage || 0) >= 1 && !e.isWinner).length;
        return [
            { label: "Records", value: total, tone: "blue" },
            { label: "Self-Assessed", value: s1, tone: "green" },
            { label: "In Progress", value: inProg, tone: "orange" },
            { label: "Winners", value: winners, tone: "blue" },
        ];
    }, [filtered]);

    const quarterName = data?.quarter?.name || "—";
    const quarterStatus = data?.quarter?.status || "";

    // ── Exports ──
    const fileBase = () => {
        const t = REPORT_TYPES.find(r => r.id === reportType)?.label.replace(/\s+/g, "") || "Report";
        const q = (quarterName || "quarter").replace(/[^A-Za-z0-9_-]+/g, "_");
        return `Report_${t}_${q}_${new Date().toISOString().slice(0, 10)}`;
    };

    const exportExcel = async () => {
        setBusy("excel");
        try {
            const XLSX = await import("xlsx");
            const aoaRows = report.rows.map((r, i) => {
                const o = { "S.No": i + 1 };
                report.columns.forEach(c => { o[c.label] = r[c.key] ?? ""; });
                return o;
            });
            const ws = XLSX.utils.json_to_sheet(aoaRows);
            if (aoaRows.length) {
                ws["!cols"] = Object.keys(aoaRows[0]).map(k => ({
                    wch: Math.max(k.length, ...aoaRows.map(r => String(r[k] ?? "").length)) + 2,
                }));
            }
            const wsMeta = XLSX.utils.json_to_sheet([
                { Field: "Report", Value: report.title },
                { Field: "Quarter", Value: quarterName },
                { Field: "Quarter Status", Value: quarterStatus },
                { Field: "Filters", Value: activeFilterSummary(filters) || "None" },
                { Field: "Rows", Value: report.rows.length },
                { Field: "Exported At", Value: new Date().toISOString() },
            ]);
            wsMeta["!cols"] = [{ wch: 18 }, { wch: 50 }];
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, wsMeta, "Info");
            XLSX.utils.book_append_sheet(wb, ws, "Report");
            XLSX.writeFile(wb, `${fileBase()}.xlsx`);
        } catch (e) { setError(e.message || "Excel export failed"); }
        setBusy("");
    };

    const exportCSV = async () => {
        setBusy("csv");
        try {
            const Papa = (await import("papaparse")).default;
            const rows = report.rows.map((r, i) => {
                const o = { "S.No": i + 1 };
                report.columns.forEach(c => { o[c.label] = r[c.key] ?? ""; });
                return o;
            });
            const csv = Papa.unparse(rows);
            const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url; link.download = `${fileBase()}.csv`; link.click();
            URL.revokeObjectURL(url);
        } catch (e) { setError(e.message || "CSV export failed"); }
        setBusy("");
    };

    const exportPDF = async () => {
        setBusy("pdf");
        try {
            const { jsPDF } = await import("jspdf");
            const autoTable = (await import("jspdf-autotable")).default;
            const doc = new jsPDF({ orientation: report.columns.length > 6 ? "landscape" : "portrait", unit: "pt", format: "a4" });
            const pageW = doc.internal.pageSize.getWidth();

            // Header band
            if (colored) { doc.setFillColor(0, 48, 135); doc.rect(0, 0, pageW, 54, "F"); doc.setTextColor(255, 255, 255); }
            else { doc.setTextColor(20, 20, 20); }
            doc.setFontSize(15); doc.setFont(undefined, "bold");
            doc.text("Akshaya Patra — " + report.title, 36, 26);
            doc.setFontSize(9); doc.setFont(undefined, "normal");
            doc.text(`Quarter: ${quarterName} (${quarterStatus})   •   Generated: ${new Date().toLocaleString()}`, 36, 42);

            const filterLine = activeFilterSummary(filters);
            let startY = 66;
            if (filterLine) {
                doc.setTextColor(90, 90, 90); doc.setFontSize(8);
                doc.text(`Filters: ${filterLine}`, 36, startY);
                startY += 12;
            }

            const head = [["#", ...report.columns.map(c => c.label)]];
            const body = report.rows.map((r, i) => [i + 1, ...report.columns.map(c => String(r[c.key] ?? ""))]);

            autoTable(doc, {
                head, body, startY,
                styles: { fontSize: 7.5, cellPadding: 3, textColor: colored ? [33, 37, 41] : [20, 20, 20], lineColor: [200, 200, 200], lineWidth: 0.4 },
                headStyles: colored
                    ? { fillColor: [0, 48, 135], textColor: [255, 255, 255], fontStyle: "bold" }
                    : { fillColor: [60, 60, 60], textColor: [255, 255, 255], fontStyle: "bold" },
                alternateRowStyles: colored ? { fillColor: [240, 244, 250] } : { fillColor: [245, 245, 245] },
                theme: "grid",
                margin: { left: 36, right: 36 },
                didDrawPage: () => {
                    const ph = doc.internal.pageSize.getHeight();
                    const page = doc.internal.getNumberOfPages();
                    doc.setFontSize(8); doc.setTextColor(120, 120, 120);
                    doc.text(`Page ${page}`, pageW - 60, ph - 18);
                    doc.text(`${report.rows.length} rows`, 36, ph - 18);
                },
            });
            doc.save(`${fileBase()}.pdf`);
        } catch (e) { setError(e.message || "PDF export failed"); }
        setBusy("");
    };

    // ── Theme helpers ──
    const toneBg = (tone) => !colored ? "bg-[#F5F5F5] border-[#D0D0D0]" :
        tone === "green" ? "bg-[#E9F7EF] border-[#A7D7B8]" :
        tone === "orange" ? "bg-[#FEF3E2] border-[#F4C98A]" : "bg-[#E8EEF9] border-[#A9C0E8]";
    const toneText = (tone) => !colored ? "text-[#333]" :
        tone === "green" ? "text-[#00843D]" : tone === "orange" ? "text-[#C76A00]" : "text-[#003087]";
    const headBg = colored ? "bg-[#003087] text-white" : "bg-[#3C3C3C] text-white";

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="bg-white border border-[#E0E0E0] shadow-sm rounded-xl p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h2 className="text-[18px] font-black text-[#003087]">Reports</h2>
                        <p className="text-[12px] text-[#666] mt-0.5">Live evaluation reporting · Quarter <span className="font-bold">{quarterName}</span>
                            {quarterStatus && <span className={`ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold ${quarterStatus === "ACTIVE" ? "bg-[#E9F7EF] text-[#00843D]" : "bg-[#F0F0F0] text-[#666]"}`}>{quarterStatus}</span>}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <select value={selectedQuarterId || ""} onChange={(e) => setSelectedQuarterId(e.target.value)}
                            className="h-10 px-3 bg-[#F5F5F5] border border-[#CCC] rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#003087]/20">
                            {quarters.map(q => <option key={q.id} value={q.id}>{q.name}{q.status === "ACTIVE" ? " (Active)" : ""}</option>)}
                        </select>
                        {/* Colored / B&W toggle */}
                        <div className="flex items-center rounded-lg border border-[#CCC] overflow-hidden">
                            <button type="button" onClick={() => setColored(true)} className={`px-3 h-10 text-xs font-bold ${colored ? "bg-[#003087] text-white" : "bg-white text-[#666]"}`}>Colored</button>
                            <button type="button" onClick={() => setColored(false)} className={`px-3 h-10 text-xs font-bold ${!colored ? "bg-[#3C3C3C] text-white" : "bg-white text-[#666]"}`}>B &amp; W</button>
                        </div>
                    </div>
                </div>

                {/* Report type selector */}
                <div className="flex flex-wrap gap-2 mt-4">
                    {REPORT_TYPES.map(rt => (
                        <button key={rt.id} type="button" onClick={() => setReportType(rt.id)}
                            className={`px-3 py-2 rounded-lg text-xs font-bold border transition-colors ${reportType === rt.id
                                ? (colored ? "bg-[#003087] text-white border-[#003087]" : "bg-[#3C3C3C] text-white border-[#3C3C3C]")
                                : "bg-white text-[#444] border-[#DDD] hover:bg-[#F5F5F5]"}`}>
                            {rt.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white border border-[#E0E0E0] shadow-sm rounded-xl p-4 sm:p-5">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-[13px] font-bold text-[#333] uppercase tracking-wide">Filters</h3>
                    <button type="button" onClick={() => setFilters(BLANK_FILTERS)} className="text-xs font-bold text-[#003087] hover:underline">Clear all</button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    <FilterInput label="Search (name / code)" value={filters.search} onChange={v => setFilter("search", v)} placeholder="Type to search…" />
                    <FilterSelect label="Branch" value={filters.branch} onChange={v => { setFilter("branch", v); setFilter("department", ""); }}
                        options={[["", "All Branches"], ...(data?.branches || []).map(b => [b.name, b.name])]} />
                    <FilterSelect label="Department" value={filters.department} onChange={v => setFilter("department", v)}
                        options={[["", "All Departments"], ...deptOptions.map(d => [d.name, d.name])]} />
                    <FilterSelect label="Collar Type" value={filters.collar} onChange={v => setFilter("collar", v)}
                        options={[["", "All"], ["WHITE_COLLAR", "White Collar"], ["BLUE_COLLAR", "Blue Collar"]]} />
                    <FilterSelect label="Role / Designation" value={filters.role} onChange={v => setFilter("role", v)}
                        options={[["", "All Roles"], ...designations.map(d => [d, d])]} />
                    <FilterSelect label="Stage Reached" value={filters.stage} onChange={v => setFilter("stage", v)}
                        options={[["", "Any Stage"], ["1", "Stage 1+"], ["2", "Stage 2+"], ["3", "Stage 3+"], ["4", "Stage 4"], ["winner", "Winners only"]]} />
                    <FilterSelect label="Evaluator" value={filters.evaluator} onChange={v => setFilter("evaluator", v)}
                        options={[["", "All Evaluators"], ...(data?.evaluators || []).map(ev => [ev.empCode, `${ev.name} · ${ev.stage}`])]} />
                    <FilterSelect label="Status" value={filters.status} onChange={v => setFilter("status", v)}
                        options={[["", "All"], ["not_started", "Not Started"], ["in_progress", "In Progress"], ["winner", "Winner"]]} />
                    <FilterInput label="Date From" type="date" value={filters.dateFrom} onChange={v => setFilter("dateFrom", v)} />
                    <FilterInput label="Date To" type="date" value={filters.dateTo} onChange={v => setFilter("dateTo", v)} />
                    <FilterInput label="Min Score" type="number" value={filters.scoreMin} onChange={v => setFilter("scoreMin", v)} placeholder="0" />
                    <FilterInput label="Max Score" type="number" value={filters.scoreMax} onChange={v => setFilter("scoreMax", v)} placeholder="100" />
                </div>
            </div>

            {/* Stat cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {stats.map(s => (
                    <div key={s.label} className={`rounded-xl border p-4 ${toneBg(s.tone)}`}>
                        <div className={`text-[26px] font-black leading-none ${toneText(s.tone)}`}>{s.value}</div>
                        <div className="text-[11px] font-bold uppercase tracking-wide text-[#666] mt-1">{s.label}</div>
                    </div>
                ))}
            </div>

            {/* Results */}
            <div className="bg-white border border-[#E0E0E0] shadow-sm rounded-xl overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-[#EEE]">
                    <h3 className="text-[14px] font-black text-[#003087]">{report.title} <span className="text-[#999] font-bold">· {report.rows.length} rows</span></h3>
                    <div className="flex items-center gap-2">
                        <DownloadBtn label="Excel" onClick={exportExcel} busy={busy === "excel"} disabled={!report.rows.length} color="#00843D" />
                        <DownloadBtn label="PDF" onClick={exportPDF} busy={busy === "pdf"} disabled={!report.rows.length} color="#C0392B" />
                        <DownloadBtn label="CSV" onClick={exportCSV} busy={busy === "csv"} disabled={!report.rows.length} color="#003087" />
                    </div>
                </div>

                {loading ? (
                    <div className="p-10 text-center text-[#888] text-sm">Loading live data…</div>
                ) : error ? (
                    <div className="p-10 text-center text-[#C0392B] text-sm font-medium">{error}</div>
                ) : !report.rows.length ? (
                    <div className="p-10 text-center text-[#888] text-sm">No records match the selected filters.</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-[12px] border-collapse">
                            <thead>
                                <tr className={headBg}>
                                    <th className="px-3 py-2.5 text-left font-bold whitespace-nowrap">#</th>
                                    {report.columns.map(c => (
                                        <th key={c.key} className={`px-3 py-2.5 font-bold whitespace-nowrap ${c.align === "right" ? "text-right" : "text-left"}`}>{c.label}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {report.rows.map((r, i) => (
                                    <tr key={i} className={`border-b border-[#EEE] ${colored ? (i % 2 ? "bg-[#F7FAFF]" : "bg-white") : (i % 2 ? "bg-[#F7F7F7]" : "bg-white")} hover:bg-[#EEF3FB]`}>
                                        <td className="px-3 py-2 text-[#999]">{i + 1}</td>
                                        {report.columns.map(c => (
                                            <td key={c.key} className={`px-3 py-2 whitespace-nowrap ${c.align === "right" ? "text-right tabular-nums" : "text-left"} ${c.strong ? "font-bold text-[#222]" : "text-[#444]"}`}>
                                                {c.render ? c.render(r[c.key], r, colored) : (r[c.key] ?? "—")}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Sub-components ──
function FilterInput({ label, value, onChange, type = "text", placeholder }) {
    return (
        <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold text-[#666]">{label}</span>
            <input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
                className="h-10 px-3 bg-[#F5F5F5] border border-[#CCC] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#003087]/20 focus:border-[#003087]" />
        </label>
    );
}
function FilterSelect({ label, value, onChange, options }) {
    return (
        <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold text-[#666]">{label}</span>
            <select value={value} onChange={(e) => onChange(e.target.value)}
                className="h-10 px-2 bg-[#F5F5F5] border border-[#CCC] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#003087]/20 focus:border-[#003087]">
                {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
        </label>
    );
}
function DownloadBtn({ label, onClick, busy, disabled, color }) {
    return (
        <button type="button" onClick={onClick} disabled={disabled || busy}
            className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg text-xs font-bold text-white disabled:opacity-50 transition-opacity"
            style={{ backgroundColor: color }}>
            <svg width="13" height="13" fill="none" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            {busy ? "…" : label}
        </button>
    );
}

// ── Active-filter human summary (for export metadata + PDF header) ──
function activeFilterSummary(f) {
    const parts = [];
    if (f.search) parts.push(`search="${f.search}"`);
    if (f.branch) parts.push(`branch=${f.branch}`);
    if (f.department) parts.push(`dept=${f.department}`);
    if (f.collar) parts.push(`collar=${collarLabel(f.collar)}`);
    if (f.role) parts.push(`role=${f.role}`);
    if (f.stage) parts.push(`stage=${f.stage}`);
    if (f.evaluator) parts.push(`evaluator=${f.evaluator}`);
    if (f.status) parts.push(`status=${f.status}`);
    if (f.dateFrom) parts.push(`from=${f.dateFrom}`);
    if (f.dateTo) parts.push(`to=${f.dateTo}`);
    if (f.scoreMin) parts.push(`min=${f.scoreMin}`);
    if (f.scoreMax) parts.push(`max=${f.scoreMax}`);
    return parts.join(", ");
}

// ── Report builders: each returns { title, columns:[{key,label,align?,strong?,render?}], rows:[plain objects] } ──
function buildReport(type, emps) {
    switch (type) {
        case "employees": return buildEmployeeList(emps);
        case "fullsheet": return buildFullSheet(emps);
        case "stage": return buildStageProgress(emps);
        case "branch": return buildGroup(emps, "branchName", "Branch", e => e.branchType || "");
        case "department": return buildGroup(emps, "department", "Department", e => e.branchName);
        case "evaluator": return buildEvaluator(emps);
        case "role": return buildGroup(emps, "designation", "Role / Designation", () => "");
        default: return buildEmployeeList(emps);
    }
}

function buildEmployeeList(emps) {
    return {
        title: "Employee List",
        columns: [
            { key: "empCode", label: "Emp Code" },
            { key: "name", label: "Name", strong: true },
            { key: "department", label: "Department" },
            { key: "branchName", label: "Branch" },
            { key: "designation", label: "Designation" },
            { key: "collar", label: "Collar" },
            { key: "stage", label: "Current Stage" },
        ],
        rows: emps.map(e => ({
            empCode: e.empCode || "—",
            name: e.name,
            department: e.department,
            branchName: e.branchName,
            designation: e.designation || "—",
            collar: collarLabel(e.collarType),
            stage: e.isWinner ? "Winner" : stageLabel(e.currentStage || 0),
        })),
    };
}

function buildFullSheet(emps) {
    return {
        title: "Employee Full Evaluation Sheet",
        columns: [
            { key: "empCode", label: "Emp Code" },
            { key: "name", label: "Name", strong: true },
            { key: "branchName", label: "Branch" },
            { key: "department", label: "Department" },
            { key: "collar", label: "Collar" },
            { key: "s1", label: "S1 Self", align: "right" },
            { key: "s2", label: "S2 BM/HOD", align: "right" },
            { key: "s3", label: "S3 CM", align: "right" },
            { key: "s4", label: "S4 HR", align: "right" },
            { key: "final", label: "Final", align: "right", strong: true },
            { key: "stage", label: "Stage" },
            { key: "updated", label: "Last Update" },
        ],
        rows: emps.map(e => ({
            empCode: e.empCode || "—",
            name: e.name,
            branchName: e.branchName,
            department: e.department,
            collar: collarLabel(e.collarType),
            s1: fmtScore(e.stage1?.normalizedScore),
            s2: fmtScore(e.stage2?.shortlistCombinedScore ?? e.stage2?.bmEval?.combinedScore ?? e.stage2?.hodEval?.combinedScore),
            s3: fmtScore(e.stage3?.shortlistCombinedScore ?? e.stage3?.cmEval?.finalScore),
            s4: fmtScore(e.stage4?.shortlistCombinedScore ?? e.stage4?.hrEval?.combinedScore),
            final: fmtScore(rowScore(e)),
            stage: e.isWinner ? "Winner" : stageLabel(e.currentStage || 0),
            updated: fmtDate(rowLatestDate(e)),
        })),
    };
}

function buildStageProgress(emps) {
    const total = emps.length;
    const submitted = emps.filter(e => e.stage1?.submitted).length;
    const s1 = emps.filter(e => e.stage1?.shortlisted).length;
    const s2 = emps.filter(e => e.stage2?.shortlisted).length;
    const s3 = emps.filter(e => e.stage3?.shortlisted).length;
    const s4 = emps.filter(e => e.stage4?.shortlisted).length;
    const s2e = emps.filter(e => e.stage2?.bmEval || e.stage2?.hodEval).length;
    const s3e = emps.filter(e => e.stage3?.cmEval).length;
    const s4e = emps.filter(e => e.stage4?.hrEval).length;
    const winners = emps.filter(e => e.isWinner).length;
    const pct = (n) => total ? `${Math.round((n / total) * 100)}%` : "0%";
    const rows = [
        { stage: "Stage 1 · Self Assessment", evaluated: submitted, shortlisted: s1, pct: pct(submitted) },
        { stage: "Stage 2 · BM / HOD", evaluated: s2e, shortlisted: s2, pct: pct(s2e) },
        { stage: "Stage 3 · Cluster Manager", evaluated: s3e, shortlisted: s3, pct: pct(s3e) },
        { stage: "Stage 4 · HR", evaluated: s4e, shortlisted: s4, pct: pct(s4e) },
        { stage: "Winners", evaluated: winners, shortlisted: winners, pct: pct(winners) },
    ];
    return {
        title: "Stage-wise Evaluation Progress",
        columns: [
            { key: "stage", label: "Stage", strong: true },
            { key: "evaluated", label: "Evaluated / Done", align: "right" },
            { key: "shortlisted", label: "Shortlisted", align: "right" },
            { key: "pct", label: "% of Pool", align: "right" },
        ],
        rows,
    };
}

// Generic grouping report (branch / department / role).
function buildGroup(emps, key, label, extraFn) {
    const groups = new Map();
    for (const e of emps) {
        const g = e[key] || "—";
        if (!groups.has(g)) groups.set(g, { name: g, extra: extraFn(e), total: 0, s1: 0, s2: 0, s3: 0, s4: 0, winners: 0 });
        const r = groups.get(g);
        r.total++;
        if (e.stage1?.submitted) r.s1++;
        if (e.stage2?.shortlisted) r.s2++;
        if (e.stage3?.shortlisted) r.s3++;
        if (e.stage4?.shortlisted) r.s4++;
        if (e.isWinner) r.winners++;
    }
    const cols = [
        { key: "name", label, strong: true },
    ];
    if (label === "Branch") cols.push({ key: "extra", label: "Type" });
    if (label === "Department") cols.push({ key: "extra", label: "Branch" });
    cols.push(
        { key: "total", label: "Employees", align: "right" },
        { key: "s1", label: "Self-Assessed", align: "right" },
        { key: "s2", label: "S2 Shortlist", align: "right" },
        { key: "s3", label: "S3 Shortlist", align: "right" },
        { key: "s4", label: "S4 Shortlist", align: "right" },
        { key: "winners", label: "Winners", align: "right" },
    );
    const rows = Array.from(groups.values()).sort((a, b) => b.total - a.total);
    return { title: `${label} Report`, columns: cols, rows };
}

function buildEvaluator(emps) {
    // Tally evaluations done per (evaluator, stage).
    const map = new Map();
    const bump = (code, name, stage) => {
        if (!code && !name) return;
        const k = `${code}|${stage}`;
        if (!map.has(k)) map.set(k, { name: name || "—", empCode: code || "—", stage, count: 0 });
        map.get(k).count++;
    };
    for (const e of emps) {
        if (e.stage2?.bmEval) bump(e.stage2.bmEval.evaluatorEmpCode, e.stage2.bmEval.evaluatorName, "Stage 2 (BM)");
        if (e.stage2?.hodEval) bump(e.stage2.hodEval.evaluatorEmpCode, e.stage2.hodEval.evaluatorName, "Stage 2 (HOD)");
        if (e.stage3?.cmEval) bump(e.stage3.cmEval.evaluatorEmpCode, e.stage3.cmEval.evaluatorName, "Stage 3 (CM)");
        if (e.stage4?.hrEval) bump(e.stage4.hrEval.evaluatorEmpCode, e.stage4.hrEval.evaluatorName, "Stage 4 (HR)");
    }
    return {
        title: "Evaluator-wise Report",
        columns: [
            { key: "name", label: "Evaluator", strong: true },
            { key: "empCode", label: "Emp Code" },
            { key: "stage", label: "Stage" },
            { key: "count", label: "Evaluations Done", align: "right" },
        ],
        rows: Array.from(map.values()).sort((a, b) => b.count - a.count),
    };
}
