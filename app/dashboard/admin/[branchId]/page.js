"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import * as XLSX from "xlsx";

async function api(url) {
    const res = await fetch(url);
    const json = await res.json();
    if (!res.ok) {
        if (res.status === 401) { window.location.replace("/login"); return new Promise(() => {}); }
        throw new Error(json.message || "Request failed");
    }
    if (!json.success) throw new Error(json.message || "Request failed");
    return json.data;
}

function StatBox({ label, value, color = "text-[#003087]" }) {
    return (
        <div className="bg-white border border-[#E0E0E0] rounded-xl p-4 text-center">
            <p className={`text-[28px] font-black ${color}`}>{value}</p>
            <p className="text-[11px] text-[#999999] font-bold uppercase tracking-wider mt-1">{label}</p>
        </div>
    );
}

// Format an ISO timestamp for the spreadsheet (date-only, locale-stable).
function fmtDate(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toISOString().slice(0, 10);
}

// Round to 2dp for display, preserving null/undefined.
function fmtScore(v) {
    if (v === null || v === undefined) return "";
    const n = Number(v);
    if (Number.isNaN(n)) return "";
    return Math.round(n * 100) / 100;
}

export default function BranchSummaryPage() {
    const { branchId } = useParams();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [downloading, setDownloading] = useState(false);
    const [downloadError, setDownloadError] = useState("");

    useEffect(() => {
        api(`/api/admin/branches/${branchId}/summary`)
            .then(setData)
            .catch(e => setError(e.message))
            .finally(() => setLoading(false));
    }, [branchId]);

    const downloadOngoing = async () => {
        setDownloading(true);
        setDownloadError("");
        try {
            const payload = await api(`/api/admin/branches/${branchId}/export/ongoing`);
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
                "S4 Working Hours": fmtScore(e.stage4.hrEval?.workingHours),
                "S4 Combined": fmtScore(e.stage4.hrEval?.combinedScore),
                "S4 HR At": fmtDate(e.stage4.hrEval?.submittedAt),

                "S4 Shortlisted": e.stage4.shortlisted ? "Yes" : "No",
                "S4 Rank": e.stage4.shortlistRank ?? "",

                "Winner": e.isWinner ? "Yes" : "",
            }));

            const ws = XLSX.utils.json_to_sheet(rows);
            // Auto-size columns based on widest content per column.
            if (rows.length > 0) {
                ws["!cols"] = Object.keys(rows[0]).map(key => ({
                    wch: Math.max(key.length, ...rows.map(r => String(r[key] ?? "").length)) + 2,
                }));
            }

            const meta = [
                { Field: "Branch", Value: payload.branch?.name || "" },
                { Field: "Branch Type", Value: payload.branch?.branchType || "" },
                { Field: "Quarter", Value: payload.quarter?.name || "" },
                { Field: "Quarter Status", Value: payload.quarter?.status || "" },
                { Field: "Exported At", Value: payload.exportedAt || "" },
                { Field: "Total Employees", Value: rows.length },
            ];
            const wsMeta = XLSX.utils.json_to_sheet(meta);
            wsMeta["!cols"] = [{ wch: 18 }, { wch: 40 }];

            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, wsMeta, "Info");
            XLSX.utils.book_append_sheet(wb, ws, "Pipeline");

            const branchSlug = payload.branch?.slug || payload.branch?.name?.replace(/\s+/g, "_") || "branch";
            const qName = (payload.quarter?.name || "quarter").replace(/[^A-Za-z0-9_-]+/g, "_");
            const today = new Date().toISOString().slice(0, 10);
            XLSX.writeFile(wb, `OngoingEvaluation_${branchSlug}_${qName}_${today}.xlsx`);
        } catch (e) {
            setDownloadError(e.message || "Download failed");
        } finally {
            setDownloading(false);
        }
    };

    if (loading) return <div className="text-center py-12 text-gray-500">Loading summary...</div>;
    if (error) return <div className="p-4 bg-red-50 text-red-700 rounded-lg font-medium">{error}</div>;
    if (!data) return null;

    const { counts, quarter } = data;

    return (
        <div className="space-y-6">
            {/* Quarter bar with download action */}
            {quarter && (
                <div className="bg-white border border-[#E0E0E0] rounded-xl p-4 flex items-center justify-between gap-3 flex-wrap">
                    <div>
                        <p className="text-[11px] text-[#999999] font-bold uppercase tracking-wider">Active Quarter</p>
                        <p className="text-[18px] font-bold text-[#003087]">{quarter.name}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={downloadOngoing}
                            disabled={downloading}
                            className="min-h-[40px] px-4 py-2 bg-[#00843D] hover:bg-[#006B32] disabled:opacity-60 disabled:cursor-not-allowed text-white text-[13px] font-bold rounded-lg cursor-pointer transition-colors"
                        >
                            {downloading ? "Preparing..." : "Download Ongoing Evaluation (.xlsx)"}
                        </button>
                        <span className="px-3 py-1 rounded-full text-[12px] font-bold bg-green-100 text-green-700 border border-green-200">
                            {quarter.status}
                        </span>
                    </div>
                </div>
            )}

            {downloadError && (
                <div className="p-3 rounded-lg text-sm border bg-[#FFEBEE] border-[#EF9A9A] text-[#D32F2F]">
                    {downloadError}
                </div>
            )}

            {/* Core summary — Employees + Departments. HOD assignment is owned
                by the Branch Manager of BIG branches (not Admin), so no HOD
                count card here. BM/CM/HR/Committee counts live on the dedicated
                Org Structure sub-page. */}
            <div className="grid grid-cols-2 sm:grid-cols-2 gap-3">
                <StatBox label="Employees" value={counts.employees} />
                <StatBox label="Departments" value={counts.departments} />
            </div>

            {/* Stage progress */}
            {quarter && (
                <div className="bg-white border border-[#E0E0E0] rounded-xl p-5">
                    <h3 className="text-[16px] font-bold text-[#003087] mb-4">Evaluation Pipeline</h3>
                    <div className="space-y-3">
                        {[
                            { label: "Stage 1 — Self Assessment", count: counts.stage1, color: "bg-blue-500" },
                            { label: "Stage 2 — BM/HOD Evaluation", count: counts.stage2, color: "bg-emerald-500" },
                            { label: "Stage 3 — CM Evaluation", count: counts.stage3, color: "bg-orange-500" },
                            { label: "Stage 4 — HR Evaluation", count: counts.stage4, color: "bg-purple-500" },
                            { label: "Winners", count: counts.winners, color: "bg-[#00843D]" },
                        ].map(stage => (
                            <div key={stage.label} className="flex items-center gap-3">
                                <div className={`w-2.5 h-2.5 rounded-full ${stage.color} shrink-0`} />
                                <span className="text-[13px] font-medium text-[#333333] flex-1">{stage.label}</span>
                                <span className="text-[15px] font-black text-[#003087] tabular-nums">{stage.count}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {!quarter && (
                <div className="bg-[#F5F5F5] border border-[#E0E0E0] rounded-xl p-8 text-center">
                    <span className="text-3xl block mb-3 opacity-50">📅</span>
                    <h3 className="font-bold text-[#333333] mb-1">No Active Quarter</h3>
                    <p className="text-sm text-[#666666]">Start a new quarter from the Quarter Management page to see evaluation progress.</p>
                </div>
            )}
        </div>
    );
}
