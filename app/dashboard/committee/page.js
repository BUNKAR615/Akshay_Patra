"use client";

import { useState, useEffect, useMemo } from "react";
import DashboardShell from "../../../components/DashboardShell";
import { Card, Stat, Badge, Avatar, Empty, Alert } from "../../../components/ui";
import { AP, ROLE_COLOR } from "../../../components/ui/tokens";

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

const COLLAR_LABEL = { WHITE_COLLAR: "White Collar", BLUE_COLLAR: "Blue Collar" };

function rankBadge(rank) {
    if (rank === 1) return "🥇";
    if (rank === 2) return "🥈";
    if (rank === 3) return "🥉";
    return `#${rank}`;
}

function FinalistCard({ winner, branchName }) {
    const isWinner = winner.rank === 1;
    const collarColor = winner.collarType === "BLUE_COLLAR" ? AP.green : AP.blue;
    const collarBadge = winner.collarType === "BLUE_COLLAR" ? "green" : "blue";

    const scoreBoxes = [
        ...(winner.stages || []).map((s) => ({
            label: `Stage ${s.stage}`,
            name: s.name,
            value: s.score,
            weight: s.weightPct,
        })),
        { label: "Composite", name: "Final", value: winner.finalScore, weight: null, highlight: true },
    ];

    return (
        <Card
            style={{
                padding: "18px 20px",
                background: isWinner
                    ? "linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)"
                    : "#fff",
                borderColor: isWinner ? "#F59E0B" : undefined,
                borderWidth: isWinner ? 2 : 1,
            }}
        >
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="relative shrink-0">
                        <Avatar name={winner.name} size={44} color={collarColor} />
                        <div
                            className="absolute -top-1 -right-1 rounded-full bg-white border border-[#E4E7ED] flex items-center justify-center text-[11px] font-extrabold"
                            style={{ width: 22, height: 22, color: isWinner ? "#B45309" : "#6B7280" }}
                        >
                            {rankBadge(winner.rank)}
                        </div>
                    </div>
                    <div className="min-w-0">
                        <p className="text-[15px] font-extrabold text-[#111827] truncate">
                            {winner.name}
                        </p>
                        <p className="text-[12px] text-[#6B7280] font-medium truncate">
                            {winner.empCode}
                            {winner.designation ? ` · ${winner.designation}` : ""}
                            {winner.department ? ` · ${winner.department}` : ""}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <Badge label={branchName} color="gray" />
                    <Badge label={COLLAR_LABEL[winner.collarType] || winner.collarType} color={collarBadge} />
                    {isWinner && <Badge label="Selected ✓" color="amber" />}
                </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {scoreBoxes.map((b, i) => (
                    <div
                        key={i}
                        className="rounded-[10px] text-center px-2 py-2.5"
                        style={{
                            background: b.highlight ? "rgba(0,48,135,0.06)" : "#F9FAFB",
                            border: `1px solid ${b.highlight ? "#C7D9F5" : "#E4E7ED"}`,
                        }}
                    >
                        <p className="text-[9px] font-bold uppercase tracking-wider text-[#6B7280] m-0">
                            {b.label}
                        </p>
                        <p className="text-[10px] font-semibold text-[#374151] leading-tight mt-0.5 truncate">
                            {b.name}
                        </p>
                        <p
                            className="text-[17px] font-extrabold mt-1 m-0"
                            style={{ color: b.highlight ? AP.blue : "#111827" }}
                        >
                            {b.value != null ? Number(b.value).toFixed(2) : "—"}
                        </p>
                        {b.weight != null && (
                            <p className="text-[9px] text-[#9CA3AF] mt-0.5 m-0">Weight {b.weight}%</p>
                        )}
                    </div>
                ))}
            </div>

            {(winner.attendancePct != null || winner.workingHours != null || winner.referenceSheetUrl) && (
                <div className="mt-3 pt-3 border-t border-[#E4E7ED] grid grid-cols-1 sm:grid-cols-3 gap-3 text-[12px]">
                    {winner.attendancePct != null && (
                        <div>
                            <span className="font-bold text-[#6B7280]">Attendance: </span>
                            <span className="font-extrabold text-[#111827]">
                                {Number(winner.attendancePct).toFixed(2)}%
                            </span>
                        </div>
                    )}
                    {winner.workingHours != null && (
                        <div>
                            <span className="font-bold text-[#6B7280]">Hours: </span>
                            <span className="font-extrabold text-[#111827]">
                                {Number(winner.workingHours).toFixed(2)}
                            </span>
                        </div>
                    )}
                    {winner.referenceSheetUrl && (
                        <div>
                            <a
                                href={winner.referenceSheetUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-bold underline"
                                style={{ color: AP.blue }}
                            >
                                Reference sheet →
                            </a>
                        </div>
                    )}
                </div>
            )}
        </Card>
    );
}

export default function CommitteeDashboard() {
    const [user, setUser] = useState(null);
    const [currentQuarterName, setCurrentQuarterName] = useState("");
    const [quarter, setQuarter] = useState(null);
    const [branches, setBranches] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [branchFilter, setBranchFilter] = useState("ALL");
    const [collarFilter, setCollarFilter] = useState("ALL");

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

    // KPI metrics
    const totalFinalists = useMemo(
        () => branches.reduce((sum, b) => sum + (b.winners?.length || 0), 0),
        [branches]
    );
    const winnersDeclared = useMemo(
        () => branches.reduce((sum, b) => sum + (b.winners?.filter((w) => w.rank === 1).length || 0), 0),
        [branches]
    );
    const branchesComplete = useMemo(
        () => branches.filter((b) => (b.winners?.length || 0) >= (b.expectedCount || 0) && (b.expectedCount || 0) > 0).length,
        [branches]
    );

    // Filtered view
    const visibleBranches = useMemo(() => {
        return branches
            .filter((b) => branchFilter === "ALL" || b.branchId === branchFilter)
            .map((b) => ({
                ...b,
                winners: (b.winners || []).filter(
                    (w) => collarFilter === "ALL" || w.collarType === collarFilter
                ),
            }))
            .filter((b) => branchFilter !== "ALL" || b.winners.length > 0 || branches.length <= 3);
    }, [branches, branchFilter, collarFilter]);

    return (
        <DashboardShell user={user} currentQuarter={currentQuarterName} title="Committee Dashboard">
            {loading && (
                <div className="space-y-4">
                    {[1, 2].map((n) => (
                        <Card key={n} style={{ padding: 24 }}>
                            <div className="animate-pulse">
                                <div className="h-5 bg-[#E4E7ED] rounded w-48 mb-4" />
                                <div className="h-4 bg-[#E4E7ED] rounded w-full mb-2" />
                                <div className="h-4 bg-[#E4E7ED] rounded w-3/4" />
                            </div>
                        </Card>
                    ))}
                </div>
            )}

            {error && !loading && (
                <div className="mb-6">
                    <Alert type="error" message={error} />
                </div>
            )}

            {!loading && !error && (
                <div className="space-y-5">
                    {/* Quarter header */}
                    {quarter && (
                        <Card style={{ padding: "16px 22px" }}>
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                <div>
                                    <p className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280] m-0">
                                        Quarter
                                    </p>
                                    <p className="text-[20px] font-extrabold m-0" style={{ color: AP.blue }}>
                                        {quarter.name}
                                    </p>
                                </div>
                                <Badge
                                    label={quarter.status}
                                    color={quarter.status === "ACTIVE" ? "green" : "gray"}
                                />
                            </div>
                        </Card>
                    )}

                    {/* KPI row */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <Stat label="Finalists" value={totalFinalists} sub="Across all branches" color={AP.blue} />
                        <Stat
                            label="Winners Declared"
                            value={winnersDeclared}
                            sub={`Rank #1 picks`}
                            color={AP.green}
                        />
                        <Stat
                            label="Branches Complete"
                            value={`${branchesComplete}/${branches.length}`}
                            sub="Expected winners finalized"
                            color={AP.orange}
                        />
                    </div>

                    {/* Filters */}
                    {branches.length > 0 && (
                        <Card style={{ padding: "14px 18px" }}>
                            <div className="flex flex-col gap-3">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280] mr-1">
                                        Branch
                                    </span>
                                    <PillButton
                                        active={branchFilter === "ALL"}
                                        onClick={() => setBranchFilter("ALL")}
                                    >
                                        All branches
                                    </PillButton>
                                    {branches.map((b) => (
                                        <PillButton
                                            key={b.branchId}
                                            active={branchFilter === b.branchId}
                                            onClick={() => setBranchFilter(b.branchId)}
                                        >
                                            {b.branchName}
                                        </PillButton>
                                    ))}
                                </div>
                                <div className="flex items-center gap-5 border-t border-[#E4E7ED] pt-3">
                                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">
                                        Collar
                                    </span>
                                    <TabButton
                                        active={collarFilter === "ALL"}
                                        onClick={() => setCollarFilter("ALL")}
                                    >
                                        All
                                    </TabButton>
                                    <TabButton
                                        active={collarFilter === "WHITE_COLLAR"}
                                        onClick={() => setCollarFilter("WHITE_COLLAR")}
                                    >
                                        White Collar
                                    </TabButton>
                                    <TabButton
                                        active={collarFilter === "BLUE_COLLAR"}
                                        onClick={() => setCollarFilter("BLUE_COLLAR")}
                                    >
                                        Blue Collar
                                    </TabButton>
                                </div>
                            </div>
                        </Card>
                    )}

                    {/* Branch sections */}
                    {branches.length === 0 && (
                        <Card style={{ padding: 0 }}>
                            <Empty
                                icon="🏆"
                                title="No Winners Yet"
                                sub="Best employee nominations have not been finalized for this quarter yet."
                            />
                        </Card>
                    )}

                    {visibleBranches.map((b) => (
                        <BranchSection key={b.branchId} branch={b} />
                    ))}
                </div>
            )}
        </DashboardShell>
    );
}

