"use client";

import { useMemo, useState } from "react";
import {
    fmtScore, fmtDate, collarLabel, stageLabel, rowScore, rowLatestDate, activeFilterSummary,
    reachedStage, completedStage, passedStage, evalStatus,
} from "./helpers.js";

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
    const [busy, setBusy] = useState("");
    const [error, setError] = useState("");

    const quarterName = quarter?.name || "—";
    const quarterStatus = quarter?.status || "";

    const report = useMemo(() => buildReport(reportType, employees), [reportType, employees]);

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

            // Header band (blue theme)
            doc.setFillColor(0, 48, 135); doc.rect(0, 0, pageW, 54, "F"); doc.setTextColor(255, 255, 255);
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
                styles: { fontSize: 7.5, cellPadding: 3, textColor: [33, 37, 41], lineColor: [200, 200, 200], lineWidth: 0.4 },
                headStyles: { fillColor: [0, 48, 135], textColor: [255, 255, 255], fontStyle: "bold" },
                alternateRowStyles: { fillColor: [240, 244, 250] },
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
                    <div className="flex items-center gap-2">
                        <DownloadBtn label="Excel" onClick={exportExcel} busy={busy === "excel"} disabled={!report.rows.length} color="#00843D" />
                        <DownloadBtn label="PDF" onClick={exportPDF} busy={busy === "pdf"} disabled={!report.rows.length} color="#C0392B" />
                        <DownloadBtn label="CSV" onClick={exportCSV} busy={busy === "csv"} disabled={!report.rows.length} color="#003087" />
                    </div>
                </div>

                {error ? (
                    <div className="p-4 text-center text-[#C0392B] text-sm font-medium">{error}</div>
                ) : null}

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
