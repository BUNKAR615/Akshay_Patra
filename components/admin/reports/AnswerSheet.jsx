"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api, fmtScore, fmtDate, collarLabel, LIKERT_OPTIONS, likertOption } from "./helpers.js";

const STAGES = [
    { n: 1, label: "Stage 1 · Self" },
    { n: 2, label: "Stage 2 · BM / HOD" },
    { n: 3, label: "Stage 3 · CM" },
    { n: 4, label: "Stage 4 · HR" },
];

// ── Full question-by-question answer sheet for one employee + stage ──
export default function AnswerSheet({ employees, quarter }) {
    const [stage, setStage] = useState(1);
    const [empId, setEmpId] = useState(null);
    const [search, setSearch] = useState("");
    const [sheet, setSheet] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const reqRef = useRef(0);

    // Local search over the already-filtered employee universe.
    const list = useMemo(() => {
        const q = search.trim().toLowerCase();
        const base = q
            ? employees.filter(e => `${e.name} ${e.empCode} ${e.designation}`.toLowerCase().includes(q))
            : employees;
        return base.slice(0, 200);
    }, [employees, search]);

    const selectedEmp = useMemo(() => employees.find(e => e.userId === empId) || null, [employees, empId]);

    // Fetch the sheet whenever employee, stage or quarter changes.
    useEffect(() => {
        if (!empId) { setSheet(null); setError(""); return; }
        const myReq = ++reqRef.current;
        setLoading(true); setError("");
        const qs = new URLSearchParams({ employeeId: empId, stage: String(stage) });
        if (quarter?.id) qs.set("quarterId", quarter.id);
        api(`/api/admin/answer-sheet?${qs.toString()}`)
            .then(d => { if (myReq === reqRef.current) setSheet(d); })
            .catch(e => { if (myReq === reqRef.current) { setError(e.message || "Failed to load answer sheet"); setSheet(null); } })
            .finally(() => { if (myReq === reqRef.current) setLoading(false); });
    }, [empId, stage, quarter?.id]);

    return (
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
            {/* Picker column */}
            <div className="space-y-4">
                <div className="bg-white border border-[#E0E0E0] shadow-sm rounded-xl p-4">
                    <h3 className="text-[13px] font-bold text-[#333] uppercase tracking-wide mb-2">Stage</h3>
                    <div className="grid grid-cols-2 gap-2">
                        {STAGES.map(s => (
                            <button key={s.n} type="button" onClick={() => setStage(s.n)}
                                className={`px-3 py-2 rounded-lg text-xs font-bold border transition-colors ${stage === s.n
                                    ? "bg-[#003087] text-white border-[#003087]"
                                    : "bg-white text-[#444] border-[#DDD] hover:bg-[#F5F5F5]"}`}>
                                {s.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="bg-white border border-[#E0E0E0] shadow-sm rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="text-[13px] font-bold text-[#333] uppercase tracking-wide">Employee</h3>
                        <span className="text-[11px] text-[#999]">{list.length} shown</span>
                    </div>
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name / code…"
                        className="w-full h-9 px-3 mb-2 bg-[#F5F5F5] border border-[#CCC] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#003087]/20 focus:border-[#003087]" />
                    <p className="text-[11px] text-[#999] mb-2">Tip: use the filters above to narrow this list.</p>
                    <div className="max-h-[420px] overflow-y-auto -mx-1 px-1 divide-y divide-[#F0F0F0]">
                        {!list.length ? (
                            <div className="py-6 text-center text-[#999] text-sm">No employees match.</div>
                        ) : list.map(e => (
                            <button key={e.userId} type="button" onClick={() => setEmpId(e.userId)}
                                className={`w-full text-left px-2 py-2 rounded-lg transition-colors ${empId === e.userId ? "bg-[#E8EEF9]" : "hover:bg-[#F7FAFF]"}`}>
                                <div className="font-bold text-[13px] text-[#222] truncate">{e.name}</div>
                                <div className="text-[11px] text-[#777] truncate">{e.empCode ? `${e.empCode} · ` : ""}{e.branchName} · {e.department}</div>
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Sheet column */}
            <div className="min-w-0">
                {!empId ? (
                    <div className="bg-white border border-[#E0E0E0] rounded-xl p-12 text-center text-[#888]">
                        <div className="text-4xl mb-2">📝</div>
                        <p className="text-sm font-bold text-[#555]">Select an employee and a stage</p>
                        <p className="text-xs mt-1">Their full answer sheet for that stage will appear here.</p>
                    </div>
                ) : loading ? (
                    <div className="bg-white border border-[#E0E0E0] rounded-xl p-12 text-center text-[#888] text-sm">Loading answer sheet…</div>
                ) : error ? (
                    <div className="bg-white border border-[#E0E0E0] rounded-xl p-12 text-center text-[#C0392B] text-sm font-medium">{error}</div>
                ) : (
                    <SheetView sheet={sheet} stage={stage} emp={selectedEmp} quarter={quarter} />
                )}
            </div>
        </div>
    );
}

function SheetView({ sheet, stage, emp, quarter }) {
    const e = sheet?.employee || emp;
    const stageLabel = STAGES.find(s => s.n === stage)?.label || `Stage ${stage}`;
    const hasContent = (sheet?.sheets?.length || 0) > 0 || !!sheet?.attendance;

    return (
        <div className="space-y-4">
            {/* Identity header */}
            <div className="bg-white border border-[#E0E0E0] shadow-sm rounded-xl p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <div className="text-[17px] font-black text-[#1A1A2E]">{e?.name || "—"}</div>
                        <div className="text-[12px] text-[#666] mt-0.5">{e?.empCode ? `${e.empCode} · ` : ""}{e?.branchName} · {e?.department}</div>
                        <div className="text-[12px] text-[#666]">{e?.designation || "—"} · {collarLabel(e?.collarType)}</div>
                    </div>
                    <div className="text-right">
                        <span className="inline-block px-2.5 py-1 rounded-full text-[11px] font-bold bg-[#E8EEF9] text-[#003087]">{stageLabel}</span>
                        {quarter?.name && <div className="text-[11px] text-[#999] mt-1">Quarter: {quarter.name}</div>}
                    </div>
                </div>
            </div>

            {!hasContent ? (
                <div className="bg-white border border-[#E0E0E0] rounded-xl p-12 text-center text-[#888]">
                    <div className="text-3xl mb-2">🚫</div>
                    <p className="text-sm font-bold text-[#555]">No {stageLabel} record for this employee yet.</p>
                    <p className="text-xs mt-1">This employee has not been evaluated at this stage in {quarter?.name || "this quarter"}.</p>
                </div>
            ) : (
                <>
                    {sheet.sheets.map((s, idx) => <QuestionSheet key={idx} s={s} />)}
                    {sheet.attendance && <AttendanceSheet a={sheet.attendance} />}
                </>
            )}
        </div>
    );
}

function QuestionSheet({ s }) {
    return (
        <div className="bg-white border border-[#E0E0E0] shadow-sm rounded-xl overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-[#F6F8FC] border-b border-[#E6ECF6]">
                <div>
                    <span className="text-[13px] font-black text-[#003087]">{s.role}</span>
                    <span className="text-[12px] text-[#666] ml-2">Evaluated by <span className="font-bold text-[#333]">{s.evaluatorName}</span>{s.evaluatorEmpCode ? ` (${s.evaluatorEmpCode})` : ""}</span>
                </div>
                <div className="flex items-center gap-3 text-[12px]">
                    {s.submittedAt && <span className="text-[#888]">{fmtDate(s.submittedAt)}</span>}
                    <span className="px-2 py-0.5 rounded-full bg-[#E8EEF9] text-[#003087] font-bold">Raw {fmtScore(s.rawScore) ?? "—"}{s.maxScore ? ` / ${fmtScore(s.maxScore)}` : ""}</span>
                    {s.normalizedScore !== null && s.normalizedScore !== undefined && (
                        <span className="px-2 py-0.5 rounded-full bg-[#E9F7EF] text-[#00843D] font-bold">Norm {fmtScore(s.normalizedScore)}</span>
                    )}
                </div>
            </div>

            {!s.questions?.length ? (
                <div className="p-8 text-center text-[#999] text-sm">No question-level answers were recorded.</div>
            ) : (
                <div className="divide-y divide-[#F0F0F0]">
                    {s.questions.map(q => <QuestionRow key={q.number} q={q} />)}
                </div>
            )}
        </div>
    );
}

function QuestionRow({ q }) {
    const selected = likertOption(q.score);
    return (
        <div className="px-4 py-3">
            <div className="flex items-start gap-3">
                <span className="shrink-0 w-7 h-7 rounded-full bg-[#003087] text-white text-[12px] font-bold flex items-center justify-center">{q.number}</span>
                <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-[#222] leading-snug">{q.text}</p>
                    {q.textHindi && <p className="text-[12px] text-[#777] leading-snug mt-0.5">{q.textHindi}</p>}

                    {/* Options — the selected one is highlighted */}
                    <div className="flex flex-wrap gap-1.5 mt-2">
                        {LIKERT_OPTIONS.map(o => {
                            const isSel = o.value === q.score;
                            return (
                                <span key={o.value}
                                    style={isSel ? { background: o.color, borderColor: o.color, color: "#fff" } : { borderColor: "#DDD", color: "#888" }}
                                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-bold ${isSel ? "" : "bg-white"}`}>
                                    {isSel && <span aria-hidden>✓</span>}
                                    {o.label} ({o.value > 0 ? `+${o.value}` : o.value})
                                </span>
                            );
                        })}
                    </div>
                </div>
                <div className="shrink-0 text-right">
                    <div className="text-[10px] font-bold uppercase tracking-wide text-[#999]">Marks</div>
                    <div className="text-[18px] font-black" style={{ color: selected?.color || "#333" }}>
                        {q.score === null || q.score === undefined ? "—" : (q.score > 0 ? `+${q.score}` : q.score)}
                    </div>
                </div>
            </div>
        </div>
    );
}

function AttendanceSheet({ a }) {
    const cells = [
        { label: "Attendance %", value: fmtScore(a.attendancePct) },
        { label: "Punctuality %", value: fmtScore(a.punctualityPct) },
        { label: "Present Days", value: a.presentDays ?? "—" },
        { label: "Punctual Days", value: a.punctualDays ?? "—" },
        { label: "Working Days", value: a.workingDays ?? "—" },
        { label: "HR Marks", value: fmtScore(a.hrScore) },
    ];
    return (
        <div className="bg-white border border-[#E0E0E0] shadow-sm rounded-xl overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-[#F6F8FC] border-b border-[#E6ECF6]">
                <span className="text-[13px] font-black text-[#003087]">HR · Attendance & Punctuality</span>
                <div className="flex items-center gap-3 text-[12px]">
                    <span className="text-[#666]">By <span className="font-bold text-[#333]">{a.evaluatorName}</span>{a.evaluatorEmpCode ? ` (${a.evaluatorEmpCode})` : ""}</span>
                    {a.submittedAt && <span className="text-[#888]">{fmtDate(a.submittedAt)}</span>}
                </div>
            </div>
            <div className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
                {cells.map(c => (
                    <div key={c.label} className="rounded-lg bg-[#F6F8FC] px-3 py-2">
                        <div className="text-[10px] font-bold uppercase tracking-wide text-[#888]">{c.label}</div>
                        <div className="mt-0.5 text-[16px] font-black text-[#003087]">{c.value === "" || c.value === null || c.value === undefined ? "—" : c.value}</div>
                    </div>
                ))}
            </div>
            {(a.attendancePdfUrl || a.punctualityPdfUrl || a.referenceSheetUrl || a.notes) && (
                <div className="px-4 pb-4 flex flex-wrap items-center gap-3 text-[12px]">
                    {a.attendancePdfUrl && <a href={a.attendancePdfUrl} target="_blank" rel="noreferrer" className="text-[#003087] font-bold underline">Attendance proof</a>}
                    {a.punctualityPdfUrl && <a href={a.punctualityPdfUrl} target="_blank" rel="noreferrer" className="text-[#003087] font-bold underline">Punctuality proof</a>}
                    {a.referenceSheetUrl && <a href={a.referenceSheetUrl} target="_blank" rel="noreferrer" className="text-[#003087] font-bold underline">Reference sheet</a>}
                    {a.notes && <span className="text-[#666]">Notes: {a.notes}</span>}
                </div>
            )}
        </div>
    );
}
