"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import ConfirmDialog from "./ConfirmDialog";

const CATEGORY_COLORS = {
    ATTENDANCE: "bg-sky-500/10 text-sky-400 border-sky-500/20",
    DISCIPLINE: "bg-violet-500/10 text-violet-400 border-violet-500/20",
    PRODUCTIVITY: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    TEAMWORK: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    INITIATIVE: "bg-rose-500/10 text-rose-400 border-rose-500/20",
    COMMUNICATION: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
    INTEGRITY: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
};

const SCALE = [
    { value: -2, label: "Strongly Disagree", short: "-2", color: "bg-[#D32F2F] text-white border-[#D32F2F]", idle: "bg-white border border-[#D32F2F] text-[#D32F2F] hover:bg-[#D32F2F]/10" },
    { value: -1, label: "Disagree", short: "-1", color: "bg-[#F57C00] text-white border-[#F57C00]", idle: "bg-white border border-[#F57C00] text-[#F57C00] hover:bg-[#F57C00]/10" },
    { value: 0, label: "Neutral", short: "0", color: "bg-[#616161] text-white border-[#616161]", idle: "bg-white border border-[#616161] text-[#616161] hover:bg-[#616161]/10" },
    { value: 1, label: "Agree", short: "+1", color: "bg-[#388E3C] text-white border-[#388E3C]", idle: "bg-white border border-[#388E3C] text-[#388E3C] hover:bg-[#388E3C]/10" },
    { value: 2, label: "Strongly Agree", short: "+2", color: "bg-[#1B5E20] text-white border-[#1B5E20]", idle: "bg-white border border-[#1B5E20] text-[#1B5E20] hover:bg-[#1B5E20]/10" },
];

const LANG_MODES = ["Both", "English", "हिंदी"];
const TIME_LIMIT_SECONDS = 30;

