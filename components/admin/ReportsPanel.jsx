"use client";

import { useState, useEffect, useMemo } from "react";
import {
    api, evaluatedByRole,
} from "./reports/helpers.js";
import ReportCharts from "./reports/ReportCharts.jsx";
import EvaluatorReport from "./reports/EvaluatorReport.jsx";
import StageReport from "./reports/StageReport.jsx";
import DetailedTables from "./reports/DetailedTables.jsx";
import AnswerSheet from "./reports/AnswerSheet.jsx";
import ScoreSheetModal from "./reports/ScoreSheetModal.jsx";

const BLANK_FILTERS = {
    branch: "", department: "", search: "", stage: "", evaluatorRole: "", collar: "",
};

const SECTIONS = [
    { id: "charts", label: "Charts" },
    { id: "answersheet", label: "Answer Sheet" },
    { id: "evaluator", label: "By Evaluator" },
    { id: "stage", label: "By Stage" },
    { id: "tables", label: "Detailed Tables" },
];

export default function ReportsPanel({ can = () => true }) {
    const [quarters, setQuarters] = useState([]);
    const [selectedQuarterId, setSelectedQuarterId] = useState(null);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    // Only the report sections the operator was granted (reports.<id>). ADMIN
    // gets all (can() returns true).
    const visibleSections = useMemo(() => SECTIONS.filter((s) => can(`reports.${s.id}`)), [can]);
    const [section, setSection] = useState(visibleSections[0]?.id || "charts");
    const [filters, setFilters] = useState(BLANK_FILTERS);
    const [sheetEmp, setSheetEmp] = useState(null);

    // Keep the active section within what's visible.
    useEffect(() => {
        if (visibleSections.length && !visibleSections.some((s) => s.id === section)) {
            setSection(visibleSections[0].id);
        }
    }, [visibleSections, section]);

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

    const deptOptions = useMemo(() => {
        const list = data?.departments || [];
        const scoped = filters.branch ? list.filter(d => d.branch === filters.branch) : list;
        // Filtering is name-based, so collapse same-named departments across branches.
        return [...new Set(scoped.map(d => d.name))];
    }, [data, filters.branch]);

    // ── Apply filters to the employee universe ──
    const filtered = useMemo(() => {
        const q = filters.search.trim().toLowerCase();
        return employees.filter(e => {
            if (filters.branch && e.branchName !== filters.branch) return false;
            if (filters.department && e.department !== filters.department) return false;
            if (filters.collar && e.collarType !== filters.collar) return false;
            if (q) {
                const hay = `${e.name} ${e.empCode}`.toLowerCase();
                if (!hay.includes(q)) return false;
            }
            if (filters.stage) {
                if (filters.stage === "final") { if (!e.isWinner) return false; }
                else if ((e.currentStage || 0) < Number(filters.stage)) return false;
            }
            if (filters.evaluatorRole) {
                if (!evaluatedByRole(e, filters.evaluatorRole)) return false;
            }
            return true;
        });
    }, [employees, filters]);

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

    const toneBg = (tone) =>
        tone === "green" ? "bg-[#E9F7EF] border-[#A7D7B8]" :
        tone === "orange" ? "bg-[#FEF3E2] border-[#F4C98A]" : "bg-[#E8EEF9] border-[#A9C0E8]";
    const toneText = (tone) =>
        tone === "green" ? "text-[#00843D]" : tone === "orange" ? "text-[#C76A00]" : "text-[#003087]";

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
                    <select value={selectedQuarterId || ""} onChange={(e) => setSelectedQuarterId(e.target.value)}
                        className="h-10 px-3 bg-[#F5F5F5] border border-[#CCC] rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#003087]/20">
                        {quarters.map(q => <option key={q.id} value={q.id}>{q.name}{q.status === "ACTIVE" ? " (Active)" : ""}</option>)}
                    </select>
                </div>

                {/* Section selector */}
                <div className="flex flex-wrap gap-2 mt-4">
                    {visibleSections.map(s => (
                        <button key={s.id} type="button" onClick={() => setSection(s.id)}
                            className={`px-4 py-2 rounded-lg text-xs font-bold border transition-colors ${section === s.id
                                ? "bg-[#003087] text-white border-[#003087]"
                                : "bg-white text-[#444] border-[#DDD] hover:bg-[#F5F5F5]"}`}>
                            {s.label}
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
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    <FilterInput label="Employee (name / code)" value={filters.search} onChange={v => setFilter("search", v)} placeholder="Type to search…" />
                    <FilterSelect label="Branch" value={filters.branch} onChange={v => { setFilter("branch", v); setFilter("department", ""); }}
                        options={[["", "All Branches"], ...(data?.branches || []).map(b => [b.name, b.name])]} />
                    <FilterSelect label="Department" value={filters.department} onChange={v => setFilter("department", v)}
                        options={[["", "All Departments"], ...deptOptions.map(name => [name, name])]} />
                    <FilterSelect label="Employee Category" value={filters.collar} onChange={v => setFilter("collar", v)}
                        options={[["", "All"], ["WHITE_COLLAR", "White Collar"], ["BLUE_COLLAR", "Blue Collar"]]} />
                    <FilterSelect label="Stage" value={filters.stage} onChange={v => setFilter("stage", v)}
                        options={[["", "Any Stage"], ["1", "Stage 1+"], ["2", "Stage 2+"], ["3", "Stage 3+"], ["4", "Stage 4"], ["final", "Final / Winners"]]} />
                    <FilterSelect label="Evaluator Role" value={filters.evaluatorRole} onChange={v => setFilter("evaluatorRole", v)}
                        options={[["", "All Roles"], ["BM", "BM"], ["CM", "CM"], ["HOD", "HOD"], ["HR", "HR Personnel"]]} />
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

            {/* Active section */}
            {loading ? (
                <div className="bg-white border border-[#E0E0E0] rounded-xl p-10 text-center text-[#888] text-sm">Loading live data…</div>
            ) : error ? (
                <div className="bg-white border border-[#E0E0E0] rounded-xl p-10 text-center text-[#C0392B] text-sm font-medium">{error}</div>
            ) : (
                <>
                    {section === "charts" && <ReportCharts employees={filtered} quarter={data?.quarter} />}
                    {section === "answersheet" && <AnswerSheet employees={filtered} quarter={data?.quarter} />}
                    {section === "evaluator" && <EvaluatorReport employees={filtered} quarter={data?.quarter} filters={filters} onSelect={setSheetEmp} />}
                    {section === "stage" && <StageReport employees={filtered} quarter={data?.quarter} filters={filters} onSelect={setSheetEmp} />}
                    {section === "tables" && <DetailedTables employees={filtered} filters={filters} quarter={data?.quarter} onSelect={setSheetEmp} />}
                </>
            )}

            <ScoreSheetModal emp={sheetEmp} quarter={data?.quarter} onClose={() => setSheetEmp(null)} />
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
