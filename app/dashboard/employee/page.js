"use client";

import { useState, useEffect } from "react";
import DashboardShell from "../../../components/DashboardShell";
import EvaluationForm from "../../../components/EvaluationForm";
import UserProfileCard from "../../../components/UserProfileCard";
import { PageSpinner, SkeletonCard } from "../../../components/Skeleton";

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

const STAGE_COLORS = {
    completed: "emerald", shortlisted: "amber", evaluated: "sky",
    pending: "gray", winner: "amber",
};

function StagePill({ status }) {
    const labels = { completed: "Completed", shortlisted: "Shortlisted ✓", evaluated: "Evaluated", pending: "⏳ Pending", winner: "🏆 Winner!" };
    const colors = { completed: "emerald", shortlisted: "amber", evaluated: "sky", pending: "gray", winner: "amber" };
    const c = colors[status] || "gray";
    return (
        <span className={`text-[12px] px-2.5 py-1 rounded-full bg-${c}-500/10 text-${c}-500 border border-${c}-500/20 font-bold`}>
            {labels[status] || status}
        </span>
    );
}

export default function EmployeeDashboard() {
    const [user, setUser] = useState(null);
    const [currentQuarterName, setCurrentQuarterName] = useState("");
    const [tab, setTab] = useState("current");

    // Current status state
    const [status, setStatus] = useState(null);
    const [questions, setQuestions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [successMsg, setSuccessMsg] = useState("");

    // History state
    const [history, setHistory] = useState([]);
    const [historyLoaded, setHistoryLoaded] = useState(false);

    // ── Safe fetch for employee status ──
    const fetchStatus = async () => {
        try {
            setLoading(true);
            setError(null);

            const res = await fetch("/api/employee/status", {
                headers: { "Content-Type": "application/json" },
            });

            // Handle non-200 responses gracefully
            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                console.error("Status API error:", res.status, errorData);
                setError("Unable to load quarter information.");
                return;
            }

            const json = await res.json();

            if (json.success) {
                setStatus(json.data);
            } else {
                setError("Unable to load data. Please try again.");
            }
        } catch (err) {
            console.error("Fetch error:", err);
            setError("Connection error. Please check your internet.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        (async () => {
            // Load user profile
            try {
                const meData = await api("/api/auth/me");
                setUser(meData.user);
                setCurrentQuarterName(meData.currentQuarter);
            } catch { }

            // Load current quarter status (safe fetch)
            await fetchStatus();

            // Only fetch questions if not yet submitted
            try {
                const qData = await api("/api/assessment/questions");
                setQuestions(qData.questions);
            } catch { }
        })();
    }, []);

    useEffect(() => {
        if (tab === "history" && !historyLoaded) {
            (async () => {
                try {
                    const h = await api("/api/employee/history");
                    setHistory(h.history);
                    setHistoryLoaded(true);
                } catch { }
            })();
        }
    }, [tab, historyLoaded]);

    const handleConfirmedSubmit = async (answers) => {
        setError(null);
        setSuccessMsg("");
        try {
            await api("/api/assessment/submit", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ answers }),
            });
            // Re-fetch from current-status for full data (submitted answers, stages, etc.)
            try {
                const st = await api("/api/employee/current-status");
                setStatus(st);
            } catch {
                // Fallback: at least refresh from /status
                await fetchStatus();
            }
            setQuestions([]);
            setSuccessMsg("Your assessment has been submitted successfully! You will be notified if you are shortlisted.");
            window.scrollTo({ top: 0, behavior: "smooth" });
        } catch (e) {
            throw e; // Rethrow so EvaluationForm handles the error state internally
        }
    };

    if (loading) {
        return (
            <DashboardShell user={user} currentQuarter={currentQuarterName} title="Employee Dashboard">
                <div className="space-y-4">
                    <SkeletonCard lines={2} />
                    <SkeletonCard lines={5} />
                </div>
            </DashboardShell>
        );
    }

    const TABS = [
        { id: "current", label: "Current Quarter" },
        { id: "history", label: "My History" },
    ];

    return (
        <DashboardShell user={user} currentQuarter={currentQuarterName} title="Employee Dashboard">
            {/* Profile Card */}
            {user && (
                <UserProfileCard
                    user={user}
                    extraInfo={{
                        label: "Assessment",
                        value: (status?.selfAssessment || status?.assessment?.submitted) ? "Submitted ✓" : "Pending",
                        color: (status?.selfAssessment || status?.assessment?.submitted) ? "text-[#00843D]" : "text-[#F7941D]"
                    }}
                />
            )}

            {/* Tab Switcher */}
            <div className="flex gap-2 bg-[#F5F5F5] rounded-xl p-1.5 mb-8 border border-[#E0E0E0] w-fit">
                {TABS.map((t) => (
                    <button key={t.id} onClick={() => setTab(t.id)}
                        className={`min-h-[44px] min-w-[80px] px-6 py-2 rounded-lg text-[14px] font-bold transition-all cursor-pointer ${tab === t.id ? "bg-[#003087] text-white shadow" : "text-[#666666] hover:text-[#003087] hover:bg-white border border-transparent"}`}
                    >{t.label}</button>
                ))}
            </div>

            {error && (
                <div className="mb-6 p-4 bg-[#FFEBEE] border-l-4 border-[#D32F2F] rounded-r-lg shadow-sm">
                    <p className="text-[#D32F2F] text-[14px] font-bold">⚠ {error}</p>
                    <button
                        onClick={fetchStatus}
                        className="mt-2 text-[13px] text-[#D32F2F] underline cursor-pointer hover:text-[#B71C1C] transition-colors"
                    >
                        Click here to retry
                    </button>
                </div>
            )}
            {successMsg && <div className="mb-6 p-5 bg-[#E8F5E9] border-l-4 border-[#00843D] rounded-r-lg text-[#1B5E20] text-[15px] font-bold shadow-sm flex items-center gap-3">
                <svg className="w-6 h-6 text-[#00843D] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                {successMsg}
            </div>}

            {/* ═══════════════ CURRENT QUARTER TAB ═══════════════ */}
            {tab === "current" && (
                <div className="space-y-8">
                    {/* Quarter Header */}
                    {status?.quarter && (
                        <div className="bg-white border border-[#E0E0E0] shadow-sm rounded-xl p-5 flex items-center justify-between">
                            <div>
                                <p className="text-[13px] text-[#666666] font-bold uppercase tracking-wider">Current Quarter</p>
                                <p className="text-[20px] font-bold text-[#003087]">{status.quarter.name}</p>
                            </div>
                            <span className={`text-[13px] px-4 py-1.5 rounded-full border font-bold ${status.quarter.status === "ACTIVE" ? "bg-[#E8F5E9] text-[#1B5E20] border-[#A5D6A7]" : "bg-[#F5F5F5] text-[#666666] border-[#CCCCCC]"}`}>
                                {status.quarter.status}
                            </span>
                        </div>
                    )}

                    {/* ── NOT YET SUBMITTED: Show form ── */}
                    {status && !status.submitted && questions.length > 0 && (
                        <>
                            <div className="bg-[#E3F2FD] border border-[#90CAF9] rounded-xl p-5 mb-6">
                                <h3 className="text-[18px] font-bold text-[#003087] mb-2">Self Assessment</h3>
                                <p className="text-[#333333] text-[15px] leading-relaxed">Please rate your performance honestly on each question below from -2 (Strongly Disagree) to +2 (Strongly Agree).</p>
                            </div>
                            <EvaluationForm
                                questions={questions}
                                onSubmit={handleConfirmedSubmit}
                                submitLabel="Submit Self Assessment"
                                draftKey={`draft_assessment_${user?.id}_${status.quarter?.id}`}
                                confirmMessage="Once submitted, you cannot change your answers. Are you sure you want to proceed?"
                            />
                        </>
                    )}

                    {/* ── SUBMITTED: Show results ── */}
                    {status?.submitted && (
                        <>
                            {/* Success banner + score */}
                            <div className="bg-white border-2 border-[#A5D6A7] rounded-xl p-6 md:p-8 shadow-sm relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-[#E8F5E9] rounded-bl-full -z-10 opacity-50"></div>
                                <div className="flex flex-col md:flex-row items-center gap-6">
                                    <div className="w-16 h-16 rounded-full bg-[#E8F5E9] flex items-center justify-center shrink-0 border border-[#A5D6A7]">
                                        <svg className="w-8 h-8 text-[#00843D]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                        </svg>
                                    </div>
                                    <div className="text-center md:text-left flex-1">
                                        <h3 className="text-[22px] font-bold text-[#003087] mb-1">Assessment Submitted</h3>
                                        <p className="text-[#333333] text-[15px]">
                                            Submitted on {new Date(status.selfAssessment.submittedAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                                        </p>
                                    </div>
                                    <div className="text-center md:text-right bg-[#FAFAFA] border border-[#E0E0E0] rounded-xl p-4 min-w-[140px]">
                                        <p className="text-[12px] text-[#666666] font-bold uppercase tracking-wider mb-1">Total Score</p>
                                        <p className="text-[32px] font-black text-[#00843D] leading-none">
                                            {status.selfAssessment.totalScore.toFixed(1)}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Stage Progress Pipeline */}
                            {status.stages.length > 0 && (
                                <div className="bg-white border border-[#E0E0E0] shadow-sm rounded-xl p-6">
                                    <h4 className="text-[18px] font-bold text-[#003087] mb-6 flex items-center gap-3">
                                        <svg className="w-5 h-5 text-[#F7941D]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                                        Your Progress Pipeline
                                    </h4>
                                    <div className="space-y-4">
                                        {status.stages.map((s, i) => (
                                            <div key={i} className={`flex flex-col sm:flex-row sm:items-center gap-4 p-4 rounded-xl border ${s.status === "winner" ? "border-[#FFE082] bg-[#FFF8E1] shadow-sm" : s.status === "pending" ? "border-[#E0E0E0] bg-[#F5F5F5]" : "border-[#A5D6A7] bg-[#E8F5E9] shadow-sm"}`}>
                                                <div className="flex items-center gap-4 flex-1">
                                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-[15px] font-bold shrink-0 ${s.status === "pending" ? "bg-white border-2 border-[#CCCCCC] text-[#666666]" : s.status === "winner" ? "bg-[#F7941D] text-white shadow-md" : "bg-[#00843D] text-white shadow-md"}`}>
                                                        {s.stage}
                                                    </div>
                                                    <div>
                                                        <p className={`text-[16px] font-bold ${s.status === "pending" ? "text-[#333333]" : "text-[#1A1A2E]"}`}>{s.name}</p>
                                                        {s.detail && <p className="text-[13px] text-[#666666] mt-1 font-medium">{s.detail}</p>}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-4 shrink-0 sm:ml-auto pl-14 sm:pl-0">
                                                    {s.score !== null && (
                                                        <span className="text-[18px] font-black text-[#003087]">{s.score.toFixed(1)}</span>
                                                    )}
                                                    <StagePill status={s.status} />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Submitted Answers */}
                            {status.selfAssessment.answers.length > 0 && (
                                <div className="bg-white border border-[#E0E0E0] shadow-sm rounded-xl overflow-hidden mt-8">
                                    <div className="px-6 py-4 border-b border-[#E0E0E0] bg-[#F9FAFB]">
                                        <h4 className="text-[16px] font-bold text-[#003087]">Your Answers Record</h4>
                                    </div>
                                    <div className="divide-y divide-[#E0E0E0]">
                                        {status.selfAssessment.answers.map((a, i) => (
                                            <div key={i} className="px-6 py-4 flex flex-col sm:flex-row sm:items-start justify-between gap-4 hover:bg-[#FAFAFA] transition-colors">
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-[15px] text-[#1A1A2E] leading-relaxed font-medium">{a.questionText}</p>
                                                    <span className="text-[12px] px-2.5 py-1 rounded-full bg-[#E3F2FD] border border-[#90CAF9] text-[#003087] mt-3 inline-block font-bold">{a.category}</span>
                                                </div>
                                                <div className="bg-[#F5F5F5] border border-[#CCCCCC] rounded-lg px-4 py-2 shrink-0 text-center shadow-sm w-full sm:w-auto">
                                                    <p className="text-[20px] font-black text-[#003087] leading-none">{a.score > 0 ? `+${a.score}` : a.score}</p>
                                                    <p className="text-[11px] text-[#666666] font-bold uppercase mt-1">Score</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Current Standings (only when quarter is CLOSED) */}
                            {status.winner && (
                                <div className={`mt-8 rounded-2xl p-8 border-2 shadow-sm ${status.winner.isCurrentUser ? "bg-[#FFF8E1] border-[#FFE082]" : "bg-white border-[#E0E0E0]"}`}>
                                    <h4 className="text-[16px] font-bold text-[#666666] mb-6 tracking-wide uppercase">Final Quarter Result</h4>
                                    {status.winner.isCurrentUser ? (
                                        <div className="text-center">
                                            <span className="text-6xl block mb-4">🏆</span>
                                            <p className="text-[24px] font-black text-[#003087] leading-tight">Congratulations!</p>
                                            <p className="text-[20px] font-bold text-[#333333] mb-4">You are the Best Employee of the Quarter!</p>
                                            <div className="inline-block bg-white px-6 py-3 rounded-xl border border-[#FFE082] shadow-sm">
                                                <p className="text-[14px] text-[#666666] font-bold uppercase">Final Score</p>
                                                <p className="text-[#00843D] font-black text-[32px]">{status.winner.finalScore.toFixed(1)}</p>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col md:flex-row items-center gap-6 text-center md:text-left">
                                            <span className="text-5xl">🏆</span>
                                            <div className="flex-1">
                                                <p className="text-[#003087] font-black text-[22px] mb-1">{status.winner.name}</p>
                                                <p className="text-[#666666] text-[15px] font-medium">{status.winner.department} &middot; Final Score: <span className="text-[#00843D] font-bold text-[18px]">{status.winner.finalScore.toFixed(1)}</span></p>
                                            </div>
                                            <div className="bg-[#F5F5F5] px-6 py-4 border border-[#E0E0E0] rounded-xl w-full md:w-auto">
                                                <p className="text-[#666666] text-[13px] font-bold uppercase mb-1">Your Highest Stage</p>
                                                <p className="text-[#003087] font-black text-[20px]">Stage {status.currentStage}</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    )}

                    {/* No active quarter — either status is null or quarter is null */}
                    {(!status || !status.quarter) && !error && (
                        <div className="bg-[#F5F5F5] border border-[#E0E0E0] rounded-2xl p-12 text-center shadow-inner">
                            <span className="text-4xl block mb-4 opacity-50">📅</span>
                            <h3 className="text-[20px] font-bold text-[#333333] mb-2">No Active Evaluation Quarter</h3>
                            <p className="text-[#666666] text-[15px] font-medium max-w-md mx-auto mb-2">The current evaluation cycle has not started yet.</p>
                            <p className="text-[#666666] text-[14px] font-medium max-w-md mx-auto">Please contact <span className="font-bold text-[#003087]">RISHPAL KUMAWAT</span> (Admin) for more details.</p>
                        </div>
                    )}
                </div>
            )}

            {/* ═══════════════ HISTORY TAB ═══════════════ */}
            {tab === "history" && (
                <div className="space-y-6">
                    {!historyLoaded && (
                        <div className="space-y-4"><SkeletonCard lines={3} /><SkeletonCard lines={3} /></div>
                    )}
                    {historyLoaded && history.length === 0 && (
                        <div className="bg-[#F5F5F5] border border-[#E0E0E0] rounded-2xl p-12 text-center shadow-inner">
                            <span className="text-4xl block mb-4 opacity-50">📂</span>
                            <h3 className="text-[20px] font-bold text-[#333333] mb-2">No Participation History</h3>
                            <p className="text-[#666666] text-[15px] font-medium">You haven't participated in any completed quarters yet.</p>
                        </div>
                    )}

                    {history.map((h, i) => (
                        <div key={i} className={`bg-white border rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow ${h.isBestEmployee ? "border-2 border-[#FFE082]" : "border-[#E0E0E0]"}`}>
                            {/* Quarter Header */}
                            <div className={`px-6 py-5 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${h.isBestEmployee ? "bg-[#FFF8E1] border-[#FFE082]/50" : "bg-[#F9FAFB] border-[#E0E0E0]"}`}>
                                <div className="flex items-center gap-4">
                                    {h.isBestEmployee && <span className="text-3xl">🏆</span>}
                                    <div>
                                        <p className="text-[#003087] font-black text-[18px] mb-1">{h.quarter.name}</p>
                                        <p className="text-[#666666] text-[13px] font-medium">
                                            {new Date(h.quarter.startDate).toLocaleDateString()} — {new Date(h.quarter.endDate).toLocaleDateString()}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-3">
                                    <span className={`text-[12px] px-3.5 py-1.5 rounded-full border shadow-sm font-bold uppercase tracking-wider ${h.quarter.status === "ACTIVE" ? "bg-[#E8F5E9] text-[#1B5E20] border-[#A5D6A7]" : "bg-[#F5F5F5] text-[#666666] border-[#CCCCCC]"}`}>
                                        {h.quarter.status}
                                    </span>
                                    {h.isBestEmployee && (
                                        <span className="text-[12px] px-3.5 py-1.5 rounded-full bg-[#F7941D] text-white font-bold shadow uppercase tracking-wider">Best Employee</span>
                                    )}
                                </div>
                            </div>

                            {/* Scores & Progress */}
                            <div className="p-6">
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                                    <div className="bg-[#F5F5F5] border border-[#E0E0E0] shadow-sm rounded-xl p-4 text-center">
                                        <p className="text-[11px] text-[#666666] font-bold uppercase tracking-wider mb-1">Self Score</p>
                                        <p className="text-[24px] font-black text-[#003087]">{h.selfScore.toFixed(1)}</p>
                                    </div>
                                    <div className="bg-[#F5F5F5] border border-[#E0E0E0] shadow-sm rounded-xl p-4 text-center">
                                        <p className="text-[11px] text-[#666666] font-bold uppercase tracking-wider mb-1">Highest Stage</p>
                                        <p className="text-[24px] font-black text-[#003087]">{h.highestStage}</p>
                                    </div>
                                    {h.supervisorScore !== null && (
                                        <div className="bg-[#F5F5F5] border border-[#E0E0E0] shadow-sm rounded-xl p-4 text-center">
                                            <p className="text-[11px] text-[#666666] font-bold uppercase tracking-wider mb-1">Supervisor</p>
                                            <p className="text-[24px] font-black text-[#003087]">{h.supervisorScore.toFixed(1)}</p>
                                        </div>
                                    )}
                                    {h.cmFinalScore !== null && (
                                        <div className="bg-[#E8F5E9] border border-[#A5D6A7] shadow-sm rounded-xl p-4 text-center">
                                            <p className="text-[11px] text-[#1B5E20] font-bold uppercase tracking-wider mb-1">Final Score</p>
                                            <p className="text-[24px] font-black text-[#00843D]">{h.cmFinalScore.toFixed(1)}</p>
                                        </div>
                                    )}
                                </div>

                                {/* Stage progress dots */}
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-[12px] text-[#666666] font-bold">Stage 1</span>
                                    <span className="text-[12px] text-[#666666] font-bold">Stage 4</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    {[1, 2, 3, 4].map((s) => (
                                        <div key={s} className="flex items-center gap-1 flex-1">
                                            <div className={`w-full h-3 rounded-full transition-colors ${s <= h.highestStage ? "bg-[#00843D] shadow-sm" : "bg-[#E0E0E0] border border-[#CCCCCC]"}`} />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </DashboardShell>
    );
}
