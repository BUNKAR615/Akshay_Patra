"use client";

import { useState, useEffect, useMemo } from "react";
import DashboardShell from "../../../components/DashboardShell";
import { Card, Stat, Badge, Empty, Alert } from "../../../components/ui";
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

function rankBadge(rank) {
    if (rank === 1) return "🥇";
    if (rank === 2) return "🥈";
    if (rank === 3) return "🥉";
    return `#${rank}`;
}

// Score cell formatter — 2dp, em-dash for missing values.
function fmtScore(v) {
    if (v == null) return "—";
    const n = Number(v);
    return Number.isNaN(n) ? "—" : n.toFixed(2);
}

export default function CommitteeDashboard() {
    const [user, setUser] = useState(null);
    const [currentQuarterName, setCurrentQuarterName] = useState("");
    const [quarter, setQuarter] = useState(null);
    const [branches, setBranches] = useState([]);
    // `assignedBranches` drives the dropdown — it's the committee member's
    // full branch assignment list, independent of which branches have
    // results in this quarter. Spec: "the dropdown should show only the
    // branches assigned to that role".
    const [assignedBranches, setAssignedBranches] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    // "ALL" === Total mode (combined across every assigned branch).
    // This is the default — the pre-login branch picker has been removed.
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
                setAssignedBranches(data.assignedBranches || data.branches || []);
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

                    {/* Filters — Total + per-branch pills. The dropdown
                        source is `assignedBranches` (every branch this
                        committee member is on) so the options stay stable
                        even when a branch has no winners yet this quarter. */}
                    {(assignedBranches.length > 0 || branches.length > 0) && (
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
                                        Total
                                    </PillButton>
                                    {(assignedBranches.length > 0 ? assignedBranches : branches).map((b) => {
                                        const id = b.branchId || b.id;
                                        const name = b.branchName || b.name;
                                        return (
                                            <PillButton
                                                key={id}
                                                active={branchFilter === id}
                                                onClick={() => setBranchFilter(id)}
                                            >
                                                {name}
                                            </PillButton>
                                        );
                                    })}
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

// Committee winners table — columns follow the committee reference sheet:
// Rank · Name · Emp Code · Self (Stage 1) · BM · CM · HR · Attendance ·
// Total Working Hours · Reference.
function BranchSection({ branch }) {
    const actual = branch.winners.length;
    const expected = branch.expectedCount;
    const typeColor = branch.branchType === "SMALL" ? "amber" : "purple";

    // Stage weights come from the API payload (committee/results). The table
    // only renders when there is at least one winner, so winners[0] exists.
    const stageWeight = (n) => branch.winners[0]?.stages?.find((s) => s.stage === n)?.weightPct;
    const withWeight = (label, n) => {
        const w = stageWeight(n);
        return w != null ? `${label} · ${w}%` : label;
    };
    const COLS = [
        "Rank", "Name", "Emp Code",
        withWeight("Self", 1), withWeight("BM", 2), withWeight("CM", 3), withWeight("HR", 4),
        "Attendance", "Total Working Hours", "Reference",
    ];

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
                <Card style={{ padding: 0 }}>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-[#F9FAFB] border-b border-[#E4E7ED]">
                                    {COLS.map((h, i) => (
                                        <th
                                            key={h}
                                            className={`px-3 py-2.5 text-[11px] font-bold text-[#6B7280] uppercase tracking-wider ${i >= 3 && i <= 8 ? "text-center" : ""}`}
                                        >
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#E4E7ED]">
                                {branch.winners.map((w, i) => {
                                    const stageScore = (n) => w.stages?.find((s) => s.stage === n)?.score;
                                    return (
                                        <tr key={`${branch.branchId}-${i}`} className="hover:bg-[#FAFBFC]">
                                            <td className="px-3 py-2.5 text-[13px] font-extrabold text-[#111827] whitespace-nowrap">
                                                {rankBadge(w.rank)}
                                            </td>
                                            <td className="px-3 py-2.5 text-[13px] font-bold text-[#111827]">
                                                {w.name}
                                            </td>
                                            <td className="px-3 py-2.5 text-[12px] font-mono text-[#374151] whitespace-nowrap">
                                                {w.empCode || "—"}
                                            </td>
                                            <td className="px-3 py-2.5 text-[13px] text-center tabular-nums text-[#374151]">{fmtScore(stageScore(1))}</td>
                                            <td className="px-3 py-2.5 text-[13px] text-center tabular-nums text-[#374151]">{fmtScore(stageScore(2))}</td>
                                            <td className="px-3 py-2.5 text-[13px] text-center tabular-nums text-[#374151]">{fmtScore(stageScore(3))}</td>
                                            <td className="px-3 py-2.5 text-[13px] text-center tabular-nums text-[#374151]">{fmtScore(stageScore(4))}</td>
                                            <td className="px-3 py-2.5 text-[13px] text-center tabular-nums text-[#374151]">
                                                {w.attendancePct != null ? `${Number(w.attendancePct).toFixed(2)}%` : "—"}
                                            </td>
                                            <td className="px-3 py-2.5 text-[13px] text-center tabular-nums text-[#374151]">{fmtScore(w.workingHours)}</td>
                                            <td className="px-3 py-2.5 text-[13px]">
                                                {w.referenceSheetUrl ? (
                                                    <a
                                                        href={w.referenceSheetUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="font-bold underline"
                                                        style={{ color: AP.blue }}
                                                    >
                                                        View
                                                    </a>
                                                ) : (
                                                    <span className="text-[#9CA3AF]">—</span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </Card>
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
