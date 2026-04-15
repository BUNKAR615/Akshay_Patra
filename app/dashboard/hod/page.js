"use client";

import { useState, useEffect } from "react";
import DashboardShell from "../../../components/DashboardShell";
import EvaluationForm from "../../../components/EvaluationForm";
import UserProfileCard from "../../../components/UserProfileCard";

async function api(url, opts) {
    const res = await fetch(url, opts);
    const json = await res.json();
    if (!res.ok) {
        if (res.status === 401) {
            window.location.replace("/login");
            return new Promise(() => {}); // never resolves, waits for redirect
        }
        throw new Error(json.message || "Something went wrong. Please try again in a moment.");
    }
    if (!json.success) throw new Error(json.message || "Something went wrong. Please try again in a moment.");
    return json.data;
}

const ACCENT = "#6A1B9A";
const ACCENT_LIGHT = "#F3E5F5";
const ACCENT_BORDER = "#CE93D8";
const ACCENT_BG = "#EDE7F6";

export default function HodDashboard() {
    const [user, setUser] = useState(null);
    const [currentQuarterName, setCurrentQuarterName] = useState("");
    const [shortlist, setShortlist] = useState([]);
    const [questions, setQuestions] = useState([]);
    const [selectedEmployee, setSelectedEmployee] = useState(null);
    const [progress, setProgress] = useState({ evaluated: 0, total: 0 });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    const fetchData = async () => {
        try {
            const [meData, shortlistData, qData] = await Promise.all([
                api("/api/auth/me"),
                api("/api/hod/shortlist"),
                api("/api/hod/questions"),
            ]);

            setUser(meData.user);
            setCurrentQuarterName(meData.currentQuarter || shortlistData.quarter?.name || "");
            const employees = shortlistData.shortlist || shortlistData.employees || [];
            setShortlist(employees);
            setQuestions(qData.questions || []);

            const evaluatedCount = employees.filter((e) => e.isEvaluated).length;
            setProgress({ evaluated: evaluatedCount, total: employees.length });
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleEvaluate = async (answers) => {
        setError("");
        setSuccess("");
        try {
            const data = await api("/api/hod/evaluate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ employeeId: selectedEmployee.id, answers }),
            });
            setSuccess(`Evaluation submitted for ${selectedEmployee.name}`);
            setSelectedEmployee(null);
            window.scrollTo({ top: 0, behavior: "smooth" });

            // Refresh shortlist
            const shortlistData = await api("/api/hod/shortlist");
            const employees = shortlistData.shortlist || shortlistData.employees || [];
            setShortlist(employees);
            const evaluatedCount = employees.filter((e) => e.isEvaluated).length;
            setProgress({ evaluated: evaluatedCount, total: employees.length });

            if (data.nextStageShortlist) {
                setSuccess("All evaluations complete! Top employees have been advanced to the next stage.");
            }
        } catch (e) {
            throw e; // Rethrow so EvaluationForm catches it
        }
    };

    if (loading) {
        return (
            <DashboardShell user={user} currentQuarter={currentQuarterName} title="HOD Dashboard">
                <div className="flex items-center justify-center h-64">
                    <div className="flex flex-col items-center gap-4">
                        <div className="animate-spin h-10 w-10 border-4 border-[#6A1B9A] border-t-transparent rounded-full" />
                        <p className="text-[#6A1B9A] font-bold text-[16px]">Loading assignments...</p>
                    </div>
                </div>
            </DashboardShell>
        );
    }

    const progressPercent = progress.total > 0 ? (progress.evaluated / progress.total) * 100 : 0;

    return (
        <DashboardShell user={user} currentQuarter={currentQuarterName} title="HOD Evaluation">
            {/* Profile Card */}
            {user && (
                <UserProfileCard
                    user={user}
                    roles={["HOD"]}
                    extraInfo={{
                        label: "Evaluating",
                        value: `${progress.total} employees`,
                        color: `text-[${ACCENT}]`,
                    }}
                />
            )}

            {/* Progress Bar */}
            <div className="bg-white border border-[#E0E0E0] rounded-xl p-6 mb-8 shadow-sm">
                <div className="flex justify-between items-end mb-3">
                    <div>
                        <span className="text-[14px] text-[#666666] font-bold uppercase tracking-wider block mb-1">
                            Evaluation Progress
                        </span>
                        <span className="text-[15px] font-medium text-[#333333]">
                            {progress.evaluated} of {progress.total} employees evaluated
                        </span>
                    </div>
                    <span className="text-[24px] font-black leading-none" style={{ color: ACCENT }}>
                        {progress.evaluated}/{progress.total}
                    </span>
                </div>
                <div className="w-full bg-[#F5F5F5] rounded-full h-3 border border-[#E0E0E0] overflow-hidden">
                    <div
                        className="h-full rounded-full transition-all duration-700 relative"
                        style={{
                            width: `${progressPercent}%`,
                            backgroundColor: ACCENT,
                        }}
                    >
                        <div
                            className="absolute inset-0 w-full"
                            style={{
                                backgroundImage:
                                    "linear-gradient(45deg, rgba(255,255,255,0.15) 25%, transparent 25%, transparent 50%, rgba(255,255,255,0.15) 50%, rgba(255,255,255,0.15) 75%, transparent 75%, transparent)",
                                backgroundSize: "1rem 1rem",
                            }}
                        />
                    </div>
                </div>
                {progress.total > 0 && progress.evaluated === progress.total && (
                    <p className="text-[#1B5E20] text-[13px] font-bold mt-3 flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                        All evaluations complete
                    </p>
                )}
            </div>

            {/* Messages */}
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

            {/* Evaluation Form (when employee selected) */}
            {selectedEmployee ? (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
                    <button
                        onClick={() => setSelectedEmployee(null)}
                        className="min-h-[44px] min-w-[80px] px-4 py-2 text-[14px] font-bold rounded-lg hover:text-white transition-all mb-6 flex items-center gap-2 cursor-pointer shadow-sm border"
                        style={{
                            color: ACCENT,
                            borderColor: ACCENT,
                            backgroundColor: "white",
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = ACCENT;
                            e.currentTarget.style.color = "white";
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = "white";
                            e.currentTarget.style.color = ACCENT;
                        }}
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                        </svg>
                        Back to Employee List
                    </button>

                    <div
                        className="rounded-xl p-6 mb-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 border"
                        style={{
                            backgroundColor: ACCENT_BG,
                            borderColor: ACCENT_BORDER,
                        }}
                    >
                        <div>
                            <p className="text-[13px] font-bold uppercase tracking-wider mb-1" style={{ color: ACCENT }}>
                                Currently Evaluating
                            </p>
                            <p className="font-black text-[22px] leading-tight" style={{ color: ACCENT }}>
                                {selectedEmployee.name}
                            </p>
                            <p className="text-[#333333] text-[15px] font-medium mt-1 flex items-center gap-2">
                                <svg className="w-4 h-4 text-[#666666]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                </svg>
                                {selectedEmployee.designation} | {selectedEmployee.empCode}
                                {selectedEmployee.department && ` | ${selectedEmployee.department}`}
                            </p>
                        </div>
                        <div
                            className="px-4 py-2 rounded-lg border text-[13px] font-bold uppercase tracking-wider"
                            style={{
                                backgroundColor: ACCENT_LIGHT,
                                borderColor: ACCENT_BORDER,
                                color: ACCENT,
                            }}
                        >
                            Blue Collar
                        </div>
                    </div>

                    <EvaluationForm
                        questions={questions}
                        onSubmit={handleEvaluate}
                        submitLabel={`Submit Evaluation for ${selectedEmployee.name.split(" ")[0]}`}
                        draftKey={user?.id ? `draft_hod_eval_${user.id}_${selectedEmployee.id}` : null}
                    />
                </div>
            ) : (
                /* Employee List */
                <div className="space-y-4">
                    <div className="flex items-center justify-between mb-4">
                        <p className="text-[#1A1A2E] font-bold text-[18px]">Blue Collar Employees to Evaluate</p>
                        <span className="text-[13px] text-[#666666] font-medium bg-[#F5F5F5] px-3 py-1 rounded-full border border-[#E0E0E0] hidden sm:block">
                            Blind evaluation — previous scores hidden
                        </span>
                    </div>

                    {shortlist.length === 0 ? (
                        <div className="bg-white border-2 border-[#E0E0E0] border-dashed rounded-2xl p-12 text-center shadow-sm">
                            <span className="text-5xl block mb-4 opacity-50">📋</span>
                            <h3 className="text-[20px] font-bold text-[#333333] mb-2">No Evaluations Pending</h3>
                            <p className="text-[#666666] text-[16px] max-w-md mx-auto">
                                There are no employees waiting for your evaluation at this time. This may be because the previous evaluation stage is not yet complete.
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {shortlist.map((entry) => (
                                <div
                                    key={entry.id}
                                    className={`bg-white border-2 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all duration-200 ${
                                        entry.isEvaluated
                                            ? "border-[#A5D6A7] bg-[#F1F8E9] shadow-sm opacity-80"
                                            : "border-[#E0E0E0] shadow-sm hover:shadow-md"
                                    }`}
                                    style={
                                        !entry.isEvaluated
                                            ? { "--hover-border": ACCENT }
                                            : undefined
                                    }
                                    onMouseEnter={(e) => {
                                        if (!entry.isEvaluated) e.currentTarget.style.borderColor = ACCENT_BORDER;
                                    }}
                                    onMouseLeave={(e) => {
                                        if (!entry.isEvaluated) e.currentTarget.style.borderColor = "#E0E0E0";
                                    }}
                                >
                                    <div className="flex items-center gap-4">
                                        <div
                                            className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-[15px] shrink-0 border ${
                                                entry.isEvaluated
                                                    ? "bg-[#E8F5E9] text-[#2E7D32] border-[#A5D6A7]"
                                                    : "border-[#CCCCCC]"
                                            }`}
                                            style={
                                                !entry.isEvaluated
                                                    ? { backgroundColor: ACCENT_LIGHT, color: ACCENT, borderColor: ACCENT_BORDER }
                                                    : undefined
                                            }
                                        >
                                            {entry.name.charAt(0)}
                                        </div>
                                        <div>
                                            <p className="text-[16px] font-bold leading-tight mb-1" style={{ color: ACCENT }}>
                                                {entry.name}
                                            </p>
                                            <p className="text-[#666666] text-[13px] font-medium bg-[#F5F5F5] px-2 py-0.5 rounded-md inline-block border border-[#E0E0E0]">
                                                {entry.designation} | {entry.empCode}
                                            </p>
                                            {entry.department && (
                                                <p className="text-[#999999] text-[12px] font-medium mt-1">{entry.department}</p>
                                            )}
                                        </div>
                                    </div>
                                    <div className="mt-2 sm:mt-0">
                                        {entry.isEvaluated ? (
                                            <div className="flex flex-col items-end gap-1">
                                                <span className="text-[13px] px-4 py-2 rounded-lg bg-white text-[#2E7D32] border border-[#A5D6A7] font-bold shadow-sm flex items-center gap-2 justify-center w-full sm:w-auto">
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                    </svg>
                                                    Evaluated
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
                                                className="min-h-[44px] min-w-[100px] text-[14px] px-5 py-2.5 text-white rounded-lg transition-colors cursor-pointer font-bold shadow flex items-center gap-2 justify-center w-full sm:w-auto"
                                                style={{ backgroundColor: ACCENT }}
                                                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#4A148C")}
                                                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = ACCENT)}
                                            >
                                                Start Evaluation
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
