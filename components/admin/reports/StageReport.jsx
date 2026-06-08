"use client";

import { useMemo, useState } from "react";
import { fmtScore, fmtDate, stageScore, evaluatedAtStage } from "./helpers.js";

const STAGES = [
    { n: 1, label: "Stage 1 · Self", evaluator: null },
    { n: 2, label: "Stage 2 · BM / HOD", evaluator: (e) => e.stage2?.bmEval || e.stage2?.hodEval },
    { n: 3, label: "Stage 3 · CM", evaluator: (e) => e.stage3?.cmEval },
    { n: 4, label: "Stage 4 · HR", evaluator: (e) => e.stage4?.hrEval },
];

const stageDate = (e, n) => {
    if (n === 1) return e.stage1?.submittedAt;
    if (n === 2) return e.stage2?.bmEval?.submittedAt || e.stage2?.hodEval?.submittedAt;
    if (n === 3) return e.stage3?.cmEval?.submittedAt;
    if (n === 4) return e.stage4?.hrEval?.submittedAt;
    return null;
};
const stageShortlisted = (e, n) => {
    if (n === 1) return e.stage1?.shortlisted;
    if (n === 2) return e.stage2?.shortlisted;
    if (n === 3) return e.stage3?.shortlisted;
    if (n === 4) return e.stage4?.shortlisted;
    return false;
};

// ── By Stage: who was evaluated at the selected stage ──
export default function StageReport({ employees, onSelect }) {
    const [stage, setStage] = useState(1);
    const def = STAGES.find(s => s.n === stage);

    const rows = useMemo(
        () => employees.filter(e => evaluatedAtStage(e, stage)),
        [employees, stage]
    );

    return (
        <div className="space-y-4">
            <div className="bg-white border border-[#E0E0E0] shadow-sm rounded-xl p-4">
                <div className="flex flex-wrap gap-2">
                    {STAGES.map(s => (
                        <button key={s.n} type="button" onClick={() => setStage(s.n)}
                            className={`px-4 py-2 rounded-lg text-xs font-bold border transition-colors ${stage === s.n
                                ? "bg-[#003087] text-white border-[#003087]"
                                : "bg-white text-[#444] border-[#DDD] hover:bg-[#F5F5F5]"}`}>
                            {s.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="bg-white border border-[#E0E0E0] shadow-sm rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-[#EEE]">
                    <h3 className="text-[14px] font-black text-[#003087]">{def.label} <span className="text-[#999] font-bold">· {rows.length} employees evaluated</span></h3>
                </div>
                {!rows.length ? (
                    <div className="p-10 text-center text-[#888] text-sm">No employees evaluated at this stage for the current filters.</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-[12px] border-collapse">
                            <thead>
                                <tr className="bg-[#003087] text-white">
                                    <th className="px-3 py-2.5 text-left font-bold">#</th>
                                    <th className="px-3 py-2.5 text-left font-bold">Employee</th>
                                    <th className="px-3 py-2.5 text-left font-bold">Branch</th>
                                    <th className="px-3 py-2.5 text-left font-bold">Department</th>
                                    {stage > 1 && <th className="px-3 py-2.5 text-left font-bold">Evaluated By</th>}
                                    <th className="px-3 py-2.5 text-right font-bold">Score</th>
                                    <th className="px-3 py-2.5 text-left font-bold">Shortlisted</th>
                                    <th className="px-3 py-2.5 text-left font-bold">Date</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((e, i) => {
                                    const ev = def.evaluator ? def.evaluator(e) : null;
                                    return (
                                        <tr key={e.userId} onClick={() => onSelect(e)}
                                            className={`border-b border-[#EEE] cursor-pointer hover:bg-[#EEF3FB] ${i % 2 ? "bg-[#F7FAFF]" : "bg-white"}`}>
                                            <td className="px-3 py-2 text-[#999]">{i + 1}</td>
                                            <td className="px-3 py-2 font-bold text-[#003087] underline decoration-dotted">{e.name}</td>
                                            <td className="px-3 py-2 text-[#555]">{e.branchName}</td>
                                            <td className="px-3 py-2 text-[#555]">{e.department}</td>
                                            {stage > 1 && <td className="px-3 py-2 text-[#555]">{ev?.evaluatorName || "—"}{ev?.evaluatorEmpCode ? ` (${ev.evaluatorEmpCode})` : ""}</td>}
                                            <td className="px-3 py-2 text-right tabular-nums text-[#333] font-bold">{fmtScore(stageScore(e, stage)) || "—"}</td>
                                            <td className="px-3 py-2">{stageShortlisted(e, stage)
                                                ? <span className="px-2 py-0.5 rounded-full bg-[#E9F7EF] text-[#00843D] text-[11px] font-bold">Yes</span>
                                                : <span className="text-[#999]">No</span>}</td>
                                            <td className="px-3 py-2 text-[#888]">{fmtDate(stageDate(e, stage)) || "—"}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
