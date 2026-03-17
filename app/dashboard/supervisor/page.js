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
            return new Promise(() => { }); // never resolves, waits for redirect
        }
        throw new Error(json.message || "Something went wrong. Please try again in a moment.");
    }
    if (!json.success) throw new Error(json.message || "Something went wrong. Please try again in a moment.");
    return json.data;
}

export default function SupervisorDashboard() {
    const [user, setUser] = useState(null);
    const [currentQuarterName, setCurrentQuarterName] = useState("");
    const [shortlistData, setShortlistData] = useState(null);
    const [shortlist, setShortlist] = useState([]);
    const [questions, setQuestions] = useState([]);
    const [selectedEmployee, setSelectedEmployee] = useState(null);
    const [progress, setProgress] = useState({ evaluated: 0, total: 0 });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    const fetchData = async () => {
        try {
            const [meData, slData, qData] = await Promise.all([
                api("/api/auth/me"),
                api("/api/supervisor/shortlist"),
                api("/api/supervisor/questions")
            ]);
            setUser(meData.user);
            setCurrentQuarterName(meData.currentQuarter);
            setShortlistData(slData);
            setShortlist(slData.shortlist);
            setProgress({ evaluated: slData.evaluatedCount, total: slData.totalShortlisted });
            setQuestions(qData.questions);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, []);

    const handleEvaluate = async (answers) => {
        setError(""); setSuccess("");
        try {
            const data = await api("/api/supervisor/evaluate", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ employeeId: selectedEmployee.userId, answers }),
            });
            setSuccess(`Success! Evaluation completed for ${selectedEmployee.user.name}. Score recorded: ${data.evaluation.combinedScore.toFixed(1)}`);
            setSelectedEmployee(null);
            setProgress(data.progress);
            window.scrollTo({ top: 0, behavior: "smooth" });

            // Refresh shortlist
            const slData = await api("/api/supervisor/shortlist");
            setShortlist(slData.shortlist);
            if (data.stage2Shortlist) setSuccess(`All evaluations complete! The top 5 employees have been selected for Stage 2.`);
        } catch (e) {
            throw e; // Rethrow so EvaluationForm catches it
        }
    };

    if (loading) {
        return (
            <DashboardShell user={user} currentQuarter={currentQuarterName} title="Supervisor Dashboard">
                <div className="flex items-center justify-center h-64">
                    <div className="flex flex-col items-center gap-4">
                        <div className="animate-spin h-10 w-10 border-4 border-[#003087] border-t-transparent rounded-full" />
                        <p className="text-[#003087] font-bold text-[16px]">Loading assignments...</p>
                    </div>
                </div>
            </DashboardShell>
        );
    }

    return (
        <DashboardShell user={user} currentQuarter={currentQuarterName} title="Supervisor Evaluation">
            {/* Profile Card */}
            {user && (
                <UserProfileCard
                    user={user}
                    extraInfo={{
                        label: "Evaluating",
                        value: `${progress.total} employees`,
                        color: "text-[#003087]"
                    }}
                />
            )}

            <div className="bg-white border border-[#E0E0E0] rounded-xl p-6 mb-8 shadow-sm">
                <div className="flex justify-between items-end mb-3">
                    <div>
                        <span className="text-[14px] text-[#666666] font-bold uppercase tracking-wider block mb-1">Evaluation Progress</span>
                        <span className="text-[15px] font-medium text-[#333333]">{progress.evaluated} of {progress.total} employees evaluated</span>
                    </div>
                    <span className="text-[24px] font-black text-[#003087] leading-none">{progress.evaluated}/{progress.total}</span>
                </div>
                <div className="w-full bg-[#F5F5F5] rounded-full h-3 border border-[#E0E0E0] overflow-hidden">
                    <div className="bg-[#00843D] h-full rounded-full transition-all duration-700 relative" style={{ width: `${progress.total > 0 ? (progress.evaluated / progress.total) * 100 : 0}%` }}>
                        <div className="absolute inset-0 bg-white/20 w-full" style={{ backgroundImage: 'linear-gradient(45deg, rgba(255,255,255,0.15) 25%, transparent 25%, transparent 50%, rgba(255,255,255,0.15) 50%, rgba(255,255,255,0.15) 75%, transparent 75%, transparent)', backgroundSize: '1rem 1rem' }}></div>
                    </div>
                </div>
            </div>

            {error && <div className="mb-6 p-4 bg-[#FFEBEE] border-l-4 border-[#D32F2F] rounded-r-lg text-[#D32F2F] text-[15px] font-bold shadow-sm">{error}</div>}
            {success && <div className="mb-6 p-5 bg-[#E8F5E9] border-l-4 border-[#00843D] rounded-r-lg text-[#1B5E20] text-[15px] font-bold shadow-sm flex gap-3 items-center">
                <svg className="w-6 h-6 text-[#00843D] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                {success}
            </div>}

            {selectedEmployee ? (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
                    <button onClick={() => setSelectedEmployee(null)} className="min-h-[44px] min-w-[80px] px-4 py-2 text-[14px] font-bold text-[#003087] bg-white border border-[#003087] rounded-lg hover:bg-[#003087] hover:text-white transition-all mb-6 flex items-center gap-2 cursor-pointer shadow-sm">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                        Back to Employee List
                    </button>

                    <div className="bg-[#E3F2FD] border border-[#90CAF9] rounded-xl p-6 mb-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                            <p className="text-[13px] text-[#003087]/80 font-bold uppercase tracking-wider mb-1">Currently Evaluating</p>
                            <p className="text-[#003087] font-black text-[22px] leading-tight">{selectedEmployee.user.name}</p>
                            <p className="text-[#333333] text-[15px] font-medium mt-1 flex items-center gap-2">
                                <svg className="w-4 h-4 text-[#666666]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                                {selectedEmployee.user.email}
                            </p>
                        </div>
                        <div className="bg-white px-4 py-2 rounded-lg border border-[#90CAF9] text-center shrink-0">
                            <p className="text-[12px] text-[#666666] font-bold uppercase mb-0.5">Shortlist Rank</p>
                            <p className="text-[20px] font-black text-[#003087]">#{selectedEmployee.rank}</p>
                        </div>
                    </div>

                    <EvaluationForm
                        questions={questions}
                        onSubmit={handleEvaluate}
                        submitLabel={`Submit Evaluation for ${selectedEmployee.user.name.split(' ')[0]}`}
                        draftKey={user?.id && shortlistData?.quarter?.id ? `draft_eval_${user.id}_${selectedEmployee.userId}_${shortlistData.quarter.id}` : null}
                    />
                </div>
            ) : (
                <div className="space-y-4">
                    <div className="flex items-center justify-between mb-4">
                        <p className="text-[#1A1A2E] font-bold text-[18px]">Shortlisted Employees</p>
                        <span className="text-[13px] text-[#666666] font-medium bg-[#F5F5F5] px-3 py-1 rounded-full border border-[#E0E0E0] hidden sm:block">Blind evaluation — previous scores hidden</span>
                    </div>

                    {shortlist.length === 0 ? (
                        <div className="bg-white border-2 border-[#E0E0E0] border-dashed rounded-2xl p-12 text-center shadow-sm">
                            <span className="text-5xl block mb-4 opacity-50">📋</span>
                            <h3 className="text-[20px] font-bold text-[#333333] mb-2">No Evaluations Pending</h3>
                            <p className="text-[#666666] text-[16px] max-w-md mx-auto">There are no employees waiting for your evaluation at this time. This may be because Stage 1 is not yet complete.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {shortlist.map((entry) => (
                                <div key={entry.userId} className={`bg-white border-2 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all duration-200 ${entry.alreadyEvaluated ? "border-[#A5D6A7] bg-[#F1F8E9] shadow-sm opacity-80 zoom-in-95" : "border-[#E0E0E0] shadow-sm hover:border-[#003087]/50 hover:shadow-md"}`}>
                                    <div className="flex items-center gap-4">
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-[15px] shrink-0 border ${entry.alreadyEvaluated ? "bg-[#E8F5E9] text-[#2E7D32] border-[#A5D6A7]" : "bg-[#F5F5F5] text-[#333333] border-[#CCCCCC]"}`}>
                                            #{entry.rank}
                                        </div>
                                        <div>
                                            <p className="text-[16px] font-bold text-[#003087] leading-tight mb-1">{entry.user.name}</p>
                                            <p className="text-[#666666] text-[13px] font-medium bg-[#F5F5F5] px-2 py-0.5 rounded-md inline-block border border-[#E0E0E0]">{entry.user.email}</p>
                                        </div>
                                    </div>
                                    <div className="mt-2 sm:mt-0">
                                        {entry.alreadyEvaluated ? (
                                            <span className="text-[13px] px-4 py-2 rounded-lg bg-white text-[#2E7D32] border border-[#A5D6A7] font-bold shadow-sm flex items-center gap-2 justify-center w-full sm:w-auto">
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                                Evaluated
                                            </span>
                                        ) : (
                                            <button onClick={() => setSelectedEmployee(entry)} className="min-h-[44px] min-w-[100px] text-[14px] px-5 py-2.5 bg-[#003087] text-white rounded-lg hover:bg-[#00843D] transition-colors cursor-pointer font-bold shadow flex items-center gap-2 justify-center w-full sm:w-auto">
                                                Start Evaluation
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
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
