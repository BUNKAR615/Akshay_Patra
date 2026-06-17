"use client";

import { useMemo, useState } from "react";
import {
    fmtScore, fmtDate, collarLabel, stageLabel, rowScore, rowLatestDate,
    reachedStage, completedStage, passedStage, evalStatus,
} from "./helpers.js";
import ExportButtons from "./ExportButtons.jsx";

const REPORT_TYPES = [
    { id: "employees", label: "Employee List" },
    { id: "fullsheet", label: "Full Evaluation Sheet" },
    { id: "stage", label: "Stage-wise Progress" },
    { id: "branch", label: "Branch-wise" },
    { id: "department", label: "Department-wise" },
    { id: "evaluator", label: "Evaluator-wise" },
    { id: "role", label: "Role-wise" },
];

// ── Detailed tabular reports + Excel/PDF/CSV export (fixed blue theme) ──
export default function DetailedTables({ employees, filters, quarter, onSelect }) {
    const [reportType, setReportType] = useState("employees");

    const report = useMemo(() => buildReport(reportType, employees), [reportType, employees]);

    // Rows that map 1:1 to an employee are clickable → score sheet.
    const rowEmp = (r) => (reportType === "employees" || reportType === "fullsheet") ? r._emp : null;

    return (
        <div className="space-y-4">
            {/* Report type selector */}
            <div className="bg-white border border-[#E0E0E0] shadow-sm rounded-xl p-4">
                <div className="flex flex-wrap gap-2">
                    {REPORT_TYPES.map(rt => (
                        <button key={rt.id} type="button" onClick={() => setReportType(rt.id)}
                            className={`px-3 py-2 rounded-lg text-xs font-bold border transition-colors ${reportType === rt.id
                                ? "bg-[#003087] text-white border-[#003087]"
                                : "bg-white text-[#444] border-[#DDD] hover:bg-[#F5F5F5]"}`}>
                            {rt.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Results */}
            <div className="bg-white border border-[#E0E0E0] shadow-sm rounded-xl overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-[#EEE]">
                    <h3 className="text-[14px] font-black text-[#003087]">{report.title} <span className="text-[#999] font-bold">· {report.rows.length} rows</span></h3>
                    <ExportButtons title={report.title} columns={report.columns} rows={report.rows} quarter={quarter} filters={filters} />
                </div>

                {!report.rows.length ? (
                    <div className="p-10 text-center text-[#888] text-sm">No records match the selected filters.</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-[12px] border-collapse">
                            <thead>
                                <tr className="bg-[#003087] text-white">
                                    <th className="px-3 py-2.5 text-left font-bold whitespace-nowrap">#</th>
                                    {report.columns.map(c => (
                                        <th key={c.key} className={`px-3 py-2.5 font-bold whitespace-nowrap ${c.align === "right" ? "text-right" : "text-left"}`}>{c.label}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {report.rows.map((r, i) => {
                                    const emp = rowEmp(r);
                                    return (
                                        <tr key={i} onClick={emp ? () => onSelect(emp) : undefined}
                                            className={`border-b border-[#EEE] ${i % 2 ? "bg-[#F7FAFF]" : "bg-white"} hover:bg-[#EEF3FB] ${emp ? "cursor-pointer" : ""}`}>
                                            <td className="px-3 py-2 text-[#999]">{i + 1}</td>
                                            {report.columns.map(c => (
                                                <td key={c.key} className={`px-3 py-2 whitespace-nowrap ${c.align === "right" ? "text-right tabular-nums" : "text-left"} ${c.strong ? "font-bold text-[#222]" : "text-[#444]"}`}>
                                                    {r[c.key] ?? "—"}
                                                </td>
                                            ))}
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

// ── Report builders: each returns { title, columns, rows } ──
// Employee/Full-sheet rows carry a hidden `_emp` so they open the score sheet.
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
            { key: "branchName", label: "Branch" },
            { key: "department", label: "Department" },
            { key: "collar", label: "Category" },
            { key: "stage", label: "Current Stage" },
            { key: "status", label: "Evaluation Status" },
        ],
        rows: emps.map(e => ({
            empCode: e.empCode || "—",
            name: e.name,
            branchName: e.branchName,
            department: e.department,
            collar: collarLabel(e.collarType),
            stage: e.isWinner ? "Winner" : stageLabel(e.currentStage || 0),
            status: evalStatus(e),
            _emp: e,
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
            _emp: e,
        })),
    };
}

function buildStageProgress(emps) {
    // Cascade: passing a stage is what places an employee in the next stage's
    // "reached" total (Stage 1 passed → Stage 2 reached, and so on).
    const defs = [
        { key: 1, label: "Stage 1 · Self Assessment" },
        { key: 2, label: "Stage 2 · BM / HOD" },
        { key: 3, label: "Stage 3 · Cluster Manager" },
        { key: 4, label: "Stage 4 · HR" },
        { key: "final", label: "Final Stage · Winners" },
    ];
    const rows = defs.map(d => {
        const reached = emps.filter(e => reachedStage(e, d.key)).length;
        const completed = emps.filter(e => reachedStage(e, d.key) && completedStage(e, d.key)).length;
        const pending = reached - completed;
        const passed = emps.filter(e => passedStage(e, d.key)).length;
        return {
            stage: d.label,
            reached,
            completed,
            pending,
            passed,
            pct: reached ? `${Math.round((completed / reached) * 100)}%` : "0%",
        };
    });
    return {
        title: "Stage-wise Evaluation Progress",
        columns: [
            { key: "stage", label: "Stage", strong: true },
            { key: "reached", label: "Reached", align: "right" },
            { key: "completed", label: "Completed", align: "right" },
            { key: "pending", label: "Pending", align: "right" },
            { key: "passed", label: "Passed / Cleared", align: "right" },
            { key: "pct", label: "% Completed", align: "right" },
        ],
        rows,
    };
}

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
    const cols = [{ key: "name", label, strong: true }];
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
