"use client";

import { useState, useEffect, useMemo } from "react";
import DashboardShell from "../../../components/DashboardShell";
import EvaluationForm from "../../../components/EvaluationForm";
import UserProfileCard from "../../../components/UserProfileCard";

async function api(url, opts) {
    const res = await fetch(url, opts);
    const json = await res.json();
    if (!res.ok) {
        if (res.status === 401) {
            window.location.replace("/login");
            return new Promise(() => { }); // never resolves, waits for redirect
        }
        throw new Error(json.message || "Something went wrong. Please try again in a moment.");
    }
    if (!json.success) throw new Error(json.message || "Something went wrong. Please try again in a moment.");
    return json.data;
}

export default function ClusterManagerDashboard() {
    const [user, setUser] = useState(null);
    const [currentQuarterName, setCurrentQuarterName] = useState("");
    const [departmentsData, setDepartmentsData] = useState([]);
    const [selectedBranchId, setSelectedBranchId] = useState("");
    const [branchInfo, setBranchInfo] = useState(null);
    const [assignedBranches, setAssignedBranches] = useState([]);

    const [questions, setQuestions] = useState([]);
    const [selectedEmployee, setSelectedEmployee] = useState(null);
    const [bestEmployee, setBestEmployee] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    // Flatten the per-department server response into a single branch-wide
    // employee list. The CM dashboard is branch-based — the department
    // grouping returned by the API is now only used for the count totals.
    const shortlist = useMemo(
        () => (departmentsData || []).flatMap((d) => d.shortlist || []),
        [departmentsData]
    );
    const progress = useMemo(
        () => ({
            evaluated: (departmentsData || []).reduce((n, d) => n + (d.evaluated || 0), 0),
            total: (departmentsData || []).reduce((n, d) => n + (d.totalToEvaluate || 0), 0),
        }),
        [departmentsData]
    );

    // selectedBranchId === ""   → Total mode (combined across all assigned branches)
    // selectedBranchId === "id" → focused on a specific branch
    const fetchData = async (nextSelection) => {
        try {
            setLoading(true);
            // `nextSelection === ""` is Total mode — we deliberately omit
            // the branchId query param so the API merges across every
            // assigned branch. `undefined` means "use whatever is currently
            // selected" (initial load, or refresh-after-submit).
            const target = nextSelection === undefined ? selectedBranchId : nextSelection;
            const deptsUrl = target
                ? `/api/cluster-manager/departments?branchId=${encodeURIComponent(target)}`
                : "/api/cluster-manager/departments";
            const [meData, deptsData, qData] = await Promise.all([
                api("/api/auth/me"),
                api(deptsUrl),
                api("/api/cluster-manager/questions"),
            ]);
            // Stitch the assignment-table branch onto the user object so the
            // profile card's Branch field reflects the branch this CM is
            // currently working on (or "All Branches" in Total mode).
            setUser({
                ...meData.user,
                branchName: deptsData.branch?.name || (deptsData.mode === "TOTAL" ? "All Branches" : null),
            });
            setCurrentQuarterName(meData.currentQuarter || deptsData.quarter?.name);
            setDepartmentsData(deptsData.departments || []);
            setQuestions(qData.questions);
            setBranchInfo(deptsData.branch || null);
            setAssignedBranches(deptsData.assignedBranches || []);
            // Keep the dropdown in sync with what the server actually scoped
            // to. In Total mode, branch is null → selectedBranchId = "".
            setSelectedBranchId(deptsData.branch?.id || "");
            setSelectedEmployee(null);
            setError("");
            setSuccess("");
            setBestEmployee(null);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleSelectBranch = (branchId) => {
        // Empty string is the legitimate Total sentinel — only short-circuit
        // when the selection didn't actually change.
        if (branchId === selectedBranchId) return;
        fetchData(branchId);
    };

    // Default the dashboard to Total mode on first open. No pre-login picker
    // any more — the user lands here directly and chooses a branch (or stays
    // on Total) via the in-page dropdown.
    useEffect(() => { fetchData(""); }, []);

    const handleEvaluate = async (answers) => {
        setError(""); setSuccess("");
        try {
            const data = await api("/api/cluster-manager/evaluate", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ employeeId: selectedEmployee.userId, answers }),
            });
            setSuccess(`✓ Evaluation submitted for ${selectedEmployee.name}`);
            setSelectedEmployee(null);
            window.scrollTo({ top: 0, behavior: "smooth" });

            // Refresh the current branch's data + the branch-wise counts strip.
            const refreshedUrl = selectedBranchId
                ? `/api/cluster-manager/departments?branchId=${encodeURIComponent(selectedBranchId)}`
                : "/api/cluster-manager/departments";
            const deptsData = await api(refreshedUrl);
            setDepartmentsData(deptsData.departments || []);
            setAssignedBranches(deptsData.assignedBranches || []);
            setBranchInfo(deptsData.branch || null);

            if (data.bestEmployee) {
                // We no longer show best employee details during evaluation process to preserve blind evaluation.
                setSuccess(`All evaluations complete for ${branchInfo?.name || "this branch"}! The evaluations have been finalized.`);
            }
        } catch (e) {
            throw e; // Rethrow so EvaluationForm catches it
        }
    };

    if (loading) {
        return (
            <DashboardShell user={user} currentQuarter={currentQuarterName} title="Cluster Manager Dashboard">
                <div className="flex items-center justify-center h-64">
                    <div className="flex flex-col items-center gap-4">
                        <div className="animate-spin h-10 w-10 border-4 border-[#003087] border-t-transparent rounded-full" />
                        <p className="text-[#003087] font-bold text-[16px]">Loading assignments...</p>
                    </div>
                </div>
            </DashboardShell>
        );
    }

    // In Total mode `branchInfo` is null — fall back to a Total label.
    const isTotalMode = !selectedBranchId;
    const dashboardTitle = branchInfo?.name
        ? `Cluster Manager — ${branchInfo.name}`
        : isTotalMode
            ? "Cluster Manager — Total (All Branches)"
            : "Cluster Manager Final Evaluation";

    const isMultiBranch = (assignedBranches?.length || 0) > 1;
    const noAssignments = (assignedBranches?.length || 0) === 0;
    // Total counters across assigned branches, for the Total option label
    // and the progress strip header in Total mode.
    const totalEvaluatedAll = (assignedBranches || []).reduce((n, b) => n + (b.evaluated || 0), 0);
    const totalToEvaluateAll = (assignedBranches || []).reduce((n, b) => n + (b.totalToEvaluate || 0), 0);

    return (
        <DashboardShell user={user} currentQuarter={currentQuarterName} title={dashboardTitle}>
            {/* Profile Card */}
            {user && (
                <UserProfileCard
                    user={user}
                    extraInfo={[
                        {
                            label: "Evaluating Branch",
                            value: branchInfo?.name || "—",
                            color: "text-[#F57C00]",
                        },
                    ]}
                />
            )}

            {/* Branch selector + branch-wise counts. Replaces the old multi-
                department selector and the logout-required Switch Branch
                button. Selecting a branch refetches in place. */}
            {assignedBranches.length > 0 && (
                <div className="bg-[#E3F2FD] border border-[#90CAF9] rounded-xl p-5 mb-6 shadow-sm">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center border border-[#90CAF9] shrink-0 text-[#003087]">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                </svg>
                            </div>
                            <div>
                                <p className="text-[13px] font-bold text-[#003087] uppercase tracking-wider">
                                    {isMultiBranch ? "Multi-Branch Cluster Manager" : "Assigned Branch"}
                                </p>
                                <p className="text-[14px] text-[#333333]">
                                    {isTotalMode ? (
                                        <>Currently viewing <span className="font-bold">Total ({assignedBranches.length} branch{assignedBranches.length === 1 ? "" : "es"})</span>.</>
                                    ) : (
                                        <>Currently evaluating <span className="font-bold">{branchInfo?.name || "—"}</span>{isMultiBranch ? ` of ${assignedBranches.length} assigned branches.` : "."}</>
                                    )}
                                </p>
                            </div>
                        </div>
                        {isMultiBranch && (
                            <div className="bg-white rounded-lg p-2 border border-[#90CAF9] flex items-center gap-2 w-full sm:w-auto">
                                <label className="text-[13px] font-bold text-[#003087] uppercase tracking-wider whitespace-nowrap pl-2">
                                    Branch:
                                </label>
                                <div className="relative w-full sm:w-64">
                                    <select
                                        value={selectedBranchId}
                                        onChange={(e) => handleSelectBranch(e.target.value)}
                                        className="w-full px-4 py-2 bg-[#E3F2FD] border border-[#90CAF9] rounded-lg text-[#003087] font-bold focus:outline-none focus:ring-2 focus:ring-[#003087] appearance-none cursor-pointer"
                                    >
                                        {/* Total option — combined view across every assigned branch.
                                            Default selection when the dashboard opens. */}
                                        <option value="">
                                            Total — {totalEvaluatedAll}/{totalToEvaluateAll}
                                        </option>
                                        {assignedBranches.map((b) => (
                                            <option key={b.id} value={b.id}>
                                                {b.name}
                                                {b.totalToEvaluate > 0 ? ` — ${b.evaluated}/${b.totalToEvaluate}` : " — 0 eligible"}
                                            </option>
                                        ))}
                                    </select>
                                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-[#003087]">
                                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                                        </svg>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Branch-wise counts strip — Total chip first, then one
                        chip per assigned branch. The Total chip mirrors the
                        dropdown's Total option for click-to-switch parity. */}
                    <div className="flex flex-wrap gap-2">
                        {isMultiBranch && (
                            <button
                                type="button"
                                onClick={() => handleSelectBranch("")}
                                className={`px-3 py-2 rounded-lg border text-left transition-colors cursor-pointer ${
                                    isTotalMode
                                        ? "bg-[#003087] border-[#003087] text-white shadow-sm"
                                        : "bg-white border-[#90CAF9] text-[#003087] hover:bg-[#F5F9FF]"
                                }`}
                            >
                                <div className="text-[12px] font-bold uppercase tracking-wider opacity-80">Total</div>
                                <div className="text-[14px] font-black">
                                    {totalToEvaluateAll === 0 ? (
                                        <span className={isTotalMode ? "text-white" : "text-[#666]"}>No eligible employees</span>
                                    ) : (
                                        <>{totalEvaluatedAll} / {totalToEvaluateAll} evaluated</>
                                    )}
                                </div>
                            </button>
                        )}
                        {assignedBranches.map((b) => {
                            const isCurrent = !isTotalMode && b.id === selectedBranchId;
                            const empty = b.totalToEvaluate === 0;
                            return (
                                <button
                                    key={b.id}
                                    type="button"
                                    onClick={() => handleSelectBranch(b.id)}
                                    className={`px-3 py-2 rounded-lg border text-left transition-colors cursor-pointer ${
                                        isCurrent
                                            ? "bg-[#003087] border-[#003087] text-white shadow-sm"
                                            : "bg-white border-[#90CAF9] text-[#003087] hover:bg-[#F5F9FF]"
                                    }`}
                                >
                                    <div className="text-[12px] font-bold uppercase tracking-wider opacity-80">{b.name}</div>
                                    <div className="text-[14px] font-black">
                                        {empty ? (
                                            <span className={isCurrent ? "text-white" : "text-[#666]"}>No eligible employees</span>
                                        ) : (
                                            <>{b.evaluated} / {b.totalToEvaluate} evaluated</>
                                        )}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            <div className="bg-[#FFF8E1] border-l-4 border-[#F57C00] p-4 mb-6 rounded-r-lg shadow-sm">
                <p className="text-[#F57C00] font-bold text-sm">
                    You are evaluating the employees who qualified out of the Branch Manager round (Stage 2)
                    for the selected branch. Previous round scores are not visible to ensure a fair and
                    unbiased selection.
                </p>
            </div>

            <div className="bg-white border border-[#E0E0E0] rounded-xl p-6 mb-8 shadow-sm">
                <div className="flex justify-between items-end mb-3">
                    <div>
                        <span className="text-[14px] text-[#666666] font-bold uppercase tracking-wider block mb-1">
                            {isTotalMode ? "Total — " : (branchInfo?.name ? `${branchInfo.name} — ` : "")}Evaluation Progress
                        </span>
                        <span className="text-[15px] font-medium text-[#333333]">
                            {progress.evaluated} of {progress.total} eligible employees evaluated{isTotalMode ? " across all assigned branches" : " in this branch"}
                        </span>
                    </div>
                    <span className="text-[24px] font-black text-[#003087] leading-none">
                        {progress.evaluated}/{progress.total}
                    </span>
                </div>
                <div className="w-full bg-[#F5F5F5] rounded-full h-3 border border-[#E0E0E0] overflow-hidden">
                    <div
                        className="bg-[#00843D] h-full rounded-full transition-all duration-700 relative"
                        style={{ width: `${progress.total > 0 ? (progress.evaluated / progress.total) * 100 : 0}%` }}
                    >
                        <div
                            className="absolute inset-0 bg-white/20 w-full"
                            style={{
                                backgroundImage: "linear-gradient(45deg, rgba(255,255,255,0.15) 25%, transparent 25%, transparent 50%, rgba(255,255,255,0.15) 50%, rgba(255,255,255,0.15) 75%, transparent 75%, transparent)",
                                backgroundSize: "1rem 1rem",
                            }}
                        ></div>
                    </div>
                </div>
            </div>

            {noAssignments && !error && (
                <div className="bg-white border-2 border-[#E0E0E0] border-dashed rounded-2xl p-12 text-center shadow-sm mb-8">
                    <span className="text-5xl block mb-4 opacity-50">🔒</span>
                    <h3 className="text-[20px] font-bold text-[#333333] mb-2">No Branches Assigned</h3>
                    <p className="text-[#666666] text-[16px] max-w-md mx-auto">
                        You are not assigned to any branch as Cluster Manager. Please contact the Admin to get a branch assignment.
                    </p>
                </div>
            )}

            {error && (
                <div className="mb-6 p-4 bg-[#FFEBEE] border-l-4 border-[#D32F2F] rounded-r-lg text-[#D32F2F] text-[15px] font-bold shadow-sm">
                    {error}
                </div>
            )}
            {success && (
                <div className="mb-6 p-5 bg-[#E8F5E9] border-l-4 border-[#00843D] rounded-r-lg text-[#1B5E20] text-[15px] font-bold shadow-sm flex gap-3 items-center">
                    <svg className="w-6 h-6 text-[#00843D] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {success}
                </div>
            )}

            {selectedEmployee ? (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
                    <button
                        onClick={() => setSelectedEmployee(null)}
                        className="min-h-[44px] min-w-[80px] px-4 py-2 text-[14px] font-bold text-[#003087] bg-white border border-[#003087] rounded-lg hover:bg-[#003087] hover:text-white transition-all mb-6 flex items-center gap-2 cursor-pointer shadow-sm"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                        </svg>
                        Back to Employee List
                    </button>

                    <div className="bg-[#E3F2FD] border border-[#90CAF9] rounded-xl p-6 mb-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                            <p className="text-[13px] text-[#003087]/80 font-bold uppercase tracking-wider mb-1">
                                Final Evaluation{branchInfo?.name ? ` — ${branchInfo.name}` : ""}
                            </p>
                            <p className="text-[#003087] font-black text-[22px] leading-tight">{selectedEmployee.name}</p>
                        </div>
                    </div>

                    <EvaluationForm
                        questions={questions}
                        onSubmit={handleEvaluate}
                        submitLabel={`Submit Final Evaluation for ${selectedEmployee.name.split(" ")[0]}`}
                        draftKey={user?.id && selectedBranchId ? `draft_eval_${user.id}_${selectedEmployee.userId}_${selectedBranchId}` : null}
                    />
                </div>
            ) : (
                <div className="space-y-4">
                    <div className="flex items-center justify-between mb-4">
                        <p className="text-[#1A1A2E] font-bold text-[18px]">Eligible Employees (Branch-wise)</p>
                        <span className="text-[13px] text-[#666666] font-medium bg-[#F5F5F5] px-3 py-1 rounded-full border border-[#E0E0E0] hidden sm:block">
                            Blind evaluation — previous scores hidden
                        </span>
                    </div>

                    {!noAssignments && shortlist.length === 0 ? (
                        <div className="bg-white border-2 border-[#E0E0E0] border-dashed rounded-2xl p-12 text-center shadow-sm">
                            <span className="text-5xl block mb-4 opacity-50">📋</span>
                            <h3 className="text-[20px] font-bold text-[#333333] mb-2">No Employees Available</h3>
                            <p className="text-[#666666] text-[16px] max-w-md mx-auto">
                                No employees have qualified for Cluster Manager evaluation in <span className="font-bold">{branchInfo?.name || "this branch"}</span> yet.
                                The Branch Manager (Stage 2) round may not be complete, or no employees have crossed the cut-off.
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-4">
                            {shortlist.map((entry) => (
                                <div
                                    key={entry.userId}
                                    className={`bg-white border-2 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all duration-200 ${
                                        entry.alreadyEvaluated
                                            ? "border-[#A5D6A7] bg-[#F1F8E9] shadow-sm opacity-80 zoom-in-95"
                                            : "border-[#E0E0E0] shadow-sm hover:border-[#003087]/50 hover:shadow-md"
                                    }`}
                                >
                                    <div className="flex items-center gap-5">
                                        <div
                                            className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-[16px] shrink-0 border-2 ${
                                                entry.alreadyEvaluated
                                                    ? "bg-[#E8F5E9] text-[#2E7D32] border-[#A5D6A7]"
                                                    : "bg-[#FFF8E1] text-[#F57C00] border-[#FFE082]"
                                            }`}
                                        >
                                            {entry.name?.charAt(0) || "?"}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                <p className="text-[18px] font-bold text-[#003087] leading-tight">{entry.name}</p>
                                                {entry.collarType === "WHITE_COLLAR" && (
                                                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full border bg-[#E3F2FD] text-[#003087] border-[#90CAF9]">WC</span>
                                                )}
                                                {entry.collarType === "BLUE_COLLAR" && (
                                                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full border bg-[#FFF8E1] text-[#F57C00] border-[#FFE082]">BC</span>
                                                )}
                                                {/* Show the branch tag in Total mode so it's clear
                                                    which branch each candidate belongs to. */}
                                                {isTotalMode && entry.branchName && (
                                                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full border bg-[#E8EAF6] text-[#1A237E] border-[#9FA8DA]">
                                                        {entry.branchName}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-[#666666] text-[14px] font-medium">
                                                {entry.designation || ""}{entry.designation && entry.empCode ? " | " : ""}{entry.empCode || ""}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="mt-3 sm:mt-0">
                                        {entry.alreadyEvaluated ? (
                                            <div className="flex flex-col items-end gap-1">
                                                <span className="min-h-[44px] text-[14px] px-6 py-2.5 rounded-lg bg-white text-[#2E7D32] border border-[#A5D6A7] font-bold shadow-sm flex items-center gap-2 justify-center w-full sm:w-auto">
                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                    </svg>
                                                    ✓ Done
                                                </span>
                                                {entry.mySubmittedScore != null && (
                                                    <span className="text-[12px] font-bold text-[#2E7D32] mt-1">
                                                        Your score: {Number(entry.mySubmittedScore).toFixed(2)}
                                                    </span>
                                                )}
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => setSelectedEmployee(entry)}
                                                className="min-h-[44px] min-w-[120px] text-[15px] px-6 py-3 bg-[#003087] text-white rounded-lg hover:bg-[#00843D] transition-colors cursor-pointer font-bold shadow flex items-center gap-2 justify-center w-full sm:w-auto"
                                            >
                                                Evaluate
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                </svg>
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </DashboardShell>
    );
}
