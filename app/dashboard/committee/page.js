"use client";

import { useState, useEffect } from "react";
import DashboardShell from "../../../components/DashboardShell";

const BLUE = "#1565C0";
const BLUE_LIGHT = "#E3F2FD";
const BLUE_BORDER = "#90CAF9";

async function api(url) {
    const res = await fetch(url);
    const json = await res.json();
    if (!res.ok) {
        if (res.status === 401) {
            window.location.replace("/login");
            return new Promise(() => { });
        }
        throw new Error(json.message || "Something went wrong.");
    }
    if (!json.success) throw new Error(json.message || "Something went wrong.");
    return json.data;
}

function WinnerRow({ winner }) {
    const collarLabel = winner.collarType === "WHITE_COLLAR" ? "White Collar" : "Blue Collar";
    const collarColor = winner.collarType === "WHITE_COLLAR" ? "#003087" : "#00843D";
    const collarBg = winner.collarType === "WHITE_COLLAR" ? "#E3F2FD" : "#E8F5E9";
    const rankIcon = winner.rank === 1 ? "🥇" : winner.rank === 2 ? "🥈" : winner.rank === 3 ? "🥉" : `#${winner.rank}`;
    return (
        <div className="border rounded-lg p-4 bg-white" style={{ borderColor: "#E0E0E0" }}>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
                <div className="flex items-center gap-3">
                    <span className="text-2xl">{rankIcon}</span>
                    <div>
                        <p className="text-[16px] font-bold text-[#1A1A2E]">{winner.name}</p>
                        <p className="text-[12px] text-[#666666] font-medium">
                            {winner.empCode}
                            {winner.designation ? ` · ${winner.designation}` : ""}
                            {winner.department ? ` · ${winner.department}` : ""}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-full border" style={{ backgroundColor: collarBg, color: collarColor, borderColor: collarColor }}>
                        {collarLabel}
                    </span>
                    <div className="text-right">
                        <p className="text-[10px] font-bold uppercase text-[#666666]">Final Score</p>
                        <p className="text-[18px] font-black" style={{ color: BLUE }}>
                            {winner.finalScore != null ? Number(winner.finalScore).toFixed(2) : "--"}
                        </p>
                    </div>
                </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {winner.stages.map((s) => (
                    <div key={s.stage} className="border rounded-md p-2 text-center" style={{ borderColor: BLUE_BORDER, backgroundColor: "#FAFCFF" }}>
                        <p className="text-[9px] font-bold uppercase text-[#666666]">Stage {s.stage}</p>
                        <p className="text-[11px] font-bold text-[#333333] leading-tight mt-0.5">{s.name}</p>
                        <p className="text-[15px] font-black mt-1" style={{ color: BLUE }}>
                            {s.score != null ? Number(s.score).toFixed(2) : "--"}
                        </p>
                        <p className="text-[9px] text-[#666666] mt-0.5">Weight {s.weightPct}%</p>
                    </div>
                ))}
            </div>
            {(winner.attendancePct != null || winner.workingHours != null || winner.referenceSheetUrl) && (
                <div className="mt-3 pt-3 border-t border-[#E0E0E0] grid grid-cols-1 sm:grid-cols-3 gap-3 text-[11px]">
                    {winner.attendancePct != null && (
                        <div><span className="font-bold text-[#666666]">Attendance:</span> <span className="font-bold text-[#1A1A2E]">{Number(winner.attendancePct).toFixed(2)}%</span></div>
                    )}
                    {winner.workingHours != null && (
                        <div><span className="font-bold text-[#666666]">Hours:</span> <span className="font-bold text-[#1A1A2E]">{Number(winner.workingHours).toFixed(2)}</span></div>
                    )}
                    {winner.referenceSheetUrl && (
                        <div><a href={winner.referenceSheetUrl} target="_blank" rel="noopener noreferrer" className="font-bold underline" style={{ color: BLUE }}>Reference sheet</a></div>
                    )}
                </div>
            )}
        </div>
    );
}

