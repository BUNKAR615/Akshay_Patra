"use client";

import { useState, useMemo, useEffect } from "react";
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
    { value: -2, label: "Strongly Disagree", labelHindi: "पूर्णतः असहमत", short: "-2", color: "bg-[#D32F2F] text-white border-[#D32F2F]", idle: "bg-white border border-[#D32F2F] text-[#D32F2F] hover:bg-[#D32F2F]/10" },
    { value: -1, label: "Disagree", labelHindi: "असहमत", short: "-1", color: "bg-[#F57C00] text-white border-[#F57C00]", idle: "bg-white border border-[#F57C00] text-[#F57C00] hover:bg-[#F57C00]/10" },
    { value: 0, label: "Neutral", labelHindi: "तटस्थ", short: "0", color: "bg-[#616161] text-white border-[#616161]", idle: "bg-white border border-[#616161] text-[#616161] hover:bg-[#616161]/10" },
    { value: 1, label: "Agree", labelHindi: "सहमत", short: "+1", color: "bg-[#388E3C] text-white border-[#388E3C]", idle: "bg-white border border-[#388E3C] text-[#388E3C] hover:bg-[#388E3C]/10" },
    { value: 2, label: "Strongly Agree", labelHindi: "पूर्णतः सहमत", short: "+2", color: "bg-[#1B5E20] text-white border-[#1B5E20]", idle: "bg-white border border-[#1B5E20] text-[#1B5E20] hover:bg-[#1B5E20]/10" },
];

const LANG_MODES = ["Both", "English", "हिंदी"];

