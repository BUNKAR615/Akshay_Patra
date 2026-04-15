"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import DashboardShell from "../../../../../components/DashboardShell";
import ConfirmDialog from "../../../../../components/ConfirmDialog";

async function api(url, opts) {
    const res = await fetch(url, opts);
    const json = await res.json();
    if (!res.ok) {
        if (res.status === 401) { window.location.replace("/login"); return new Promise(() => {}); }
        throw new Error(json.message || "Request failed");
    }
    if (!json.success) throw new Error(json.message || "Request failed");
    return json.data;
}

function getAutoQuarterName() {
    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();
    const qNum = month < 3 ? 4 : month < 6 ? 1 : month < 9 ? 2 : 3;
    const fyYear = qNum >= 1 && qNum <= 3 ? year : year - 1;
    return `Q${qNum}-${fyYear}`;
}

export default function QuarterManagementPage() {
    const router = useRouter();
    const [user, setUser] = useState(null);
    const [currentQuarter, setCurrentQuarter] = useState("");
    const [loading, setLoading] = useState(true);
    const [quarterLoading, setQuarterLoading] = useState(false);
    const [msg, setMsg] = useState({ text: "", type: "" });
    const [progress, setProgress] = useState(null);
    const [confirm, setConfirm] = useState({ open: false, type: null });

    // Manual form
    const [quarterName, setQuarterName] = useState(getAutoQuarterName());
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [questionCount, setQuestionCount] = useState(15);

    const fetchProgress = async () => {
        try {
            const data = await api("/api/admin/quarters/progress");
            setProgress(data);
        } catch { /* no active quarter */ }
    };

    useEffect(() => {
        (async () => {
            try {
                const me = await api("/api/auth/me");
                setUser(me.user);
                setCurrentQuarter(me.currentQuarter || "");
            } catch { }
            await fetchProgress();
            setLoading(false);
        })();
    }, []);

    const startQuarter = async () => {
        const isAuto = confirm.autoMode;
        setConfirm({ open: false, type: null });
        setQuarterLoading(true);
        setMsg({ text: "", type: "" });
        try {
            let body;
            if (isAuto) {
                const now = new Date();
                const month = now.getMonth();
                const year = now.getFullYear();
                const qNum = month < 3 ? 4 : month < 6 ? 1 : month < 9 ? 2 : 3;
                const fyYear = qNum >= 1 && qNum <= 3 ? year : year - 1;
                body = {
                    quarterName: `Q${qNum}-${fyYear}`,
                    dateRange: {
                        startDate: now.toISOString().split("T")[0],
                        endDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
                    },
                    questionCount: 15,
                };
            } else {
                body = {
                    quarterName,
                    dateRange: { startDate, endDate },
                    questionCount: Number(questionCount) || 15,
                };
            }
            const d = await api("/api/admin/quarters/start", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            setMsg({ text: d.message, type: "success" });
            setQuarterName(getAutoQuarterName());
            setStartDate("");
            setEndDate("");
            fetchProgress();
        } catch (e) {
            setMsg({ text: e.message, type: "error" });
        }
        setQuarterLoading(false);
    };

    const closeQuarter = async () => {
        setConfirm({ open: false, type: null });
        setQuarterLoading(true);
        setMsg({ text: "", type: "" });
        try {
            const d = await api("/api/admin/quarters/close", { method: "POST" });
            setMsg({ text: d.message, type: "success" });
            setProgress(null);
            fetchProgress();
        } catch (e) {
            setMsg({ text: e.message, type: "error" });
        }
        setQuarterLoading(false);
    };

    if (loading) {
        return (
            <DashboardShell user={user} currentQuarter={currentQuarter} title="Quarter Management">
                <div className="text-center py-12 text-gray-500">Loading...</div>
            </DashboardShell>
        );
    }

    return (
        <DashboardShell user={user} currentQuarter={currentQuarter} title="Quarter Management">
            {/* Back link */}
            <button
                onClick={() => router.push("/dashboard/admin/branches")}
                className="text-[12px] text-[#003087] font-bold hover:underline flex items-center gap-1 mb-4 cursor-pointer"
            >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back to Branches
            </button>

            {msg.text && (
                <div className={`mb-4 p-3 rounded-lg text-sm font-medium ${msg.type === "error" ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>
                    {msg.text}
                </div>
            )}

            {/* Active quarter status */}
            {progress?.quarter ? (
                <div className="space-y-6">
                    <div className="bg-white border border-[#E0E0E0] rounded-xl p-5 flex items-center justify-between">
                        <div>
                            <h2 className="text-xl font-bold text-[#003087] flex items-center gap-3">
                                {progress.quarter.name}
                                <span className={`text-xs px-2.5 py-1 rounded-full border ${progress.quarter.status === "ACTIVE" ? "bg-[#E3F2FD] text-[#003087] border-[#90CAF9]" : "bg-[#FFEBEE] text-[#D32F2F] border-[#EF9A9A]"}`}>
                                    {progress.quarter.status}
                                </span>
                            </h2>
                            <p className="text-sm text-[#333] mt-1">
                                Started: {new Date(progress.quarter.startDate).toLocaleDateString()}
                            </p>
                        </div>
                        {progress.quarter.status === "ACTIVE" && (
                            <button
                                onClick={() => setConfirm({ open: true, type: "close" })}
                                disabled={quarterLoading}
                                className="px-4 py-2 bg-[#D32F2F] hover:bg-[#B71C1C] text-white font-bold rounded-lg text-sm cursor-pointer disabled:opacity-50"
                            >
                                Close Quarter
                            </button>
                        )}
                    </div>

                    {/* Overall stats */}
                    {progress.overallStats && (
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                            <div className="bg-white border border-[#E0E0E0] rounded-xl p-5 shadow-sm">
                                <p className="text-xs uppercase font-medium text-[#333]">Total Employees</p>
                                <p className="text-2xl font-bold text-[#1A1A2E] mt-1">{progress.overallStats.totalEmployees}</p>
                            </div>
                            <div className="bg-white border border-[#E0E0E0] rounded-xl p-5 shadow-sm">
                                <p className="text-xs uppercase font-medium text-[#333]">Submitted</p>
                                <p className="text-2xl font-bold text-[#003087] mt-1">{progress.overallStats.totalSubmitted}</p>
                            </div>
                            <div className="bg-white border border-[#E0E0E0] rounded-xl p-5 shadow-sm">
                                <p className="text-xs uppercase font-medium text-[#333]">Completion</p>
                                <p className="text-2xl font-bold text-[#00843D] mt-1">{progress.overallStats.overallPercentage}%</p>
                            </div>
                            <div className="bg-white border border-[#E0E0E0] rounded-xl p-5 shadow-sm">
                                <p className="text-xs uppercase font-medium text-[#333]">Winners</p>
                                <p className="text-2xl font-bold text-[#F7941D] mt-1">
                                    {progress.overallStats.quarterWinners?.length || 0}
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Branch stage table */}
                    {progress.branches?.length > 0 && (
                        <div className="bg-white border border-[#E0E0E0] rounded-xl p-5 overflow-x-auto">
                            <h3 className="text-lg font-bold text-[#003087] mb-4">Branch-wise Stage Progress</h3>
                            <table className="w-full text-[12px] min-w-[880px]">
                                <thead className="bg-[#F5F5F5]">
                                    <tr>
                                        <th className="text-left px-3 py-2 font-bold">Branch</th>
                                        <th className="text-left px-3 py-2 font-bold">Type</th>
                                        <th className="text-right px-3 py-2 font-bold">Employees</th>
                                        <th className="text-right px-3 py-2 font-bold text-[#003087]">Stage 1</th>
                                        <th className="text-right px-3 py-2 font-bold text-[#003087]">Stage 2</th>
                                        <th className="text-right px-3 py-2 font-bold text-[#003087]">Stage 3</th>
                                        <th className="text-right px-3 py-2 font-bold text-[#003087]">Stage 4</th>
                                        <th className="text-center px-3 py-2 font-bold text-[#F57C00]">Winners</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {progress.branches.map(b => (
                                        <tr key={b.branchId} className="border-t border-[#E0E0E0] hover:bg-[#FAFCFF]">
                                            <td className="px-3 py-2 font-bold">{b.branchName}</td>
                                            <td className="px-3 py-2">
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${b.branchType === "BIG" ? "bg-purple-50 text-purple-700 border-purple-200" : "bg-yellow-50 text-yellow-700 border-yellow-200"}`}>{b.branchType}</span>
                                            </td>
                                            <td className="px-3 py-2 text-right font-bold">{b.totalEmployees}</td>
                                            <td className="px-3 py-2 text-right">
                                                <span className="font-bold text-[#003087]">{b.stage1?.submitted || 0}</span>
                                                <span className="text-[#999]"> / </span>
                                                <span className="font-bold text-[#00843D]">{b.stage1?.shortlisted || 0}</span>
                                            </td>
                                            <td className="px-3 py-2 text-right">
                                                <span className="font-bold text-[#003087]">{(b.stage2?.evaluatedByBm || 0) + (b.stage2?.evaluatedByHod || 0)}</span>
                                                <span className="text-[#999]"> / </span>
                                                <span className="font-bold text-[#00843D]">{b.stage2?.shortlisted || 0}</span>
                                            </td>
                                            <td className="px-3 py-2 text-right">
                                                <span className="font-bold text-[#003087]">{b.stage3?.evaluatedByCm || 0}</span>
                                                <span className="text-[#999]"> / </span>
                                                <span className="font-bold text-[#00843D]">{b.stage3?.shortlisted || 0}</span>
                                            </td>
                                            <td className="px-3 py-2 text-right">
                                                <span className="font-bold text-[#003087]">{b.stage4?.evaluatedByHr || 0}</span>
                                                <span className="text-[#999]"> / </span>
                                                <span className="font-bold text-[#00843D]">{b.stage4?.shortlisted || 0}</span>
                                            </td>
                                            <td className="px-3 py-2 text-center font-bold text-[#F57C00]">{b.winners || 0}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            ) : (
                /* No active quarter — show start form */
                <div className="space-y-6">
                    <div className="bg-[#F5F5F5] border border-[#E0E0E0] rounded-xl p-8 text-center">
                        <span className="text-4xl block mb-4 opacity-50">📅</span>
                        <h3 className="text-lg font-bold text-[#333] mb-2">No Active Quarter</h3>
                        <p className="text-sm text-[#666] mb-4">Start a new evaluation quarter below.</p>
                        <button
                            onClick={() => setConfirm({ open: true, type: "start", autoMode: true })}
                            disabled={quarterLoading}
                            className="px-6 py-3 bg-[#003087] text-white rounded-lg font-bold hover:bg-[#002266] cursor-pointer disabled:opacity-50"
                        >
                            {quarterLoading ? "Starting..." : `Start ${getAutoQuarterName()} (Auto)`}
                        </button>
                    </div>

                    {/* Manual start form */}
                    <div className="bg-white border border-[#E0E0E0] rounded-xl p-5 space-y-4">
                        <h3 className="font-bold text-[#003087]">Or start manually</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                            <div>
                                <label className="text-[11px] font-bold text-[#999] uppercase block mb-1">Quarter Name</label>
                                <input value={quarterName} onChange={e => setQuarterName(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
                            </div>
                            <div>
                                <label className="text-[11px] font-bold text-[#999] uppercase block mb-1">Start Date</label>
                                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
                            </div>
                            <div>
                                <label className="text-[11px] font-bold text-[#999] uppercase block mb-1">End Date</label>
                                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
                            </div>
                            <div>
                                <label className="text-[11px] font-bold text-[#999] uppercase block mb-1">Questions per Employee</label>
                                <input type="number" value={questionCount} onChange={e => setQuestionCount(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" min={5} max={50} />
                            </div>
                        </div>
                        <button
                            onClick={() => {
                                if (!quarterName || !startDate || !endDate) return;
                                setConfirm({ open: true, type: "start", autoMode: false });
                            }}
                            disabled={quarterLoading || !quarterName || !startDate || !endDate}
                            className="px-6 py-2.5 bg-[#003087] text-white font-bold rounded-lg text-sm hover:bg-[#00843D] cursor-pointer disabled:bg-[#CCC] disabled:text-[#666] disabled:cursor-not-allowed"
                        >
                            {quarterLoading ? "Starting..." : "Start Quarter"}
                        </button>
                    </div>
                </div>
            )}

            {/* Confirm dialogs */}
            <ConfirmDialog
                open={confirm.open && confirm.type === "start"}
                title="Start New Quarter"
                message={`Are you sure you want to start ${confirm.autoMode ? getAutoQuarterName() : quarterName}? This will generate self-assessment question sets for all employees.`}
                confirmText="Start Quarter"
                loading={quarterLoading}
                onConfirm={startQuarter}
                onCancel={() => setConfirm({ open: false, type: null })}
            />
            <ConfirmDialog
                open={confirm.open && confirm.type === "close"}
                title="Close Quarter"
                message="Are you sure you want to close the current quarter? This action cannot be undone."
                confirmText="Close Quarter"
                confirmColor="red"
                loading={quarterLoading}
                onConfirm={closeQuarter}
                onCancel={() => setConfirm({ open: false, type: null })}
            />
        </DashboardShell>
    );
}