function BranchWinnersCard({ branch }) {
    const expected = branch.expectedCount;
    const actual = branch.winners.length;
    return (
        <div className="bg-white border shadow-sm rounded-xl overflow-hidden" style={{ borderColor: "#E0E0E0" }}>
            <div className="px-6 py-4 border-b flex items-center justify-between gap-3" style={{ backgroundColor: BLUE_LIGHT, borderColor: BLUE_BORDER }}>
                <div>
                    <p className="text-[12px] font-bold uppercase tracking-wider text-[#666666]">Branch</p>
                    <p className="text-[18px] font-bold" style={{ color: BLUE }}>{branch.branchName}</p>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-[12px] font-bold px-3 py-1 rounded-full border" style={{
                        backgroundColor: branch.branchType === "SMALL" ? "#FFF8E1" : "#F3E5F5",
                        color: branch.branchType === "SMALL" ? "#F57F17" : "#6A1B9A",
                        borderColor: branch.branchType === "SMALL" ? "#FFE082" : "#CE93D8",
                    }}>
                        {branch.branchType} · {expected} winners
                    </span>
                </div>
            </div>
            <div className="p-5 space-y-3">
                {actual === 0 && (
                    <p className="text-center text-[#666666] text-sm py-6">No winners finalized for this branch yet.</p>
                )}
                {branch.winners.map((w, i) => (
                    <WinnerRow key={i} winner={w} />
                ))}
                {actual > 0 && actual < expected && (
                    <p className="text-[11px] text-[#F57F17] font-medium bg-[#FFF8E1] border border-[#FFE082] rounded-lg px-3 py-2">
                        Showing {actual} of {expected} expected winners. Evaluation may not be fully complete.
                    </p>
                )}
            </div>
        </div>
    );
}

export default function CommitteeDashboard() {
    const [user, setUser] = useState(null);
    const [currentQuarterName, setCurrentQuarterName] = useState("");
    const [quarter, setQuarter] = useState(null);
    const [branches, setBranches] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        (async () => {
            const [meResult, resultsResult] = await Promise.allSettled([
                api("/api/auth/me"),
                api("/api/committee/results"),
            ]);

            if (meResult.status === "fulfilled") {
                setUser(meResult.value.user);
                setCurrentQuarterName(meResult.value.currentQuarter);
            }
            if (resultsResult.status === "fulfilled") {
                const data = resultsResult.value;
                setQuarter(data.quarter);
                setBranches(data.branches || []);
            } else {
                setError(resultsResult.reason?.message || "Unable to load committee results.");
            }
            setLoading(false);
        })();
    }, []);

    return (
        <DashboardShell user={user} currentQuarter={currentQuarterName} title="Committee Dashboard">
            {loading && (
                <div className="space-y-4">
                    {[1, 2].map((n) => (
                        <div key={n} className="bg-white border border-[#E0E0E0] rounded-xl p-6 animate-pulse">
                            <div className="h-5 bg-[#E0E0E0] rounded w-48 mb-4" />
                            <div className="h-4 bg-[#E0E0E0] rounded w-full mb-2" />
                            <div className="h-4 bg-[#E0E0E0] rounded w-3/4" />
                        </div>
                    ))}
                </div>
            )}

            {error && !loading && (
                <div className="mb-6 p-4 bg-[#FFEBEE] border-l-4 border-[#D32F2F] rounded-r-lg shadow-sm">
                    <p className="text-[#D32F2F] text-[14px] font-bold">{error}</p>
                </div>
            )}

            {!loading && !error && (
                <div className="space-y-6">
                    {quarter && (
                        <div
                            className="bg-white border shadow-sm rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                            style={{ borderColor: BLUE_BORDER }}
                        >
                            <div>
                                <p className="text-[13px] font-bold uppercase tracking-wider text-[#666666]">Quarter</p>
                                <p className="text-[20px] font-bold" style={{ color: BLUE }}>{quarter.name}</p>
                            </div>
                            <span
                                className="text-[13px] px-4 py-1.5 rounded-full border font-bold"
                                style={{
                                    backgroundColor: quarter.status === "ACTIVE" ? "#E8F5E9" : "#F5F5F5",
                                    color: quarter.status === "ACTIVE" ? "#1B5E20" : "#666666",
                                    borderColor: quarter.status === "ACTIVE" ? "#A5D6A7" : "#CCCCCC",
                                }}
                            >
                                {quarter.status}
                            </span>
                        </div>
                    )}

                    {branches.length === 0 && (
                        <div className="bg-[#F5F5F5] border border-[#E0E0E0] rounded-2xl p-12 text-center">
                            <h3 className="text-[20px] font-bold text-[#333333] mb-2">No Winners Yet</h3>
                            <p className="text-[#666666] text-[15px] font-medium max-w-md mx-auto">
                                Best employee nominations have not been finalized for this quarter yet.
                            </p>
                        </div>
                    )}

                    {branches.map((b) => (
                        <BranchWinnersCard key={b.branchId} branch={b} />
                    ))}
                </div>
            )}
        </DashboardShell>
    );
}
