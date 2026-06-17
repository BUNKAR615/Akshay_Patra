"use client";

import { useMemo, useState } from "react";
import { fmtScore, fmtDate, stageScore, reachedStage } from "./helpers.js";
import ExportButtons from "./ExportButtons.jsx";

// Maps each evaluator role to the stage + the eval object + score accessor.
// `pendingFor` marks an employee in this evaluator's branch who reached the
// stage but this role hasn't evaluated yet (backlog for that evaluator).
const ROLE_DEFS = [
    { role: "Branch Manager", short: "BM", stage: 2, evalOf: (e) => e.stage2?.bmEval, pendingFor: (e) => reachedStage(e, 2) && e.collarType === "WHITE_COLLAR" && !e.stage2?.bmEval },
    { role: "HOD", short: "HOD", stage: 2, evalOf: (e) => e.stage2?.hodEval, pendingFor: (e) => reachedStage(e, 2) && e.collarType === "BLUE_COLLAR" && !e.stage2?.hodEval },
    { role: "Cluster Manager", short: "CM", stage: 3, evalOf: (e) => e.stage3?.cmEval, pendingFor: (e) => reachedStage(e, 3) && !e.stage3?.cmEval },
    { role: "HR", short: "HR", stage: 4, evalOf: (e) => e.stage4?.hrEval, pendingFor: (e) => reachedStage(e, 4) && !e.stage4?.hrEval },
];

