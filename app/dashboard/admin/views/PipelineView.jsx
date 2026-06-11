"use client";

import { useEffect, useState } from "react";
import { api } from "../../../../lib/clientApi";
import { fmtDate, fmtScore } from "../../../../lib/quarterUtils";
import StageDetailModal from "../../../../components/admin/StageDetailModal";

/** Pipeline tab — per-branch stage drill-down, ongoing-eval export, winners list. */
export default function PipelineView({ quarterProgress, progressLoading, branches, selectedQuarterId }) {
    const [exportBranchId, setExportBranchId] = useState("");
    const [exportLoading, setExportLoading] = useState(false);
    const [exportError, setExportError] = useState("");
    const [stageDetail, setStageDetail] = useState(null);
    const [pipelineWinners, setPipelineWinners] = useState(null);
    const [pipelineWinnersLoading, setPipelineWinnersLoading] = useState(false);

    // Branch winners — identical data the committee sees via /api/committee/results.
    useEffect(() => {
        if (!selectedQuarterId) return;
        let alive = true;
        setPipelineWinnersLoading(true);
        api(`/api/committee/results?quarterId=${encodeURIComponent(selectedQuarterId)}`)
            .then(d => { if (alive) setPipelineWinners(d); })
            .catch(() => { if (alive) setPipelineWinners(null); })
            .finally(() => { if (alive) setPipelineWinnersLoading(false); });
        return () => { alive = false; };
    }, [selectedQuarterId]);

    // Build XLSX of the ongoing evaluation pipeline for a single branch.
    const downloadOngoingForBranch = async () => {
        if (!exportBranchId) {
            setExportError("Please select a branch first.");
            return;
        }
        setExportLoading(true);
        setExportError("");
        try {
            const XLSX = await import("xlsx");
            const qs = selectedQuarterId ? `?quarterId=${encodeURIComponent(selectedQuarterId)}` : "";
            const payload = await api(`/api/admin/branches/${exportBranchId}/export/ongoing${qs}`);
            const rows = (payload.employees || []).map((e, i) => ({
                "S.No": i + 1,
                "Emp Code": e.empCode || "",
                "Name": e.name,
                "Department": e.department || "",
                "Designation": e.designation || "",
                "Collar": e.collarType || "",
                "Current Stage": e.isWinner ? "WINNER" : (e.currentStage || 0),

                "S1 Submitted": e.stage1.submitted ? "Yes" : "No",
                "S1 Raw": fmtScore(e.stage1.rawScore),
                "S1 Normalized": fmtScore(e.stage1.normalizedScore),
                "S1 Submitted At": fmtDate(e.stage1.submittedAt),
                "S1 Shortlisted": e.stage1.shortlisted ? "Yes" : "No",
                "S1 Rank": e.stage1.shortlistRank ?? "",

                "S2 BM Evaluator": e.stage2.bmEval ? `${e.stage2.bmEval.evaluatorName} (${e.stage2.bmEval.evaluatorEmpCode})` : "",
                "S2 BM Raw": fmtScore(e.stage2.bmEval?.rawScore),
                "S2 BM Normalized": fmtScore(e.stage2.bmEval?.normalizedScore),
                "S2 BM Combined": fmtScore(e.stage2.bmEval?.combinedScore),
                "S2 BM At": fmtDate(e.stage2.bmEval?.submittedAt),

                "S2 HOD Evaluator": e.stage2.hodEval ? `${e.stage2.hodEval.evaluatorName} (${e.stage2.hodEval.evaluatorEmpCode})` : "",
                "S2 HOD Raw": fmtScore(e.stage2.hodEval?.rawScore),
                "S2 HOD Normalized": fmtScore(e.stage2.hodEval?.normalizedScore),
                "S2 HOD Combined": fmtScore(e.stage2.hodEval?.combinedScore),
                "S2 HOD At": fmtDate(e.stage2.hodEval?.submittedAt),

                "S2 Shortlisted": e.stage2.shortlisted ? "Yes" : "No",
                "S2 Rank": e.stage2.shortlistRank ?? "",
                "S2 Combined Score": fmtScore(e.stage2.shortlistCombinedScore),

                "S3 CM Evaluator": e.stage3.cmEval ? `${e.stage3.cmEval.evaluatorName} (${e.stage3.cmEval.evaluatorEmpCode})` : "",
                "S3 CM Raw": fmtScore(e.stage3.cmEval?.rawScore),
                "S3 CM Normalized": fmtScore(e.stage3.cmEval?.normalizedScore),
                "S3 CM Final": fmtScore(e.stage3.cmEval?.finalScore),
                "S3 CM At": fmtDate(e.stage3.cmEval?.submittedAt),

                "S3 Shortlisted": e.stage3.shortlisted ? "Yes" : "No",
                "S3 Rank": e.stage3.shortlistRank ?? "",
                "S3 Combined Score": fmtScore(e.stage3.shortlistCombinedScore),

                "S4 HR Evaluator": e.stage4.hrEval ? `${e.stage4.hrEval.evaluatorName} (${e.stage4.hrEval.evaluatorEmpCode})` : "",
                "S4 HR Score": fmtScore(e.stage4.hrEval?.hrScore),
                "S4 Attendance %": fmtScore(e.stage4.hrEval?.attendancePct),
                "S4 Punctuality %": fmtScore(e.stage4.hrEval?.workingHours),
                "S4 Combined": fmtScore(e.stage4.hrEval?.combinedScore),
                "S4 HR At": fmtDate(e.stage4.hrEval?.submittedAt),

                "S4 Shortlisted": e.stage4.shortlisted ? "Yes" : "No",
                "S4 Rank": e.stage4.shortlistRank ?? "",

                "Winner": e.isWinner ? "Yes" : "",
            }));

            const ws = XLSX.utils.json_to_sheet(rows);
            if (rows.length > 0) {
                ws["!cols"] = Object.keys(rows[0]).map(k => ({
                    wch: Math.max(k.length, ...rows.map(r => String(r[k] ?? "").length)) + 2,
                }));
            }

            const wsMeta = XLSX.utils.json_to_sheet([
                { Field: "Branch", Value: payload.branch?.name || "" },
                { Field: "Branch Type", Value: payload.branch?.branchType || "" },
                { Field: "Quarter", Value: payload.quarter?.name || "" },
                { Field: "Quarter Status", Value: payload.quarter?.status || "" },
                { Field: "Exported At", Value: payload.exportedAt || "" },
                { Field: "Total Employees", Value: rows.length },
            ]);
            wsMeta["!cols"] = [{ wch: 18 }, { wch: 40 }];

            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, wsMeta, "Info");
            XLSX.utils.book_append_sheet(wb, ws, "Pipeline");

            const slug = payload.branch?.slug || payload.branch?.name?.replace(/\s+/g, "_") || "branch";
            const qName = (payload.quarter?.name || "quarter").replace(/[^A-Za-z0-9_-]+/g, "_");
            const today = new Date().toISOString().slice(0, 10);
            XLSX.writeFile(wb, `OngoingEvaluation_${slug}_${qName}_${today}.xlsx`);
        } catch (e) {
            setExportError(e.message || "Download failed");
        } finally {
            setExportLoading(false);
        }
    };

    // Combined PDF of every branch's winners.
    const downloadAllWinnersPDF = async () => {
        if (!pipelineWinners?.branches?.length) return;
        const { jsPDF } = await import("jspdf");
        const autoTable = (await import("jspdf-autotable")).default;
        const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
        const pageW = doc.internal.pageSize.getWidth();

        doc.setFillColor(245, 124, 0); doc.rect(0, 0, pageW, 54, "F"); doc.setTextColor(255, 255, 255);
        doc.setFontSize(15); doc.setFont(undefined, "bold");
        doc.text("Akshaya Patra — Branch Winners (All Branches)", 36, 26);
        doc.setFontSize(9); doc.setFont(undefined, "normal");
        const qn = pipelineWinners.quarter?.name || "";
        doc.text(`Quarter: ${qn}   •   Generated: ${new Date().toLocaleString()}`, 36, 42);

        const sc = (w, n) => {
            const v = w.stages?.find(s => s.stage === n)?.score;
            return (v === null || v === undefined) ? "" : String(Math.round(v * 100) / 100);
        };
        const head = [["#", "Name", "Emp Code", "Department", "Cat.", "S1", "S2", "S3", "S4", "Final"]];

        let startY = 70;
        let totalWinners = 0;
        const ph = doc.internal.pageSize.getHeight();
        pipelineWinners.branches.forEach((b) => {
            const rows = b.winners || [];
            totalWinners += rows.length;

            if (startY > ph - 90) { doc.addPage(); startY = 50; }

            doc.setFillColor(255, 243, 224); doc.rect(36, startY - 12, pageW - 72, 20, "F");
            doc.setTextColor(193, 92, 0); doc.setFontSize(11); doc.setFont(undefined, "bold");
            doc.text(`${b.branchName}  (${b.branchType})`, 42, startY + 2);
            doc.setFontSize(9); doc.setFont(undefined, "normal"); doc.setTextColor(120, 120, 120);
            doc.text(`${rows.length} / ${b.expectedCount} winners`, pageW - 42, startY + 2, { align: "right" });
            startY += 16;

            const body = rows.map((w) => [
                w.rank, w.name, w.empCode || "", w.department || "",
                w.collarType === "WHITE_COLLAR" ? "WC" : "BC",
                sc(w, 1), sc(w, 2), sc(w, 3), sc(w, 4),
                w.finalScore === null || w.finalScore === undefined ? "" : String(Math.round(w.finalScore * 100) / 100),
            ]);

            autoTable(doc, {
                head, body, startY,
                styles: { fontSize: 8, cellPadding: 3, textColor: [33, 37, 41], lineColor: [200, 200, 200], lineWidth: 0.4 },
                headStyles: { fillColor: [245, 124, 0], textColor: [255, 255, 255], fontStyle: "bold" },
                alternateRowStyles: { fillColor: [255, 248, 235] },
                theme: "grid",
                margin: { left: 36, right: 36 },
            });
            startY = doc.lastAutoTable.finalY + 22;
        });

        const pages = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pages; i++) {
            doc.setPage(i);
            doc.setFontSize(8); doc.setTextColor(120, 120, 120);
            doc.text(`Page ${i} / ${pages}`, pageW - 60, ph - 18);
            doc.text(`${totalWinners} winners · ${pipelineWinners.branches.length} branches`, 36, ph - 18);
        }

        const fname = `Branch_Winners_All_${(qn || "quarter").replace(/[^A-Za-z0-9_-]+/g, "_")}_${new Date().toISOString().slice(0, 10)}.pdf`;
        doc.save(fname);
    };

    return (
        <div className="space-y-6">
            {/* Download Ongoing Evaluation — branch picker + Excel export */}
            <div className="bg-white border border-ap-border rounded-card p-5 shadow-card">
                <div className="flex items-start sm:items-center gap-3 flex-col sm:flex-row sm:justify-between">
                    <div>
                        <h3 className="text-[16px] font-bold text-ap-blue m-0">Download Ongoing Evaluation</h3>
                        <p className="text-[12px] text-gray-500 mt-0.5 m-0">
                            Select a branch to download the live evaluation pipeline (Stage 1–4 scores, evaluator names, shortlist status) as an Excel file.
                        </p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        <select
                            value={exportBranchId}
                            onChange={e => { setExportBranchId(e.target.value); setExportError(""); }}
                            aria-label="Branch to export"
                            className="min-h-[40px] border border-gray-300 rounded-lg px-3 py-2 text-[13px] font-medium bg-white"
                        >
                            <option value="">Select a branch…</option>
                            {branches.map(b => (
                                <option key={b.id} value={b.slug || b.id}>{b.name}</option>
                            ))}
                        </select>
                        <button
                            onClick={downloadOngoingForBranch}
                            disabled={exportLoading || !exportBranchId}
                            className="min-h-[40px] px-4 py-2 bg-ap-green hover:bg-ap-green-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-[13px] font-bold rounded-lg cursor-pointer transition-colors"
                        >
                            {exportLoading ? "Preparing…" : "Download (.xlsx)"}
                        </button>
                    </div>
                </div>
                {exportError && (
                    <div className="mt-3 p-2 rounded-lg text-[12px] border bg-[#FFEBEE] border-[#EF9A9A] text-[#D32F2F]">
                        {exportError}
                    </div>
                )}
            </div>

            {!quarterProgress ? (
                <div className="bg-white border border-ap-border rounded-card p-8 text-center text-sm text-gray-500">
                    {progressLoading ? "Loading pipeline..." : "No active quarter."}
                </div>
            ) : (
                <>
                    <h2 className="text-xl font-bold text-ap-blue">Evaluation Pipeline</h2>
                    <p className="text-[12px] text-gray-500 -mt-2">
                        <span className="font-bold text-ap-blue">Click any stage</span> to open its detailed view — totals, evaluator details &amp; answer scripts.
                        {" "}<span className="font-bold text-ap-blue">Evaluated</span> = scored so far ·
                        {" "}<span className="font-bold text-ap-green">Cleared</span> = passed to the next stage ·
                        {" "}<span className="font-bold text-[#E65100]">Pending</span> = still awaiting evaluation.
                    </p>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {(quarterProgress.branches || []).map((b) => {
                            const stages = [
                                { n: 1, label: "Stage 1 — Self", color: "#003087", total: b.totalEmployees, evaluated: b.stage1.submitted, cleared: b.stage1.shortlisted },
                                { n: 2, label: "Stage 2 — BM/HOD", color: "#00843D", total: b.stage1.shortlisted, evaluated: b.stage2.evaluated || 0, cleared: b.stage2.shortlisted },
                                { n: 3, label: "Stage 3 — CM", color: "#F7941D", total: b.stage2.shortlisted, evaluated: b.stage3.evaluated || 0, cleared: b.stage3.shortlisted },
                                { n: 4, label: "Stage 4 — HR", color: "#D32F2F", total: b.stage3.shortlisted, evaluated: b.stage4.evaluated || 0, cleared: (b.stage4.shortlisted || b.winners.length) },
                            ];
                            const winnerTarget = b.branchType === "BIG" ? 4 : 3;
                            return (
                                <div key={b.branchId} className="bg-white border border-ap-border rounded-card p-4 shadow-card">
                                    <div className="flex items-center justify-between mb-1">
                                        <h3 className="font-bold text-gray-900 m-0">{b.branchName}</h3>
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${b.branchType === "BIG" ? "bg-[#F3E5F5] text-[#6A1B9A] border-[#CE93D8]" : "bg-[#FFF8E1] text-[#F57F17] border-[#FFE082]"}`}>{b.branchType}</span>
                                    </div>
                                    <p className="text-[11px] text-gray-500 mb-3 m-0">Total employees in pipeline: <span className="font-bold text-ap-blue">{b.totalEmployees}</span></p>
                                    <div className="space-y-2.5">
                                        {stages.map((s) => {
                                            const started = s.total > 0;
                                            const pending = Math.max(0, s.total - s.evaluated);
                                            const pct = started ? Math.min(100, Math.round((s.evaluated / s.total) * 100)) : 0;
                                            return (
                                                <button
                                                    key={s.label}
                                                    type="button"
                                                    onClick={() => setStageDetail({ branch: b, stage: s.n })}
                                                    className="w-full text-left border border-gray-100 rounded-lg p-2.5 cursor-pointer hover:border-[#CFD8E6] hover:shadow-sm hover:bg-[#FAFBFE] transition-all focus:outline-none focus:ring-2 focus:ring-ap-blue/20 bg-white"
                                                    style={{ borderLeft: `3px solid ${s.color}` }}
                                                    title={`View ${s.label} details`}
                                                >
                                                    <div className="flex items-center justify-between mb-1.5">
                                                        <span className="text-[12px] font-bold text-gray-700">{s.label}</span>
                                                        {started ? (
                                                            <span className="text-[12px] text-gray-500"><span className="font-black text-[18px] align-middle" style={{ color: s.color }}>{s.total}</span> in stage</span>
                                                        ) : (
                                                            <span className="text-[10px] font-bold text-gray-400 bg-gray-50 border border-ap-border px-1.5 py-0.5 rounded-full">Not started</span>
                                                        )}
                                                    </div>
                                                    {started && (
                                                        <>
                                                            <div className="grid grid-cols-3 gap-1.5 mb-1.5">
                                                                <div className="text-center bg-[#F5F7FA] rounded-md py-1">
                                                                    <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400 leading-none m-0">Evaluated</p>
                                                                    <p className="text-[15px] font-black leading-tight mt-0.5 m-0" style={{ color: s.color }}>{s.evaluated}</p>
                                                                </div>
                                                                <div className="text-center bg-[#F1F8E9] rounded-md py-1">
                                                                    <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400 leading-none m-0">Cleared</p>
                                                                    <p className="text-[15px] font-black leading-tight mt-0.5 text-ap-green m-0">{s.cleared}</p>
                                                                </div>
                                                                <div className="text-center bg-[#FFF3E0] rounded-md py-1">
                                                                    <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400 leading-none m-0">Pending</p>
                                                                    <p className="text-[15px] font-black leading-tight mt-0.5 text-[#E65100] m-0">{pending}</p>
                                                                </div>
                                                            </div>
                                                            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                                                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: s.color }} />
                                                            </div>
                                                        </>
                                                    )}
                                                </button>
                                            );
                                        })}

                                        {/* Winners — opens this branch's winners with its own download. */}
                                        <button
                                            type="button"
                                            onClick={() => setStageDetail({ branch: b, stage: 5 })}
                                            className="w-full text-left border border-[#FFE0B2] rounded-lg p-2.5 cursor-pointer hover:border-[#FFCC80] hover:shadow-sm hover:bg-[#FFFDF7] transition-all focus:outline-none focus:ring-2 focus:ring-[#F57C00]/30 bg-white"
                                            style={{ borderLeft: "3px solid #F57C00" }}
                                            title="View & download this branch's winners"
                                        >
                                            <div className="flex items-center justify-between">
                                                <span className="text-[12px] font-bold text-gray-700">🏆 Winners</span>
                                                <span className="text-[12px] text-gray-500"><span className="font-black text-[18px] align-middle text-[#F57C00]">{b.winners.length}</span> / {winnerTarget} selected</span>
                                            </div>
                                            <p className="text-[10px] text-gray-400 mt-1 m-0">Click to view &amp; download this branch&apos;s winners list</p>
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </>
            )}

            {/* Branch Winners — same list the committee sees */}
            <div className="bg-gradient-to-r from-[#FFF8E1] to-[#FFF3E0] border border-[#FFCC80] rounded-card p-4 sm:p-6 shadow-card">
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                    <h2 className="text-lg font-bold text-[#F57C00] flex items-center gap-2 m-0"><span className="text-xl" aria-hidden="true">🏆</span> Branch Winners</h2>
                    <div className="flex items-center gap-2 flex-wrap">
                        {pipelineWinners?.total ? <span className="text-[12px] font-bold text-[#F57C00] bg-white/70 border border-[#FFE0B2] px-2.5 py-1 rounded-full">{pipelineWinners.total} declared</span> : null}
                        {pipelineWinners?.branches?.length ? (
                            <button
                                onClick={downloadAllWinnersPDF}
                                className="text-[12px] font-bold px-3 py-1.5 rounded-lg bg-[#D32F2F] hover:bg-[#B71C1C] text-white cursor-pointer transition-colors flex items-center gap-1.5"
                            >
                                ⬇ Download PDF (All Branches)
                            </button>
                        ) : null}
                    </div>
                </div>
                {pipelineWinnersLoading && !pipelineWinners ? (
                    <p className="text-sm text-gray-400 m-0">Loading winners…</p>
                ) : !pipelineWinners?.branches?.length ? (
                    <p className="text-sm text-gray-400 italic m-0">No winners declared yet. Evaluation in progress.</p>
                ) : (
                    <div className="space-y-4">
                        {pipelineWinners.branches.map((b) => (
                            <div key={b.branchId} className="bg-white/80 border border-[#FFE0B2] rounded-lg p-3 sm:p-4">
                                <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
                                    <p className="text-[13px] font-bold text-[#F57C00] m-0">{b.branchName} <span className="text-[10px] font-medium text-gray-500">· {b.branchType}</span></p>
                                    <span className="text-[11px] font-bold text-gray-500">{b.winners.length} / {b.expectedCount} selected</span>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-[12px] min-w-[560px]">
                                        <thead>
                                            <tr className="text-[10px] uppercase tracking-wider text-gray-400 border-b border-[#FFE0B2]">
                                                <th className="py-1.5 pr-2 font-bold">#</th>
                                                <th className="py-1.5 pr-2 font-bold">Name</th>
                                                <th className="py-1.5 pr-2 font-bold">Department</th>
                                                <th className="py-1.5 pr-2 font-bold">Category</th>
                                                <th className="py-1.5 px-1 font-bold text-right">S1</th>
                                                <th className="py-1.5 px-1 font-bold text-right">S2</th>
                                                <th className="py-1.5 px-1 font-bold text-right">S3</th>
                                                <th className="py-1.5 px-1 font-bold text-right">S4</th>
                                                <th className="py-1.5 pl-2 font-bold text-right">Final</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {b.winners.map((w) => {
                                                const sc = (n) => {
                                                    const v = w.stages?.find(s => s.stage === n)?.score;
                                                    return (v === null || v === undefined || v === "") ? "—" : fmtScore(v);
                                                };
                                                const isWC = w.collarType === "WHITE_COLLAR";
                                                return (
                                                    <tr key={w.empCode || w.name} className="border-b border-[#FFF3E0] last:border-0">
                                                        <td className="py-1.5 pr-2 font-black text-[#F57C00]">{w.rank}</td>
                                                        <td className="py-1.5 pr-2">
                                                            <span className="font-bold text-gray-900">{w.name}</span>
                                                            {w.empCode ? <span className="text-gray-400"> · {w.empCode}</span> : null}
                                                            {w.designation ? <div className="text-[10px] text-gray-400">{w.designation}</div> : null}
                                                        </td>
                                                        <td className="py-1.5 pr-2 text-gray-500">{w.department || "—"}</td>
                                                        <td className="py-1.5 pr-2">
                                                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold border"
                                                                style={{ backgroundColor: isWC ? "#E3F2FD" : "#E8F5E9", color: isWC ? "#003087" : "#00843D", borderColor: isWC ? "#90CAF9" : "#A5D6A7" }}>
                                                                {isWC ? "WC" : "BC"}
                                                            </span>
                                                        </td>
                                                        <td className="py-1.5 px-1 text-right tabular-nums text-gray-500">{sc(1)}</td>
                                                        <td className="py-1.5 px-1 text-right tabular-nums text-gray-500">{sc(2)}</td>
                                                        <td className="py-1.5 px-1 text-right tabular-nums text-gray-500">{sc(3)}</td>
                                                        <td className="py-1.5 px-1 text-right tabular-nums text-gray-500">{sc(4)}</td>
                                                        <td className="py-1.5 pl-2 text-right font-black text-ap-blue tabular-nums">{fmtScore(w.finalScore) || "—"}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {stageDetail && (
                <StageDetailModal
                    branch={stageDetail.branch}
                    stage={stageDetail.stage}
                    quarterId={selectedQuarterId}
                    onClose={() => setStageDetail(null)}
                />
            )}
        </div>
    );
}
