"use client";

import { useState, useEffect, useCallback } from "react";
import DashboardShell from "../../../../components/DashboardShell";

async function api(url) {
    const res = await fetch(url);
    const json = await res.json();
    if (!res.ok || !json.success) throw new Error(json.message || "Request failed");
    return json.data;
}

function ProgressBar({ value, color = "from-blue-500 to-indigo-500" }) {
    return (
        <div className="w-full bg-[#E0E0E0] rounded-full h-2 overflow-hidden border border-[#CCCCCC]">
            <div
                className={`bg-gradient-to-r ${color} h-2 rounded-full transition-all duration-700 ease-out`}
                style={{ width: `${Math.min(value, 100)}%` }}
            />
        </div>
    );
}

function Badge({ yes, labelYes = "Ready", labelNo = "Pending" }) {
    return yes ? (
        <span className="text-xs px-2.5 py-1 rounded-full bg-[#E8F5E9] text-[#2E7D32] border border-[#A5D6A7] font-medium">✓ {labelYes}</span>
    ) : (
        <span className="text-xs px-2.5 py-1 rounded-full bg-[#F5F5F5] text-[#666666] border border-[#CCCCCC]">⏳ {labelNo}</span>
    );
}

export default function QuarterStatusPage() {
    const [user, setUser] = useState(null);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [lastRefresh, setLastRefresh] = useState(null);

    const fetchData = useCallback(async () => {
        try {
            const [meData, progressData] = await Promise.all([
                api("/api/auth/me"),
                api("/api/admin/quarter-progress"),
            ]);
            setUser(meData.user);
            setData(progressData);
            setLastRefresh(new Date());
            setError("");
        } catch (e) {
            setError(e.message);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 30000); // Auto-refresh every 30s
        return () => clearInterval(interval);
    }, [fetchData]);

    if (loading) {
        return (
            <DashboardShell user={user} title="Quarter Progress">
                <div className="flex items-center justify-center h-64">
                    <div className="animate-spin h-8 w-8 border-2 border-[#003087] border-t-transparent rounded-full" />
                </div>
            </DashboardShell>
        );
    }

    if (error) {
        return (
            <DashboardShell user={user} title="Quarter Progress">
                <div className="p-4 bg-[#FFEBEE] border border-[#EF9A9A] rounded-xl text-[#D32F2F] font-medium shadow-sm">{error}</div>
            </DashboardShell>
        );
    }

    const d = data;

    return (
        <DashboardShell user={user} title="Quarter Progress">
            {/* ═══ HEADER ═══ */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
                <div className="bg-white border border-[#E0E0E0] shadow-sm rounded-xl p-5 flex-1 w-full">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-[#333333] text-sm font-medium">Current Quarter</p>
                            <p className="text-2xl font-bold text-[#003087] mt-0.5">{d.quarter.name}</p>
                            <p className="text-[#666666] text-xs mt-1">
                                {new Date(d.quarter.startDate).toLocaleDateString()} → {new Date(d.quarter.endDate).toLocaleDateString()}
                            </p>
                        </div>
                        <div className="text-right">
                            <span className={`text-xs px-3 py-1.5 rounded-full border font-medium shadow-sm ${d.quarter.status === "ACTIVE" ? "bg-[#E8F5E9] text-[#2E7D32] border-[#A5D6A7]" : "bg-[#F5F5F5] text-[#666666] border-[#CCCCCC]"}`}>
                                {d.quarter.status}
                            </span>
                            <p className="text-[#666666] text-xs mt-2 font-medium">
                                Pipeline: <span className="text-[#003087] font-bold">{d.overallProgress.completedStages}/{d.overallProgress.totalStages}</span> stages
                            </p>
                        </div>
                    </div>
                    <div className="mt-4">
                        <ProgressBar value={d.overallProgress.percentage} color="from-[#003087] to-indigo-700" />
                    </div>
                </div>

                <button
                    onClick={() => { setLoading(true); fetchData(); }}
                    className="px-4 py-2.5 bg-white border border-[#CCCCCC] rounded-lg text-[#333333] hover:text-[#003087] hover:bg-[#F5F5F5] transition-colors text-sm flex items-center gap-2 cursor-pointer shrink-0 shadow-sm font-medium"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                    Refresh
                </button>
            </div>

            {lastRefresh && <p className="text-[#666666] text-xs mb-6 -mt-4">Auto-refreshes every 30s &middot; Last: {lastRefresh.toLocaleTimeString()}</p>}

            {/* ═══ BEST EMPLOYEE BANNER ═══ */}
            {d.bestEmployee && (
                <div className="bg-[#FFF8E1] border border-[#FFE082] rounded-2xl p-6 mb-8 text-center shadow-sm">
                    <span className="text-4xl block mb-2">🏆</span>
                    <h2 className="text-xl font-bold text-[#003087]">Best Employee of the Quarter</h2>
                    <p className="text-2xl font-bold text-[#F7941D] mt-1">{d.bestEmployee.name}</p>
                    <p className="text-[#333333] font-medium text-sm mt-1">{d.bestEmployee.department}</p>
                    <div className="grid grid-cols-5 gap-2 mt-4 max-w-xl mx-auto">
                        {[
                            { label: "Self", val: d.bestEmployee.selfScore, w: "45%" },
                            { label: "Supervisor", val: d.bestEmployee.supervisorScore, w: "30%" },
                            { label: "Branch Mgr", val: d.bestEmployee.bmScore, w: "15%" },
                            { label: "Cluster Mgr", val: d.bestEmployee.cmScore, w: "10%" },
                            { label: "Final", val: d.bestEmployee.finalScore, w: "" },
                        ].map((s) => (
                            <div key={s.label} className="bg-white border border-[#FFE082] rounded-lg p-2 shadow-sm">
                                <p className="text-[#666666] font-medium text-[10px] leading-tight">{s.label}{s.w ? ` (${s.w})` : ""}</p>
                                <p className={`font-black text-sm ${s.label === "Final" ? "text-[#00843D]" : "text-[#1A1A2E]"}`}>{s.val?.toFixed(1)}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ═══ STAGE CARDS ═══ */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* STAGE 1 */}
                <div className="bg-white border border-[#E0E0E0] shadow-sm rounded-xl overflow-hidden">
                    <div className="px-5 py-4 border-b border-[#E0E0E0] bg-[#F5F5F5] flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                            <span className="w-7 h-7 rounded-lg bg-[#003087] text-white flex items-center justify-center text-sm font-bold shadow-sm">1</span>
                            <h3 className="font-semibold text-[#003087]">Self Assessment</h3>
                        </div>
                        <Badge yes={d.stage1.every((s) => s.percentage === 100)} labelYes="Complete" />
                    </div>
                    <div className="divide-y divide-[#E0E0E0]">
                        {d.stage1.map((dept) => (
                            <div key={dept.departmentId} className="px-5 py-3 hover:bg-[#FAFAFA] transition-colors">
                                <div className="flex items-center justify-between mb-1.5">
                                    <span className="text-sm text-[#1A1A2E] font-medium">{dept.department}</span>
                                    <span className="text-xs text-[#666666]">{dept.submitted}/{dept.totalEmployees} submitted</span>
                                </div>
                                <ProgressBar value={dept.percentage} color="from-[#003087] to-[#3949AB]" />
                                <div className="flex items-center justify-between mt-1.5">
                                    <span className="text-[11px] text-[#333333] font-medium">{dept.percentage}%</span>
                                    <Badge yes={dept.shortlistGenerated} labelYes={`Top ${dept.shortlistCount}`} labelNo="No shortlist" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* STAGE 2 */}
                <div className="bg-white border border-[#E0E0E0] shadow-sm rounded-xl overflow-hidden">
                    <div className="px-5 py-4 border-b border-[#E0E0E0] bg-[#F5F5F5] flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                            <span className="w-7 h-7 rounded-lg bg-[#5E35B1] text-white flex items-center justify-center text-sm font-bold shadow-sm">2</span>
                            <h3 className="font-semibold text-[#003087]">Supervisor Evaluation</h3>
                        </div>
                        <Badge yes={d.stage2.every((s) => s.top5Generated)} labelYes="Complete" />
                    </div>
                    <div className="divide-y divide-[#E0E0E0]">
                        {d.stage2.map((dept) => (
                            <div key={dept.departmentId} className="px-5 py-3 hover:bg-[#FAFAFA] transition-colors">
                                <div className="flex items-center justify-between mb-1.5">
                                    <span className="text-sm text-[#1A1A2E] font-medium">{dept.department}</span>
                                    <span className="text-xs text-[#666666]">{dept.evaluationsDone}/{dept.shortlistedFromStage1} evaluated</span>
                                </div>
                                <ProgressBar value={dept.percentage} color="from-[#5E35B1] to-[#8E24AA]" />
                                <div className="flex items-center justify-between mt-1.5">
                                    <span className="text-[11px] text-[#333333] font-medium">{dept.percentage}%</span>
                                    <Badge yes={dept.top5Generated} labelYes={`Top ${dept.top5Count}`} labelNo="Awaiting" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* STAGE 3 */}
                <div className="bg-white border border-[#E0E0E0] shadow-sm rounded-xl overflow-hidden">
                    <div className="px-5 py-4 border-b border-[#E0E0E0] bg-[#F5F5F5] flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                            <span className="w-7 h-7 rounded-lg bg-[#00843D] text-white flex items-center justify-center text-sm font-bold shadow-sm">3</span>
                            <h3 className="font-semibold text-[#003087]">Branch Manager Evaluation</h3>
                        </div>
                        <Badge yes={d.stage3.every((s) => s.top3Generated)} labelYes="Complete" />
                    </div>
                    <div className="divide-y divide-[#E0E0E0]">
                        {d.stage3.map((dept) => (
                            <div key={dept.departmentId} className="px-5 py-3 hover:bg-[#FAFAFA] transition-colors">
                                <div className="flex items-center justify-between mb-1.5">
                                    <span className="text-sm text-[#1A1A2E] font-medium">{dept.department}</span>
                                    <span className="text-xs text-[#666666]">{dept.evaluationsDone}/{dept.shortlistedFromStage2} evaluated</span>
                                </div>
                                <ProgressBar value={dept.percentage} color="from-[#00843D] to-[#43A047]" />
                                <div className="flex items-center justify-between mt-1.5">
                                    <span className="text-[11px] text-[#333333] font-medium">{dept.percentage}%</span>
                                    <Badge yes={dept.top3Generated} labelYes={`Top ${dept.top3Count}`} labelNo="Awaiting" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* STAGE 4 */}
                <div className="bg-white border border-[#E0E0E0] shadow-sm rounded-xl overflow-hidden">
                    <div className="px-5 py-4 border-b border-[#E0E0E0] bg-[#F5F5F5] flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                            <span className="w-7 h-7 rounded-lg bg-[#F7941D] text-white flex items-center justify-center text-sm font-bold shadow-sm">4</span>
                            <h3 className="font-semibold text-[#003087]">Cluster Manager Evaluation</h3>
                        </div>
                        <Badge yes={!!d.bestEmployee} labelYes="Winner Selected" />
                    </div>
                    <div className="divide-y divide-[#E0E0E0]">
                        {d.stage4.map((dept) => (
                            <div key={dept.departmentId} className="px-5 py-3 hover:bg-[#FAFAFA] transition-colors">
                                <div className="flex items-center justify-between mb-1.5">
                                    <span className="text-sm text-[#1A1A2E] font-medium">{dept.department}</span>
                                    <span className="text-xs text-[#666666]">{dept.evaluationsDone}/{dept.shortlistedFromStage3} evaluated</span>
                                </div>
                                <ProgressBar value={dept.percentage} color="from-[#F7941D] to-[#E65100]" />
                                <div className="flex items-center justify-between mt-1.5">
                                    <span className="text-[11px] text-[#333333] font-medium">{dept.percentage}%</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

            </div>

            {/* Link back to admin panel */}
            <div className="mt-8 text-center">
                <a href="/dashboard/admin" className="text-sm text-[#003087] font-medium hover:underline transition-colors">← Back to Admin Panel</a>
            </div>
        </DashboardShell>
    );
}