export default function TimedEvaluationForm({
    questions,
    onSubmit,
    submitLabel = "Submit Assessment",
    confirmMessage = "Are you sure you want to submit this assessment? This action cannot be undone.",
}) {
    // 1-by-1 Flow State
    const [currentIndex, setCurrentIndex] = useState(0);
    const [answers, setAnswers] = useState([]);
    
    // Timer State
    const [timeLeft, setTimeLeft] = useState(TIME_LIMIT_SECONDS);
    const [totalTimeTaken, setTotalTimeTaken] = useState(0);

    const [submitting, setSubmitting] = useState(false);
    const [langMode, setLangMode] = useState("Both");
    const [topError, setTopError] = useState("");
    const [confirmOpen, setConfirmOpen] = useState(false);

    // Refs for timer management
    const timerRef = useRef(null);
    const totalTimeRef = useRef(0);

    const isFinished = currentIndex >= questions.length;
    const currentQuestion = !isFinished ? questions[currentIndex] : null;

    // Start/Manage the per-question timer
    useEffect(() => {
        if (isFinished || submitting) {
            clearInterval(timerRef.current);
            return;
        }

        setTimeLeft(TIME_LIMIT_SECONDS);

        timerRef.current = setInterval(() => {
            setTimeLeft((prev) => {
                if (prev <= 1) {
                    // Time's up! Auto-skip logic
                    clearInterval(timerRef.current);
                    handleTimeUp();
                    return 0;
                }
                return prev - 1;
            });
            totalTimeRef.current += 1; // Increment total time every second
            setTotalTimeTaken(totalTimeRef.current);
        }, 1000);

        return () => clearInterval(timerRef.current);
    }, [currentIndex, isFinished, submitting]);

    // Page refresh protection
    useEffect(() => {
        if (currentIndex > 0 && !submitting) {
            const handler = (e) => {
                e.preventDefault();
                const msg = "You have unsaved answers. Leave page?";
                e.returnValue = msg;
                return msg;
            };
            window.addEventListener("beforeunload", handler);
            return () => window.removeEventListener("beforeunload", handler);
        }
    }, [currentIndex, submitting]);

    // Auto-skip handler
    const handleTimeUp = () => {
        if (isFinished) return;
        
        // Record a neutral score of 0 when skipped
        setAnswers((prev) => [
            ...prev,
            { questionId: currentQuestion.id, score: 0 }
        ]);
        
        setCurrentIndex((prev) => prev + 1);
    };

    // User selected a score
    const handleScoreSelect = (score) => {
        if (isFinished || submitting) return;

        clearInterval(timerRef.current);
        
        setAnswers((prev) => [
            ...prev,
            { questionId: currentQuestion.id, score: score }
        ]);
        
        setCurrentIndex((prev) => prev + 1);
    };

    const handleInitialSubmitClick = () => {
        if (submitting) return;
        setConfirmOpen(true);
    };

    const handleConfirmedSubmit = async () => {
        setConfirmOpen(false);
        setSubmitting(true);
        setTopError("");

        try {
            await onSubmit({
                answers,
                completionTimeSeconds: totalTimeTaken
            });
        } catch (error) {
            setTopError(error.message || "Submission failed. Please try again.");
            setSubmitting(false);
        }
    };

    // Rendering Summary if finished
    if (isFinished) {
        return (
            <div className="bg-white border border-[#E0E0E0] shadow-sm rounded-xl p-8 text-center space-y-6">
                <span className="text-5xl block">✅</span>
                <div>
                    <h3 className="text-[22px] font-black text-[#003087] mb-2">All Questions Answered</h3>
                    <p className="text-[#666666] text-[15px]">You have completed {questions.length} questions in {Math.round(totalTimeTaken / 60)}m {totalTimeTaken % 60}s.</p>
                </div>
                
                {topError && (
                    <div className="bg-[#FFEBEE] border border-[#EF9A9A] rounded-xl p-4 flex gap-3 shadow-sm text-left max-w-lg mx-auto">
                        <svg className="w-5 h-5 text-[#D32F2F] shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        <p className="text-[#D32F2F] text-[13px] font-bold">{topError}</p>
                    </div>
                )}
                
                <button
                    onClick={handleInitialSubmitClick}
                    disabled={submitting}
                    className="min-h-[52px] min-w-[200px] px-8 py-3 bg-[#00843D] text-white text-[16px] font-bold rounded-xl transition-all shadow-md hover:bg-[#00843D]/90 disabled:!bg-[#CCCCCC] disabled:!text-[#666666] disabled:cursor-not-allowed mx-auto block"
                >
                    {submitting ? "Submitting..." : submitLabel}
                </button>

                <ConfirmDialog
                    open={confirmOpen}
                    title="Submit Evaluation?"
                    message={confirmMessage}
                    confirmLabel="Yes, Submit"
                    cancelLabel="No, Go Back"
                    variant="warning"
                    loading={submitting}
                    onConfirm={handleConfirmedSubmit}
                    onCancel={() => setConfirmOpen(false)}
                />
            </div>
        );
    }

    const progressPercent = (currentIndex / questions.length) * 100;
    const cat = currentQuestion?.category || "INTEGRITY";

    return (
        <div className="space-y-6">
            {/* Overlay during submission */}
            {submitting && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/50 backdrop-blur-sm">
                    <div className="bg-white p-6 rounded-2xl shadow-xl flex items-center gap-4">
                        <svg className="animate-spin h-6 w-6 text-[#003087]" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                        <p className="text-[16px] font-bold text-[#003087]">Processing safely...</p>
                    </div>
                </div>
            )}

            {/* Error Banner */}
            {topError && (
                <div className="bg-[#FFEBEE] border border-[#EF9A9A] rounded-xl p-4 flex gap-3 shadow-sm">
                    <svg className="w-5 h-5 text-[#D32F2F] shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    <p className="text-[#D32F2F] text-[13px] font-bold">{topError}</p>
                </div>
            )}

            {/* Header: Progress & Timer */}
            <div className="bg-white border border-[#E0E0E0] rounded-xl p-4 sticky top-0 z-10 shadow-sm flex flex-col gap-3 object-contain">
                <div className="flex justify-between items-center w-full">
                    <span className="text-[14px] text-[#333333]">
                        Question <span className="text-[#003087] font-bold">{currentIndex + 1}</span> of{" "}
                        <span className="text-[#003087] font-bold">{questions.length}</span>
                    </span>
                    
                    <div className="flex items-center gap-2">
                        <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full font-bold text-[14px] shadow-sm border ${timeLeft <= 5 ? "bg-[#FFEBEE] text-[#D32F2F] border-[#EF9A9A] animate-pulse" : "bg-[#F5F7FA] text-[#003087] border-[#CCCCCC]"}`}>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            {timeLeft}s
                        </div>
                    </div>
                </div>
                <div className="w-full bg-[#E0E0E0] rounded-full h-2">
                    <div
                        className="bg-[#00843D] h-2 rounded-full transition-all duration-300"
                        style={{ width: `${progressPercent}%` }}
                    />
                </div>
            </div>

            {/* Language Toggle */}
            <div className="bg-white border border-[#E0E0E0] rounded-xl p-4 flex items-center justify-between">
                <span className="text-[14px] font-medium text-[#333333]">Language:</span>
                <div className="flex gap-1">
                    {LANG_MODES.map((mode) => (
                        <button
                            key={mode}
                            onClick={() => setLangMode(mode)}
                            className={`min-h-[36px] min-w-[60px] px-3 py-1 rounded-lg text-[13px] font-bold cursor-pointer transition-all ${langMode === mode
                                ? "bg-[#003087] text-white shadow-sm"
                                : "bg-white text-[#333333] border border-[#CCCCCC] hover:bg-[#F5F7FA]"
                                }`}
                        >
                            {mode}
                        </button>
                    ))}
                </div>
            </div>

            {/* The Active Question */}
            <div className="bg-white border-2 border-[#E0E0E0] rounded-xl p-6 md:p-10 shadow-sm min-h-[300px] flex flex-col justify-center gap-8">
                
                <div className="flex justify-center">
                    <span className={`text-[12px] px-3 py-1 rounded-full font-bold border inline-block ${CATEGORY_COLORS[cat] || "bg-gray-100 text-[#333333] border-gray-200"}`}>
                        {cat}
                    </span>
                </div>

                <div className="text-center space-y-4">
                    {(langMode === "Both" || langMode === "English") && (
                        <h2 className="text-[#1A1A2E] font-black text-[20px] md:text-[24px] leading-relaxed max-w-3xl mx-auto">
                            {currentQuestion.text}
                        </h2>
                    )}
                    {(langMode === "Both" || langMode === "हिंदी") && currentQuestion.textHindi && (
                        <p className="text-[#666666] font-medium text-[16px] md:text-[18px] leading-relaxed max-w-2xl mx-auto">
                            {currentQuestion.textHindi}
                        </p>
                    )}
                </div>

                {/* Rating Buttons */}
                <div className="grid grid-cols-5 gap-2 md:gap-4 max-w-4xl mx-auto w-full mt-4">
                    {SCALE.map((s) => (
                        <button
                            key={s.value}
                            onClick={() => handleScoreSelect(s.value)}
                            disabled={submitting}
                            className={`min-h-[80px] p-2 md:p-4 rounded-xl text-[14px] transition-all cursor-pointer box-border flex flex-col items-center justify-center shadow-sm hover:shadow hover:-translate-y-1 active:translate-y-0
                                ${s.idle} hover:border-${s.color.split(' ')[0].replace('bg-', '')}
                            `}
                        >
                            <span className="block text-[22px] md:text-[28px] font-black mb-1">{s.short}</span>
                            <span className="block text-[11px] md:text-[13px] font-bold opacity-90 leading-tight text-center px-1 break-words w-full">{s.label}</span>
                        </button>
                    ))}
                </div>
            </div>
            
            <div className="text-center mt-4">
                 <p className="text-[14px] text-[#666666] flex items-center justify-center gap-1">
                     <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                     Once a question is answered, you cannot return to it.
                 </p>
            </div>
        </div>
    );
}
