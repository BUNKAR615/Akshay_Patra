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

function WinnerCard({ winner }) {
    return (
        <div className="bg-white border shadow-sm rounded-xl overflow-hidden" style={{ borderColor: "#E0E0E0" }}>
            {/* Header */}
            <div
                className="px-6 py-4 border-b flex items-center justify-between gap-3"
                style={{ backgroundColor: BLUE_LIGHT, borderColor: BLUE_BORDER }}
            >
                <div>
                    <p className="text-[12px] font-bold uppercase tracking-wider text-[#666666]">Branch</p>
                    <p className="text-[17px] font-bold" style={{ color: BLUE }}>{winner.branch}</p>
                </div>
                <span
                    className="text-[12px] font-bold px-3 py-1 rounded-full border"
                    style={{
                        backgroundColor: winner.branchType === "SMALL" ? "#FFF8E1" : "#F3E5F5",
                        color: winner.branchType === "SMALL" ? "#F57F17" : "#6A1B9A",
                        borderColor: winner.branchType === "SMALL" ? "#FFE082" : "#CE93D8",
                    }}
                >
                    {winner.branchType} Branch
                </span>
            </div>

            {/* Winner identity */}
            <div className="px-6 py-5 border-b border-[#E0E0E0] flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
                <div className="flex items-center gap-4">
                    <span className="text-4xl">🏆</span>
                    <div>
                        <p className="text-[13px] font-bold uppercase tracking-wider text-[#666666]">Top Winner</p>
                        <p className="text-[20px] font-black text-[#1A1A2E]">{winner.name}</p>
                        <p className="text-[13px] text-[#666666] font-medium">
                            {winner.empCode}
                            {winner.designation ? ` · ${winner.designation}` : ""}
                            {winner.department ? ` · ${winner.department}` : ""}
                        </p>
                    </div>
                </div>
                <div className="text-right">
                    <p className="text-[12px] font-bold uppercase tracking-wider text-[#666666]">Final Score</p>
                    <p className="text-[26px] font-black" style={{ color: BLUE }}>
                        {winner.finalScore != null ? Number(winner.finalScore).toFixed(2) : "--"}
                    </p>
                </div>
            </div>

            {/* Per-stage breakdown */}
            <div className="px-6 py-5">
                <p className="text-[12px] font-bold uppercase tracking-wider text-[#666666] mb-3">Stage-wise Scores</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {winner.stages.map((s) => (
                        <div
                            key={s.stage}
                            className="border rounded-lg p-3 text-center"
                            style={{ borderColor: BLUE_BORDER, backgroundColor: "#FAFCFF" }}
                        >
                            <p className="text-[11px] font-bold uppercase tracking-wider text-[#666666]">Stage {s.stage}</p>
                            <p className="text-[13px] font-bold text-[#333333] mt-0.5">{s.name}</p>
                            <p className="text-[20px] font-black mt-2" style={{ color: BLUE }}>
                                {s.score != null ? Number(s.score).toFixed(2) : "--"}
                            </p>
                            <p className="text-[10px] text-[#666666] font-medium mt-0.5">Weight {s.weightPct}%</p>
                        </div>
                    ))}
                </div>

                {/* HR extra info */}
                {(winner.attendancePct != null || winner.workingHours != null || winner.referenceSheetUrl) && (
                    <div className="mt-5 pt-4 border-t border-[#E0E0E0] grid grid-cols-1 sm:grid-cols-3 gap-4">
                        {winner.attendancePct != null && (
                            <div>
                                <p className="text-[11px] font-bold uppercase tracking-wider text-[#666666]">Attendance %</p>
                                <p className="text-[15px] font-bold text-[#1A1A2E]">{Number(winner.attendancePct).toFixed(2)}%</p>
                            </div>
                        )}
                        {winner.workingHours != null && (
                            <div>
                                <p className="text-[11px] font-bold uppercase tracking-wider text-[#666666]">Working Hours</p>
                                <p className="text-[15px] font-bold text-[#1A1A2E]">{Number(winner.workingHours).toFixed(2)}</p>
                            </div>
                        )}
                        {winner.referenceSheetUrl && (
                            <div>
                                <p className="text-[11px] font-bold uppercase tracking-wider text-[#666666]">Reference Sheet</p>
                                <a
                                    href={winner.referenceSheetUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[13px] font-bold underline"
                                    style={{ color: BLUE }}
                                >
                                    Open link
                                </a>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

export default function CommitteeDashboard() {
    const [user, setUser] = useState(null);
    const [currentQuarterName, setCurrentQuarterName] = useState("");
    const [quarter, setQuarter] = useState(null);
    const [winners, setWinners] = useState([]);
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
                setWinners(data.results || []);
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

                    {winners.length === 0 && (
                        <div className="bg-[#F5F5F5] border border-[#E0E0E0] rounded-2xl p-12 text-center">
                            <h3 className="text-[20px] font-bold text-[#333333] mb-2">No Top Winner Yet</h3>
                            <p className="text-[#666666] text-[15px] font-medium max-w-md mx-auto">
                                Best employee nominations have not been finalized for this quarter yet.
                            </p>
                        </div>
                    )}

                    {winners.map((w, i) => (
                        <WinnerCard key={i} winner={w} />
                    ))}
                </div>
            )}
        </DashboardShell>
    );
}
