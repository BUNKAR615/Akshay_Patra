"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "../../../../lib/clientApi";
import { getAutoQuarterName } from "../../../../lib/quarterUtils";
import { Stat, Alert } from "../../../../components/ui";
import QuarterCountdown from "../../../../components/QuarterCountdown";

// Quick-access tile — pure presentation, onClick is a tab-switch or export handler.
function QuickAction({ label, sub, color = "#003087", onClick, icon }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="group bg-white border border-ap-border hover:border-ap-blue/40 hover:shadow-card-hover rounded-card p-3 sm:p-4 text-left transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-ap-blue/20"
        >
            <span className="w-9 h-9 rounded-lg flex items-center justify-center mb-2" style={{ backgroundColor: `${color}14`, color }} aria-hidden="true">
                {icon}
            </span>
            <span className="block text-[13px] font-bold text-gray-900 group-hover:text-ap-blue transition-colors">{label}</span>
            {sub && <span className="block text-[11px] text-gray-400 mt-0.5">{sub}</span>}
        </button>
    );
}

/** Admin overview tab: quarter status, KPI strip, quick access, branch progress, winners, activity. */
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
    onNavigate,
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

    // Alerts derived from quarter progress.
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

    return (
        <div className="space-y-6">
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
                                <span className={`text-[10px] sm:text-xs px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full border ${quarterProgress.quarter.status === "ACTIVE" ? "bg-ap-blue-50 text-ap-blue border-[#90CAF9]" : "bg-[#FFEBEE] text-[#D32F2F] border-[#EF9A9A]"}`}>
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
                            <button onClick={onRequestClose} disabled={quarterLoading} className="w-full sm:w-auto px-4 py-2 bg-[#D32F2F] hover:bg-[#B71C1C] text-white font-bold rounded-lg text-sm transition-colors cursor-pointer shadow-sm">
                                Close Quarter
                            </button>
                        )}
                    </div>

                    {/* KPI strip */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
                        <Stat
                            label="Total Employees"
                            value={quarterProgress.overallStats.totalEmployees}
                            color="#1A1A2E"
                        />
                        <Stat
                            label="Submitted"
                            value={quarterProgress.overallStats.totalSubmitted}
                            color="#003087"
                            sub={`of ${quarterProgress.overallStats.totalEmployees}`}
                        />
                        <Stat
                            label="Completion"
                            value={`${quarterProgress.overallStats.overallPercentage}%`}
                            color="#00843D"
                        />
                        <Stat
                            label="Winners"
                            value={
                                quarterProgress.overallStats.quarterWinners?.length > 0
                                    ? `${quarterProgress.overallStats.quarterWinners.length} / ${quarterProgress.departments.length}`
                                    : "—"
                            }
                            color="#F7941D"
                            sub={quarterProgress.overallStats.quarterWinners?.length > 0 ? undefined : "In progress"}
                        />
                    </div>

                    {/* Quick Access */}
                    <div>
                        <h3 className="text-[12px] font-bold uppercase tracking-wider text-gray-400 mb-2">Quick Access</h3>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                            <QuickAction
                                label="Employees"
                                sub="Directory, add & edit"
                                color="#003087"
                                onClick={() => onNavigate("employees")}
                                icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 10-4-4 4 4 0 004 4zm6-4a3 3 0 11-3-3" /></svg>}
                            />
                            <QuickAction
                                label="Pipeline"
                                sub="Stage-wise progress"
                                color="#00843D"
                                onClick={() => onNavigate("pipeline")}
                                icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>}
                            />
                            <QuickAction
                                label="Reports"
                                sub="Quarter summaries"
                                color="#F7941D"
                                onClick={() => onNavigate("reports")}
                                icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>}
                            />
                            <QuickAction
                                label="Branches"
                                sub="Manage & import"
                                color="#6A1B9A"
                                onClick={() => onNavigate("branches")}
                                icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>}
                            />
                            <QuickAction
                                label="Questions"
                                sub="Question bank"
                                color="#0369A1"
                                onClick={() => onNavigate("questions")}
                                icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                            />
                            <QuickAction
                                label="Audit Logs"
                                sub="Activity history"
                                color="#374151"
                                onClick={() => onNavigate("logs")}
                                icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                            />
                            <QuickAction
                                label="Export CSV"
                                sub="Quarter report"
                                color="#00843D"
                                onClick={async () => { const d = await fetchReport(); if (d) exportCSV(d); }}
                                icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>}
                            />
                            <QuickAction
                                label="Refresh"
                                sub="Reload live data"
                                color="#003087"
                                onClick={() => onRefresh(selectedQuarterId)}
                                icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>}
                            />
                        </div>
                    </div>

                    {/* Branch-wise Stage Progress */}
                    {quarterProgress.branches && quarterProgress.branches.length > 0 && (
                        <div className="bg-white border border-ap-border shadow-card rounded-card p-4 sm:p-6">
                            <h3 className="text-lg font-bold text-ap-blue mb-1 flex items-center gap-2">
                                Branch-wise Stage Progress
                            </h3>
                            <p className="text-[11px] text-gray-500 mb-4 leading-relaxed">
                                Each stage shows <b className="text-gray-900">In</b> (in stage) ·
                                {" "}<b className="text-ap-blue">Ev</b> (evaluated) ·
                                {" "}<b className="text-ap-green">Cl</b> (cleared) ·
                                {" "}<b className="text-[#E65100]">Pe</b> (pending).
                                {" "}Employees cleared in one stage flow into the next stage&apos;s <b className="text-gray-900">In</b> count.
                            </p>
                            <div className="overflow-x-auto">
                                <table className="w-full text-[12px] border-collapse min-w-[1200px]">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="text-left px-3 py-2 font-bold text-gray-700">Branch</th>
                                            <th className="text-left px-3 py-2 font-bold text-gray-700">Type</th>
                                            <th className="text-right px-3 py-2 font-bold text-gray-700">Employees</th>
                                            <th className="text-right px-3 py-2 font-bold text-ap-blue">Stage 1<br /><span className="text-[9px] font-medium text-gray-500">Self assessment</span></th>
                                            <th className="text-right px-3 py-2 font-bold text-ap-blue">Stage 2<br /><span className="text-[9px] font-medium text-gray-500">BM / HOD</span></th>
                                            <th className="text-right px-3 py-2 font-bold text-ap-blue">Stage 3<br /><span className="text-[9px] font-medium text-gray-500">Cluster Manager</span></th>
                                            <th className="text-right px-3 py-2 font-bold text-ap-blue">Stage 4<br /><span className="text-[9px] font-medium text-gray-500">HR</span></th>
                                            <th className="text-center px-3 py-2 font-bold text-[#F57C00]">Winners<br /><span className="text-[9px] font-medium text-gray-500">(of expected)</span></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {quarterProgress.branches.map((b) => {
                                            const expected = b.branchType === "BIG" ? 4 : 3;
                                            const stages = [
                                                { total: b.totalEmployees, evaluated: b.stage1.submitted, cleared: b.stage1.shortlisted },
                                                { total: b.stage1.shortlisted, evaluated: b.stage2.evaluated || 0, cleared: b.stage2.shortlisted },
                                                { total: b.stage2.shortlisted, evaluated: b.stage3.evaluated || 0, cleared: b.stage3.shortlisted },
                                                { total: b.stage3.shortlisted, evaluated: b.stage4.evaluated || 0, cleared: b.stage4.shortlisted },
                                            ];
                                            return (
                                                <tr key={b.branchId} className="border-t border-ap-border hover:bg-[#FAFCFF]">
                                                    <td className="px-3 py-2 font-bold text-gray-900">{b.branchName}</td>
                                                    <td className="px-3 py-2">
                                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${b.branchType === "BIG" ? "bg-[#F3E5F5] text-[#6A1B9A] border-[#CE93D8]" : "bg-[#FFF8E1] text-[#F57F17] border-[#FFE082]"}`}>{b.branchType}</span>
                                                    </td>
                                                    <td className="px-3 py-2 text-right font-bold">{b.totalEmployees}</td>
                                                    {stages.map((s, i) => {
                                                        const started = s.total > 0;
                                                        const evaluated = Math.min(s.evaluated, s.total);
                                                        const pending = Math.max(0, s.total - evaluated);
                                                        return (
                                                            <td key={i} className="px-3 py-2 text-right">
                                                                {started ? (
                                                                    <span className="inline-flex items-center gap-1 whitespace-nowrap text-[11px]">
                                                                        <span className="text-gray-400">In <b className="text-gray-900">{s.total}</b></span>
                                                                        <span className="text-gray-200">·</span>
                                                                        <span className="text-gray-400">Ev <b className="text-ap-blue">{evaluated}</b></span>
                                                                        <span className="text-gray-200">·</span>
                                                                        <span className="text-gray-400">Cl <b className="text-ap-green">{s.cleared}</b></span>
                                                                        <span className="text-gray-200">·</span>
                                                                        <span className="text-gray-400">Pe <b className="text-[#E65100]">{pending}</b></span>
                                                                    </span>
                                                                ) : (
                                                                    <span className="text-[10px] text-gray-300">Not started</span>
                                                                )}
                                                            </td>
                                                        );
                                                    })}
                                                    <td className="px-3 py-2 text-center">
                                                        <span className={`font-bold ${b.winners.length >= expected ? "text-ap-green" : "text-[#F57C00]"}`}>{b.winners.length} / {expected}</span>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Branch Winners List */}
                    <div className="bg-gradient-to-r from-[#FFF8E1] to-[#FFF3E0] border border-[#FFCC80] rounded-card p-4 sm:p-6 shadow-card">
                        <h3 className="text-lg font-bold text-[#F57C00] mb-3 flex items-center gap-2">
                            <span className="text-xl" aria-hidden="true">🏆</span> Branch Winners
                        </h3>
                        {quarterProgress.branches && quarterProgress.branches.some(b => b.winners.length > 0) ? (
                            <div className="space-y-3">
                                {quarterProgress.branches.filter(b => b.winners.length > 0).map(b => (
                                    <div key={b.branchId} className="bg-white/80 border border-[#FFE0B2] rounded-lg p-3">
                                        <p className="text-[13px] font-bold text-[#F57C00] mb-2 m-0">{b.branchName} <span className="text-[10px] font-medium text-gray-500">· {b.branchType === "BIG" ? "4 expected" : "3 expected"}</span></p>
                                        <div className="flex flex-wrap gap-2">
                                            {b.winners.map((w, i) => (
                                                <span key={w.id} className="text-[11px] font-bold px-2 py-1 rounded-full border"
                                                    style={{ backgroundColor: w.collarType === "WHITE_COLLAR" ? "#E3F2FD" : "#E8F5E9", color: w.collarType === "WHITE_COLLAR" ? "#003087" : "#00843D", borderColor: w.collarType === "WHITE_COLLAR" ? "#90CAF9" : "#A5D6A7" }}>
                                                    {i + 1}. {w.name} · {w.collarType === "WHITE_COLLAR" ? "WC" : "BC"}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-gray-400 italic m-0">No winners declared yet. Evaluation in progress.</p>
                        )}
                    </div>

                    {/* Recent Activity */}
                    <div className="bg-white border border-ap-border shadow-card rounded-card p-4 sm:p-6">
                        <h3 className="text-lg font-bold text-ap-blue mb-3">Recent Activity</h3>
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

                    {/* Department-level progress lives in the per-branch dashboard */}
                    <div className="bg-gray-50 border border-ap-border rounded-card p-5 text-center">
                        <p className="text-sm text-gray-500 m-0">
                            Department-level progress has moved into each branch&apos;s dashboard. Pick a branch from the dropdown at the top to see its evaluation pipeline.
                        </p>
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
                        <div className={`mb-4 p-3 rounded-lg text-sm border max-w-md mx-auto ${quarterMsg.type === "success" ? "bg-[#E8F5E9] border-[#A5D6A7] text-[#1B5E20]" : "bg-[#FFEBEE] border-[#EF9A9A] text-[#D32F2F]"}`}>{quarterMsg.text}</div>
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