export default function EvaluationForm({
    questions,
    onSubmit,
    submitLabel = "Submit Evaluation",
    confirmMessage = "Are you sure you want to submit this evaluation? This action cannot be undone.",
    disabled = false,
    draftKey = null,
}) {
    const [scores, setScores] = useState({});
    const [submitting, setSubmitting] = useState(false);
    const [langMode, setLangMode] = useState("Both");
    const [showErrors, setShowErrors] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [topError, setTopError] = useState("");

    // Load draft on mount
    useEffect(() => {
        if (!draftKey) return;
        try {
            const saved = localStorage.getItem(draftKey);
            if (saved) setScores(JSON.parse(saved));
        } catch (e) {
            console.error("Failed to load draft", e);
        }
    }, [draftKey]);

    // Save draft on change
    useEffect(() => {
        if (!draftKey) return;
        if (Object.keys(scores).length > 0) {
            localStorage.setItem(draftKey, JSON.stringify(scores));
        }
    }, [scores, draftKey]);

    // Page refresh protection
    useEffect(() => {
        if (Object.keys(scores).length > 0 && !submitting) {
            const handler = (e) => {
                e.preventDefault();
                const msg = "You have unsaved answers. Leave page?";
                e.returnValue = msg;
                return msg; // browsers like Chrome require return value
            };
            window.addEventListener("beforeunload", handler);
            return () => window.removeEventListener("beforeunload", handler);
        }
    }, [scores, submitting]);

    const answeredCount = Object.keys(scores).length;
    const totalCount = questions.length;
    const allAnswered = totalCount > 0 && answeredCount === totalCount;
    const progressPercent = totalCount > 0 ? (answeredCount / totalCount) * 100 : 0;

    // Running total
    const runningTotal = Object.values(scores).reduce((sum, v) => sum + v, 0);

    // Group questions by category
    const grouped = useMemo(() => {
        const map = new Map();
        questions.forEach((q) => {
            const cat = q.category || "INTEGRITY";
            if (!map.has(cat)) map.set(cat, []);
            map.get(cat).push(q);
        });
        return Array.from(map.entries());
    }, [questions]);

    const handleScore = (questionId, score) => {
        if (disabled) return;
        setScores((prev) => ({ ...prev, [questionId]: score }));
        setTopError(""); // Reset top error on any interaction
    };

    const handleInitialSubmitClick = () => {
        if (disabled || submitting) return;

        if (!allAnswered) {
            setShowErrors(true);
            setTopError("Please answer all questions before submitting.");
            // Find the first unanswered question and scroll to it
            setTimeout(() => {
                const firstError = document.querySelector('.question-error');
                if (firstError) firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 100);
            return;
        }

        setConfirmOpen(true);
    };

    const handleConfirmedSubmit = async () => {
        setConfirmOpen(false);
        setSubmitting(true);
        setTopError("");

        const answers = questions.map((q) => ({
            questionId: q.id,
            score: scores[q.id],
        }));

        try {
            await onSubmit(answers);
            // On success, clear the draft
            if (draftKey) {
                localStorage.removeItem(draftKey);
            }
        } catch (error) {
            // Keep answers intact if it fails
            setTopError(error.message || "Submission failed. Please try again.");
            setSubmitting(false);
        }
    };

    let questionIndex = 0;

    return (
        <div className="space-y-6">
            {/* Overlay during submission */}
            {submitting && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/50 backdrop-blur-sm">
                    <div className="bg-white p-6 rounded-2xl shadow-xl flex items-center gap-4">
                        <svg className="animate-spin h-6 w-6 text-[#003087]" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                        <p className="text-[16px] font-bold text-[#003087]">Submitting safely...</p>
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

            {/* Progress Header */}
            <div className="bg-white border border-[#E0E0E0] rounded-xl p-4 sticky top-0 z-10 shadow-sm">
                <div className="flex justify-between items-center mb-2">
                    <span className="text-[14px] text-[#333333]">
                        Question <span className="text-[#003087] font-bold">{Math.min(answeredCount + 1, totalCount)}</span> of{" "}
                        <span className="text-[#003087] font-bold">{totalCount}</span>
                    </span>
                    <span className="text-[14px] font-bold text-[#003087]">
                        {answeredCount}/{totalCount}
                    </span>
                </div>
                <div className="w-full bg-[#E0E0E0] rounded-full h-2">
                    <div
                        className="bg-[#00843D] h-2 rounded-full transition-all duration-500"
                        style={{ width: `${progressPercent}%` }}
                    />
                </div>
            </div>

            {/* Language Toggle + Scale Legend */}
            <div className="bg-white border border-[#E0E0E0] rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                {/* Language Toggle */}
                <div className="flex items-center gap-2">
                    <span className="text-[14px] font-medium text-[#333333]">Language:</span>
                    <div className="flex gap-1">
                        {LANG_MODES.map((mode) => (
                            <button
                                key={mode}
                                onClick={() => setLangMode(mode)}
                                className={`min-h-[44px] min-w-[60px] px-3 py-2 rounded-lg text-[14px] font-bold cursor-pointer transition-all ${langMode === mode
                                    ? "bg-[#003087] text-white shadow-sm"
                                    : "bg-white text-[#333333] border border-[#CCCCCC] hover:bg-[#F5F7FA]"
                                    }`}
                            >
                                {mode}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Scale Legend */}
                <div className="flex gap-2 flex-wrap sm:flex-nowrap">
                    {SCALE.map((s) => (
                        <span key={s.value} className="text-[12px] text-[#333333] flex items-center gap-1.5 font-medium">
                            <span className={`inline-block w-3 h-3 rounded-full ${s.color.split(' ')[0]}`} />
                            <span>{langMode === "हिंदी" ? s.labelHindi : langMode === "English" ? s.label : `${s.label} / ${s.labelHindi}`}</span>
                        </span>
                    ))}
                </div>
            </div>

            {/* Questions grouped by category */}
            {grouped.map(([category, catQuestions]) => (
                <div key={category} className="space-y-4">
                    <div className="flex items-center gap-2 pt-2">
                        <span className={`text-[12px] px-3 py-1 rounded-full font-bold border ${CATEGORY_COLORS[category] || "bg-gray-100 text-[#333333] border-gray-200"}`}>
                            {category}
                        </span>
                        <span className="text-[12px] text-[#666666] font-medium">{catQuestions.length} question{catQuestions.length !== 1 ? "s" : ""}</span>
                        <div className="flex-1 h-px bg-[#E0E0E0]" />
                    </div>

                    {catQuestions.map((q) => {
                        questionIndex++;
                        const currentIdx = questionIndex;
                        const isAnswered = scores[q.id] !== undefined;
                        const hasError = showErrors && !isAnswered;

                        return (
                            <div
                                key={q.id}
                                className={`bg-white border-2 rounded-xl p-4 sm:p-5 transition-colors ${hasError ? "question-error border-[#D32F2F] bg-[#FFEBEE]/30"
                                        : isAnswered ? "border-[#00843D]" : "border-[#E0E0E0] hover:border-[#003087]/50"
                                    }`}
                            >
                                <div className="flex items-start gap-4 mb-5">
                                    <span className={`text-[14px] font-mono mt-0.5 w-8 h-8 rounded-full flex items-center justify-center shrink-0 font-bold ${hasError ? "bg-[#D32F2F] text-white" : isAnswered ? "bg-[#E8F5E9] text-[#1B5E20]" : "bg-[#F5F7FA] text-[#333333] border border-[#CCCCCC]"}`}>
                                        {currentIdx}
                                    </span>
                                    <div className="flex-1">
                                        {(langMode === "Both" || langMode === "English") && (
                                            <p className="text-[#1A1A2E] font-medium text-[16px] leading-relaxed">{q.text}</p>
                                        )}
                                        {(langMode === "Both" || langMode === "हिंदी") && q.textHindi && (
                                            <p className={`text-[#333333] italic text-[15px] leading-relaxed border-l-2 pl-3 border-[#CCCCCC] ${langMode === "Both" ? "mt-3" : ""}`}>{q.textHindi}</p>
                                        )}
                                        {hasError && (
                                            <p className="text-[#D32F2F] text-[13px] font-bold mt-2 flex items-center gap-1">
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                                This question requires an answer
                                            </p>
                                        )}
                                    </div>
                                </div>

                                {/* -2 to +2 Rating Buttons Container */}
                                <div className="ml-0 sm:ml-12">
                                    <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                                        {SCALE.map((s) => (
                                            <button
                                                key={s.value}
                                                onClick={() => handleScore(q.id, s.value)}
                                                disabled={disabled}
                                                title={s.label}
                                                className={`min-h-[44px] sm:min-h-[48px] sm:min-w-[48px] p-2 sm:p-2 rounded-lg text-[14px] transition-all cursor-pointer box-border flex items-center justify-center sm:flex-col shadow-sm hover:shadow
                                                    ${scores[q.id] === s.value
                                                        ? `${s.color} ring-2 ring-offset-1 ring-${s.color.split(' ')[0].replace('bg-', '')}`
                                                        : `${s.idle}`
                                                    }
                                                    ${disabled ? "opacity-50 !bg-[#CCCCCC] !text-[#666666] !border-transparent cursor-not-allowed shadow-none" : ""}
                                                `}
                                            >
                                                <span className="block text-[13px] sm:text-[12px] sm:text-[13px] font-bold opacity-90 leading-tight text-center px-1">{langMode === "हिंदी" ? s.labelHindi : langMode === "English" ? s.label : `${s.label} / ${s.labelHindi}`}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ))}

            {/* Submit Section */}
            {totalCount > 0 && (
                <div className="pt-6 sticky bottom-4 z-10">
                    <div className="bg-white border border-[#E0E0E0] shadow-xl rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div className="text-center sm:text-left">
                            {!allAnswered ? (
                                <p className="text-[#D32F2F] text-[13px] font-bold">
                                    {totalCount - answeredCount} question{totalCount - answeredCount !== 1 ? "s" : ""} remaining
                                </p>
                            ) : (
                                <p className="text-[#1B5E20] text-[13px] font-bold">
                                    All questions answered ✓
                                </p>
                            )}
                        </div>
                        <button
                            onClick={handleInitialSubmitClick}
                            disabled={submitting || disabled}
                            className={`min-h-[52px] min-w-[120px] px-8 py-3 text-[15px] font-bold rounded-xl transition-all shadow-md cursor-pointer flex items-center justify-center
                                ${!allAnswered ? "bg-[#003087]/90 text-white hover:bg-[#003087]" : "bg-[#00843D] text-white hover:bg-[#00843D]/90"}
                                disabled:!bg-[#CCCCCC] disabled:!text-[#666666] disabled:border-transparent disabled:cursor-not-allowed
                            `}
                        >
                            {submitting ? "Processing..." : submitLabel}
                        </button>
                    </div>
                </div>
            )}

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
