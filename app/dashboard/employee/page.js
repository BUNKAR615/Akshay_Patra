"use client";

import { useState, useEffect } from "react";
import DashboardShell from "../../../components/DashboardShell";
import TimedEvaluationForm from "../../../components/TimedEvaluationForm";
import { SkeletonCard } from "../../../components/Skeleton";

async function api(url, opts) {
    const res = await fetch(url, opts);
    const json = await res.json();
    if (!res.ok) {
        if (res.status === 401) {
            window.location.replace("/login");
            return new Promise(() => { });
        }
        throw new Error(json.message || "Something went wrong. Please try again in a moment.");
    }
    if (!json.success) throw new Error(json.message || "Something went wrong. Please try again in a moment.");
    return json.data;
}

export default function EmployeeDashboard() {
    const [user, setUser] = useState(null);
    const [currentQuarterName, setCurrentQuarterName] = useState("");
    const [status, setStatus] = useState(null);
    const [questions, setQuestions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [successMsg, setSuccessMsg] = useState("");

    useEffect(() => {
        (async () => {
            const [meResult, statusResult, questionsResult] = await Promise.allSettled([
                api("/api/auth/me"),
                fetch("/api/employee/current-status", { headers: { "Content-Type": "application/json" } }).then(async (res) => {
                    if (!res.ok) throw new Error("Status fetch failed");
                    const json = await res.json();
                    if (!json.success) throw new Error(json.message);
                    return json.data;
                }),
                api("/api/assessment/questions"),
            ]);

            if (meResult.status === "fulfilled") {
                setUser(meResult.value.user);
                setCurrentQuarterName(meResult.value.currentQuarter);
            }
            if (statusResult.status === "fulfilled") {
                setStatus(statusResult.value);
            } else {
                setError("Unable to load quarter information.");
            }
            if (questionsResult.status === "fulfilled") {
                setQuestions(questionsResult.value.questions);
            }
            setLoading(false);
        })();
    }, []);

    const handleConfirmedSubmit = async ({ answers, completionTimeSeconds }) => {
        setError(null);
        setSuccessMsg("");
        try {
            await api("/api/assessment/submit", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ answers, completionTimeSeconds }),
            });
            try {
                const st = await api("/api/employee/current-status");
                setStatus(st);
            } catch { /* ignore */ }
            setQuestions([]);
            setSuccessMsg("Assessment submitted successfully! मूल्यांकन सफलतापूर्वक जमा किया गया।");
            window.scrollTo({ top: 0, behavior: "smooth" });
        } catch (e) {
            throw e;
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

    const dept = user?.department?.name || user?.departmentName || "—";

    return (
        <DashboardShell user={user} currentQuarter={currentQuarterName} title="Employee Dashboard">
            {/* Minimal profile header — name, empCode, department only */}
            {user && (
                <div className="bg-white border border-[#E0E0E0] rounded-xl p-5 mb-6 shadow-sm">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-3">
                        <div>
                            <p className="text-[11px] text-[#999999] font-bold uppercase tracking-wider">Name</p>
                            <p className="text-[16px] font-bold text-[#003087]">{user.name}</p>
                        </div>
                        <div>
                            <p className="text-[11px] text-[#999999] font-bold uppercase tracking-wider">Employee ID</p>
                            <p className="text-[16px] font-bold text-[#333333]">{user.empCode || "—"}</p>
                        </div>
                        <div>
                            <p className="text-[11px] text-[#999999] font-bold uppercase tracking-wider">Department</p>
                            <p className="text-[16px] font-bold text-[#333333]">{dept}</p>
                        </div>
                    </div>
                </div>
            )}

            {error && (
                <div className="mb-6 p-4 bg-[#FFEBEE] border-l-4 border-[#D32F2F] rounded-r-lg shadow-sm">
                    <p className="text-[#D32F2F] text-[14px] font-bold">⚠ {error}</p>
                </div>
            )}

            {successMsg && (
                <div className="mb-6 p-5 bg-[#E8F5E9] border-l-4 border-[#00843D] rounded-r-lg text-[#1B5E20] text-[15px] font-bold shadow-sm flex items-center gap-3">
                    <svg className="w-6 h-6 text-[#00843D] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {successMsg}
                </div>
            )}

            {/* Quarter header */}
            {status?.quarter && (
                <div className="bg-white border border-[#E0E0E0] shadow-sm rounded-xl p-5 mb-6 flex items-center justify-between">
                    <div>
                        <p className="text-[13px] text-[#666666] font-bold uppercase tracking-wider">Current Quarter</p>
                        <p className="text-[20px] font-bold text-[#003087]">{status.quarter.name}</p>
                    </div>
                    <span className={`text-[13px] px-4 py-1.5 rounded-full border font-bold ${status.quarter.status === "ACTIVE" ? "bg-[#E8F5E9] text-[#1B5E20] border-[#A5D6A7]" : "bg-[#F5F5F5] text-[#666666] border-[#CCCCCC]"}`}>
                        {status.quarter.status}
                    </span>
                </div>
            )}

            {/* Self-assessment form (not yet submitted) */}
            {status && !status.submitted && questions.length > 0 && (
                <>
                    <div className="bg-[#E3F2FD] border border-[#90CAF9] rounded-xl p-5 mb-6">
                        <h3 className="text-[18px] font-bold text-[#003087] mb-2">Self Assessment</h3>
                        <p className="text-[#333333] text-[15px] leading-relaxed">
                            Please rate your performance honestly on each question below from -2 (Strongly Disagree) to +2 (Strongly Agree).
                        </p>
                    </div>
                    <TimedEvaluationForm
                        questions={questions}
                        onSubmit={handleConfirmedSubmit}
                        submitLabel="Submit Self Assessment"
                        startTitle="Self Assessment"
                        startDescription="You will be shown one question at a time. Each question has a 30-second timer. Once answered, you cannot return to previous questions."
                    />
                </>
            )}

            {/* Already submitted */}
            {status?.submitted && (
                <div className="bg-[#F8FBFA] border-2 border-[#00843D] rounded-xl p-6 shadow-sm">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-8 h-8 rounded-full bg-[#00843D] flex items-center justify-center shrink-0 shadow-sm">
                            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                        <h3 className="text-[20px] font-black text-[#003087]">Assessment Submitted</h3>
                    </div>
                    <p className="text-[#333333] text-[15px] font-medium ml-11">
                        Your self-assessment has been recorded. Thank you for participating.
                    </p>
                </div>
            )}

            {/* No active quarter */}
            {(!status || !status.quarter) && !error && (
                <div className="bg-[#F5F5F5] border border-[#E0E0E0] rounded-2xl p-12 text-center shadow-inner">
                    <span className="text-4xl block mb-4 opacity-50">📅</span>
                    <h3 className="text-[20px] font-bold text-[#333333] mb-2">No Active Evaluation Quarter</h3>
                    <p className="text-[#666666] text-[15px] font-medium max-w-md mx-auto">
                        The current evaluation cycle has not started yet.
                    </p>
                </div>
            )}
        </DashboardShell>
    );
}