function PillButton({ active, onClick, children }) {
    return (
        <button
            onClick={onClick}
            className="rounded-full border text-[12px] font-bold transition-all"
            style={{
                padding: "5px 12px",
                background: active ? AP.blue : "#fff",
                color: active ? "#fff" : "#374151",
                borderColor: active ? AP.blue : "#D1D5DB",
                cursor: "pointer",
            }}
        >
            {children}
        </button>
    );
}

function TabButton({ active, onClick, children }) {
    return (
        <button
            onClick={onClick}
            className="text-[13px] font-bold transition-colors pb-1"
            style={{
                background: "transparent",
                border: "none",
                color: active ? AP.blue : "#6B7280",
                borderBottom: `2px solid ${active ? AP.blue : "transparent"}`,
                cursor: "pointer",
                padding: "2px 2px 6px",
            }}
        >
            {children}
        </button>
    );
}

function BranchSection({ branch }) {
    const actual = branch.winners.length;
    const expected = branch.expectedCount;
    const typeColor = branch.branchType === "SMALL" ? "amber" : "purple";

    return (
        <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-3 flex-wrap px-1">
                <div className="flex items-center gap-2.5">
                    <h2 className="text-[15px] font-extrabold text-[#111827] m-0">
                        {branch.branchName}
                    </h2>
                    <Badge label={branch.branchType} color={typeColor} />
                    <span className="text-[12px] text-[#6B7280] font-medium">
                        {actual} of {expected} winner{expected === 1 ? "" : "s"}
                    </span>
                </div>
            </div>

            {actual === 0 ? (
                <Card style={{ padding: "20px 22px" }}>
                    <p className="text-center text-[#6B7280] text-[13px] font-medium m-0">
                        No finalists match the current filter.
                    </p>
                </Card>
            ) : (
                <div className="space-y-2.5">
                    {branch.winners.map((w, i) => (
                        <FinalistCard key={`${branch.branchId}-${i}`} winner={w} branchName={branch.branchName} />
                    ))}
                </div>
            )}

            {actual > 0 && actual < expected && (
                <div className="px-1">
                    <Alert
                        type="warning"
                        message={`Showing ${actual} of ${expected} expected winners. Evaluation may not be fully complete.`}
                    />
                </div>
            )}
        </div>
    );
}