// ── By Evaluator: which BM/HOD/CM/HR evaluated which employees ──
export default function EvaluatorReport({ employees, quarter, filters, onSelect }) {
    const groups = useMemo(() => buildEvaluatorGroups(employees), [employees]);
    const [open, setOpen] = useState(() => new Set());

    const toggle = (key) => setOpen(prev => {
        const next = new Set(prev);
        next.has(key) ? next.delete(key) : next.add(key);
        return next;
    });

    // Flatten every evaluator → their evaluated employees (matches the
    // expanded on-screen rows) for a single downloadable table.
    const exportCols = [
        { key: "role", label: "Role" },
        { key: "evaluator", label: "Evaluator" },
        { key: "evaluatorCode", label: "Evaluator Code" },
        { key: "stage", label: "Stage" },
        { key: "employee", label: "Employee" },
        { key: "branchName", label: "Branch" },
        { key: "department", label: "Department" },
        { key: "score", label: "Score" },
        { key: "date", label: "Date" },
    ];
    const exportRows = useMemo(() => {
        const out = [];
        for (const def of ROLE_DEFS) {
            for (const g of groups.filter(x => x.short === def.short)) {
                for (const e of g.employees) {
                    out.push({
                        role: def.role,
                        evaluator: g.name,
                        evaluatorCode: g.empCode || "—",
                        stage: `Stage ${def.stage}`,
                        employee: e.name,
                        branchName: e.branchName,
                        department: e.department,
                        score: fmtScore(stageScore(e, def.stage)) || "—",
                        date: fmtDate(def.evalOf(e)?.submittedAt) || "—",
                    });
                }
            }
        }
        return out;
    }, [groups]);

    if (!groups.length) {
        return <div className="bg-white border border-[#E0E0E0] rounded-xl p-10 text-center text-[#888] text-sm">No evaluations recorded yet for the current filters.</div>;
    }

    return (
        <div className="space-y-5">
            <div className="bg-white border border-[#E0E0E0] shadow-sm rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-[14px] font-black text-[#003087]">By Evaluator <span className="text-[#999] font-bold">· {exportRows.length} evaluations</span></h3>
                <ExportButtons title="By Evaluator" columns={exportCols} rows={exportRows} quarter={quarter} filters={filters} />
            </div>
            {ROLE_DEFS.map(def => {
                const list = groups.filter(g => g.short === def.short);
                if (!list.length) return null;
                return (
                    <div key={def.short} className="bg-white border border-[#E0E0E0] shadow-sm rounded-xl overflow-hidden">
                        <div className="px-4 py-3 border-b border-[#EEE] flex items-center justify-between">
                            <h3 className="text-[14px] font-black text-[#003087]">{def.role} <span className="text-[#999] font-bold">· Stage {def.stage}</span></h3>
                            <span className="text-[12px] text-[#888] font-bold">{list.length} evaluator{list.length !== 1 ? "s" : ""}</span>
                        </div>
                        <div className="divide-y divide-[#F0F0F0]">
                            {list.map(g => {
                                const isOpen = open.has(g.key);
                                return (
                                    <div key={g.key}>
                                        <button type="button" onClick={() => toggle(g.key)}
                                            className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-[#F7FAFF] transition-colors">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <span className={`text-[#003087] transition-transform ${isOpen ? "rotate-90" : ""}`}>▶</span>
                                                <span className="font-bold text-[#222] truncate">{g.name}</span>
                                                {g.empCode && <span className="text-[12px] text-[#999]">{g.empCode}</span>}
                                            </div>
                                            <span className="shrink-0 flex items-center gap-1.5">
                                                <span className="px-2.5 py-1 rounded-full bg-[#E8EEF9] text-[#003087] text-[11px] font-bold">{g.employees.length} evaluated</span>
                                                {g.pending > 0 && <span className="px-2.5 py-1 rounded-full bg-[#FEF3E2] text-[#C76A00] text-[11px] font-bold">{g.pending} pending</span>}
                                            </span>
                                        </button>
                                        {isOpen && (
                                            <div className="overflow-x-auto bg-[#FBFCFE]">
                                                <table className="w-full text-[12px] border-collapse">
                                                    <thead>
                                                        <tr className="text-[#666] border-y border-[#EEE]">
                                                            <th className="px-4 py-2 text-left font-bold">Employee</th>
                                                            <th className="px-3 py-2 text-left font-bold">Branch</th>
                                                            <th className="px-3 py-2 text-left font-bold">Department</th>
                                                            <th className="px-3 py-2 text-right font-bold">Stage {def.stage} Score</th>
                                                            <th className="px-3 py-2 text-left font-bold">Date</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {g.employees.map(e => (
                                                            <tr key={e.userId} onClick={() => onSelect(e)}
                                                                className="border-b border-[#F0F0F0] cursor-pointer hover:bg-[#EEF3FB]">
                                                                <td className="px-4 py-2 font-bold text-[#003087] underline decoration-dotted">{e.name}</td>
                                                                <td className="px-3 py-2 text-[#555]">{e.branchName}</td>
                                                                <td className="px-3 py-2 text-[#555]">{e.department}</td>
                                                                <td className="px-3 py-2 text-right tabular-nums text-[#333]">{fmtScore(stageScore(e, def.stage)) || "—"}</td>
                                                                <td className="px-3 py-2 text-[#888]">{fmtDate(def.evalOf(e)?.submittedAt) || "—"}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

// Group employees under each (evaluator, role) — keeping the employee objects,
// plus a per-evaluator branch set used to compute their pending backlog.
function buildEvaluatorGroups(employees) {
    const map = new Map(); // key: `${short}|${empCode||name}`
    const add = (def, e) => {
        const ev = def.evalOf(e);
        if (!ev) return;
        const code = ev.evaluatorEmpCode || "";
        const name = ev.evaluatorName || "—";
        const key = `${def.short}|${code || name}`;
        if (!map.has(key)) map.set(key, { key, short: def.short, role: def.role, name, empCode: code, employees: [], branches: new Set(), pending: 0 });
        const g = map.get(key);
        g.employees.push(e);
        if (e.branchName) g.branches.add(e.branchName);
    };
    for (const e of employees) {
        for (const def of ROLE_DEFS) add(def, e);
    }
    // Pending = employees in this evaluator's branch(es) who reached the stage
    // but this role hasn't evaluated yet (live backlog).
    const defByShort = Object.fromEntries(ROLE_DEFS.map(d => [d.short, d]));
    for (const g of map.values()) {
        const def = defByShort[g.short];
        g.pending = employees.filter(e => g.branches.has(e.branchName) && def.pendingFor(e)).length;
    }
    return Array.from(map.values()).sort((a, b) => b.employees.length - a.employees.length);
}
