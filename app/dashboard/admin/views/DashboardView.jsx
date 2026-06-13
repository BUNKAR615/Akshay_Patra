"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "../../../../lib/clientApi";
import { getAutoQuarterName } from "../../../../lib/quarterUtils";
import { Stat, Alert, ProgressBar } from "../../../../components/ui";
import { AP, SEMANTIC } from "../../../../components/ui/tokens";
import QuarterCountdown from "../../../../components/QuarterCountdown";

// Stage accent ramp — shared meaning with PipelineView (Self → HR).
const STAGE_META = [
    { key: "s1", label: "Self", color: SEMANTIC.primary.DEFAULT },
    { key: "s2", label: "BM / HOD", color: SEMANTIC.success.DEFAULT },
    { key: "s3", label: "Cluster", color: AP.orange },
    { key: "s4", label: "HR", color: SEMANTIC.danger.DEFAULT },
];

/**
 * One branch's stage-by-stage progress as a responsive card — replaces the old
 * 1200px-wide table with its cryptic In/Ev/Cl/Pe legend. Four mini progress
 * meters (Self → HR), each showing evaluated / in-stage + cleared.
 */
function BranchProgressRow({ b }) {
    const expected = b.branchType === "BIG" ? 4 : 3;
    const stages = [
        { total: b.totalEmployees, evaluated: b.stage1.submitted, cleared: b.stage1.shortlisted },
        { total: b.stage1.shortlisted, evaluated: b.stage2.evaluated || 0, cleared: b.stage2.shortlisted },
        { total: b.stage2.shortlisted, evaluated: b.stage3.evaluated || 0, cleared: b.stage3.shortlisted },
        { total: b.stage3.shortlisted, evaluated: b.stage4.evaluated || 0, cleared: b.stage4.shortlisted },
    ];
    return (
        <div className="border border-ap-border rounded-xl p-3 sm:p-4">
            <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                    <span className="font-bold text-gray-900 truncate">{b.branchName}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${b.branchType === "BIG" ? "bg-ap-blue-50 text-ap-blue border-ap-blue-100" : "bg-ap-bg text-gray-600 border-ap-border"}`}>{b.branchType}</span>
                </div>
                <span className="text-[11px] font-bold text-gray-500 whitespace-nowrap">
                    {b.totalEmployees} employees
                    <span className="mx-1.5 text-gray-300">·</span>
                    Winners <span className={b.winners.length >= expected ? "text-success-700" : "text-warning-700"}>{b.winners.length}/{expected}</span>
                </span>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                {stages.map((s, i) => {
                    const meta = STAGE_META[i];
                    const started = s.total > 0;
                    const evaluated = Math.min(s.evaluated, s.total);
                    const pct = started ? Math.round((evaluated / s.total) * 100) : 0;
                    return (
                        <div key={meta.key} className="rounded-lg border border-ap-border bg-ap-bg/60 px-2.5 py-2">
                            <div className="flex items-center justify-between mb-1.5">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{meta.label}</span>
                                <span className="text-[11px] font-bold tabular-nums text-gray-700">{started ? `${evaluated}/${s.total}` : "—"}</span>
                            </div>
                            <ProgressBar value={pct} color={meta.color} height={5} />
                            <p className="text-[10px] text-gray-400 mt-1 m-0">{started ? `${s.cleared} cleared` : "Not started"}</p>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

/** Admin command center: alerts, quarter status, KPI strip, branch progress, activity. */
export default function DashboardView({
    quarterProgress,
    progressLoading,
    quarters,
    selectedQuarterId,
    setSelectedQuarterId,
    activeQuarterId,
    quarterLoading,
    quarterMsg,
    onRequestClose,
    onRequestStartAuto,
    onRefresh,
}) {
    const [dismissedAlerts, setDismissedAlerts] = useState([]);
    const [activity, setActivity] = useState([]);
    const [report, setReport] = useState(null);

    // Recent activity feed.
    useEffect(() => {
        (async () => {
            try {
                const d = await api("/api/admin/audit-logs?page=1&limit=5");
                setActivity(d.logs || []);
            } catch (err) { console.error("[Admin] Activity fetch failed:", err); }
        })();
    }, []);

    // Auto-refresh every 60s, pinned to the selected quarter.
    useEffect(() => {
        if (!selectedQuarterId) return;
        const interval = setInterval(() => onRefresh(selectedQuarterId), 60000);
        return () => clearInterval(interval);
    }, [selectedQuarterId, onRefresh]);

    const fetchReport = async () => {
        try {
            const d = await api("/api/admin/export/quarter-report");
            setReport(d);
            return d;
        } catch {
            return null;
        }
    };

    const exportCSV = async (data) => {
        const source = data || report;
        if (!source?.employees?.length) return;
        const stageLabel = { 1: "Self Assessment", 2: "BM / HOD", 3: "Cluster Manager", 4: "HR", 5: "Committee" };
        const csvData = source.employees.map((e) => ({
            "Employee Name": e.employeeName,
            "Department": e.department,
            "Self (norm)": e.selfNorm?.toFixed(1) || "-",
            "Self Contrib": e.selfContrib?.toFixed(1) || "-",
            "Sup Contrib": e.supContrib?.toFixed(1) || "-",
            "BM Contrib": e.bmContrib?.toFixed(1) || "-",
            "CM Contrib": e.cmContrib?.toFixed(1) || "-",
            "Final Score": e.finalScore?.toFixed(1) || "-",
            "Stage Reached": stageLabel[e.stageReached] || `Stage ${e.stageReached}`,
            "Best Employee": e.isBestEmployee ? "Yes" : "No",
        }));

        const Papa = (await import("papaparse")).default;
        const csv = Papa.unparse(csvData);
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `quarter-report-${source.quarter?.name || "export"}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    };

    // Alerts derived from quarter progress (Important Alerts panel).
    const alerts = useMemo(() => {
        if (!quarterProgress) return [];
        const out = [];
        const endDate = quarterProgress.quarter?.endDate ? new Date(quarterProgress.quarter.endDate) : null;
        if (endDate) {
            const daysLeft = Math.ceil((endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            if (daysLeft > 0 && daysLeft <= 14) {
                out.push({ id: `qtr-ending-${daysLeft}`, type: daysLeft < 7 ? "warning" : "info", message: `${quarterProgress.quarter.name} ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"}.` });
            }
        }
        (quarterProgress.branches || []).forEach((b) => {
            const pending2 = (b.stage1.shortlisted || 0) - (b.stage2.evaluated || 0);
            if (pending2 > 0) out.push({ id: `s2-${b.branchId}`, type: "info", message: `${b.branchName}: ${pending2} Stage-2 evaluation${pending2 === 1 ? "" : "s"} pending.` });
        });
        return out;
    }, [quarterProgress]);
    const visibleAlerts = alerts.filter(a => !dismissedAlerts.includes(a.id));

    // Derived KPI values (computed once per progress payload).
    const kpis = useMemo(() => {
        if (!quarterProgress) return null;
        const os = quarterProgress.overallStats || {};
        const branchList = quarterProgress.branches || [];
        const branchCount = branchList.length;
        const bigCount = branchList.filter((b) => b.branchType === "BIG").length;
        const totalEmp = os.totalEmployees || 0;
        const submitted = os.totalSubmitted || 0;
        const winnerCount = os.quarterWinners?.length || branchList.reduce((s, b) => s + (b.winners?.length || 0), 0);
        return {
            totalEmp,
            submitted,
            pending: Math.max(0, totalEmp - submitted),
            completion: os.overallPercentage ?? 0,
            branchCount,
            bigCount,
            smallCount: branchCount - bigCount,
            winnerCount,
            deptCount: quarterProgress.departments?.length || 0,
        };
    }, [quarterProgress]);

    return (
        <div className="space-y-6">
            {/* Important Alerts */}
            {visibleAlerts.length > 0 && (
                <div className="space-y-2">
                    {visibleAlerts.map((a) => (
                        <Alert
                            key={a.id}
                            type={a.type}
                            message={a.message}
                            onClose={() => setDismissedAlerts((prev) => [...prev, a.id])}
                        />
                    ))}
                </div>
            )}
            {progressLoading && !quarterProgress ? (
                <div className="flex items-center justify-center h-48">
                    <div className="animate-spin h-8 w-8 border-2 border-ap-blue border-t-transparent rounded-full" />
                </div>
            ) : quarterProgress ? (
                <>
                    {/* Quarter Status Bar + Archive Selector */}
                    <div className="bg-white border border-ap-border shadow-card rounded-card p-3 sm:p-5 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 sm:gap-4">
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                                <label className="text-[11px] uppercase tracking-wide text-gray-500 font-bold">Quarter</label>
                                <select
                                    value={selectedQuarterId || ""}
                                    onChange={(e) => setSelectedQuarterId(e.target.value)}
                                    className="bg-white border border-gray-300 rounded-md px-2 py-1 text-base sm:text-lg font-bold text-ap-blue focus:outline-none focus:ring-2 focus:ring-ap-blue cursor-pointer"
                                    aria-label="Select quarter to view"
                                >
                                    {quarters.map((q) => (
                                        <option key={q.id} value={q.id}>
                                            {q.name}{q.status === "CLOSED" ? " — Archived" : ""}
                                        </option>
                                    ))}
                                </select>
                                <span className={`text-[10px] sm:text-xs px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full border ${quarterProgress.quarter.status === "ACTIVE" ? "bg-success-50 text-success-700 border-success-100" : "bg-gray-100 text-gray-500 border-gray-300"}`}>
                                    {quarterProgress.quarter.status}
                                </span>
                                {quarterProgress.quarter.status === "CLOSED" && (
                                    <span className="text-[10px] sm:text-xs px-2 py-0.5 rounded-full bg-gray-50 text-gray-500 border border-gray-300 font-semibold">
                                        Read-only archive
                                    </span>
                                )}
                            </div>
                            <p className="text-gray-700 text-xs sm:text-sm mt-1 font-medium m-0">
                                Started: {new Date(quarterProgress.quarter.startDate).toLocaleDateString()}
                            </p>
                        </div>
                        <QuarterCountdown quarter={quarterProgress.quarter} compact className="w-full lg:max-w-xl lg:flex-1" />
                        {quarterProgress.quarter.status === "ACTIVE" && quarterProgress.quarter.id === activeQuarterId && (
                            <button onClick={onRequestClose} disabled={quarterLoading} className="w-full sm:w-auto px-4 py-2 bg-danger hover:bg-danger-700 text-white font-bold rounded-lg text-sm transition-colors cursor-pointer shadow-sm">
                                Close Quarter
                            </button>
                        )}
                    </div>

                    {/* KPI strip — 6 command-center metrics */}
                    {kpis && (
                        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-2 sm:gap-3">
                            <Stat label="Total Employees" value={kpis.totalEmp} color={AP.dark} />
                            <Stat label="Submitted" value={kpis.submitted} sub={`of ${kpis.totalEmp}`} color={SEMANTIC.primary.DEFAULT} />
                            <Stat label="Branches" value={kpis.branchCount} sub={`${kpis.bigCount} big · ${kpis.smallCount} small`} color={SEMANTIC.info.DEFAULT} />
                            <Stat label="Completion" value={`${kpis.completion}%`} color={SEMANTIC.success.DEFAULT} />
                            <Stat label="Pending" value={kpis.pending} sub="self-assessment" color={SEMANTIC.warning.DEFAULT} />
                            <Stat
                                label="Winners"
                                value={kpis.winnerCount > 0 && kpis.deptCount > 0 ? `${kpis.winnerCount} / ${kpis.deptCount}` : kpis.winnerCount || "—"}
                                sub={kpis.winnerCount > 0 ? "declared" : "in progress"}
                                color={AP.orange}
                            />
                        </div>
                    )}

                    {/* Branch Progress Overview — responsive, replaces the wide table */}
                    {quarterProgress.branches && quarterProgress.branches.length > 0 && (
                        <div className="bg-white border border-ap-border shadow-card rounded-card p-4 sm:p-6">
                            <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
                                <div className="min-w-0">
                                    <h3 className="text-base font-bold text-gray-900 m-0">Branch Progress Overview</h3>
                                    <p className="text-[11px] text-gray-500 mt-0.5 m-0">
                                        Evaluated / in-stage per branch · <b className="text-success-700">cleared</b> = passed to the next stage.
                                    </p>
                                </div>
                                <div className="flex gap-2 shrink-0">
                                    <button
                                        type="button"
                                        onClick={() => onRefresh(selectedQuarterId)}
                                        className="h-9 px-3 inline-flex items-center gap-1.5 bg-white border border-ap-border hover:bg-gray-50 text-gray-600 text-[13px] font-bold rounded-lg cursor-pointer transition-colors"
                                    >
                                        Refresh
                                    </button>
                                    <button
                                        type="button"
                                        onClick={async () => { const d = await fetchReport(); if (d) exportCSV(d); }}
                                        className="h-9 px-3 inline-flex items-center gap-1.5 bg-white border border-ap-border hover:bg-gray-50 text-success-700 text-[13px] font-bold rounded-lg cursor-pointer transition-colors"
                                    >
                                        Export CSV
                                    </button>
                                </div>
                            </div>
                            <div className="space-y-3">
                                {quarterProgress.branches.map((b) => (
                                    <BranchProgressRow key={b.branchId} b={b} />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Recent Activity */}
                    <div className="bg-white border border-ap-border shadow-card rounded-card p-4 sm:p-6">
                        <h3 className="text-base font-bold text-gray-900 mb-3">Recent Activity</h3>
                        {activity.length === 0 ? (
                            <p className="text-sm text-gray-400 italic m-0">No recent activity.</p>
                        ) : (
                            <ul className="divide-y divide-ap-border m-0 p-0 list-none">
                                {activity.map((log) => (
                                    <li key={log.id} className="py-2.5 flex items-start gap-3">
                                        <div className="w-2 h-2 mt-1.5 rounded-full bg-ap-blue shrink-0" aria-hidden="true" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[13px] text-gray-900 m-0">
                                                <span className="font-bold">{log.user?.name || "System"}</span>
                                                <span className="text-gray-500"> · {log.action.replace(/_/g, " ").toLowerCase()}</span>
                                            </p>
                                            <p className="text-[11px] text-gray-400 mt-0.5 m-0">{new Date(log.createdAt).toLocaleString()}</p>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </>
            ) : (
                <div className="bg-white border border-ap-border rounded-card p-10 text-center shadow-card">
                    <div className="w-20 h-20 bg-ap-blue-50 rounded-full flex items-center justify-center mx-auto mb-5">
                        <span className="text-3xl" aria-hidden="true">📅</span>
                    </div>
                    <h3 className="text-xl font-bold text-ap-blue mb-2">No Active Quarter</h3>
                    <p className="text-gray-700 text-sm mb-6 max-w-md mx-auto">
                        No evaluation quarter is running. Start <span className="font-bold text-ap-blue">{getAutoQuarterName()}</span> to allow all employees to submit their self-assessments.
                    </p>

                    {quarterMsg.text && (
                        <div className={`mb-4 p-3 rounded-lg text-sm border max-w-md mx-auto ${quarterMsg.type === "success" ? "bg-success-50 border-success-100 text-success-700" : "bg-danger-50 border-danger-100 text-danger-700"}`}>{quarterMsg.text}</div>
                    )}

                    <div className="flex gap-3 justify-center flex-wrap">
                        <button
                            onClick={onRequestStartAuto}
                            disabled={quarterLoading}
                            className="min-h-[48px] px-8 py-3 bg-ap-blue hover:bg-ap-green text-white font-bold rounded-lg text-[15px] cursor-pointer transition-all shadow-md disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            {quarterLoading ? (
                                <><div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" /> Starting...</>
                            ) : (
                                <>Start {getAutoQuarterName()}</>
                            )}
                        </button>
                        <button onClick={() => onRefresh(selectedQuarterId)} className="min-h-[48px] px-6 py-3 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-bold rounded-lg text-[14px] cursor-pointer transition-colors">
                            Check Again
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
