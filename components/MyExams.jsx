"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "../lib/clientApi";
import { fmtDateTime } from "../lib/formatDateTime";

const ACCENT = "#F7941D";
const BLUE = "#003087";
const GREEN = "#00843D";

const PROGRESS_BADGE = {
    NOT_STARTED: { bg: "#FEF4E8", tx: "#C2410C", label: "Not started" },
    IN_PROGRESS: { bg: "#EEF3FB", tx: "#003087", label: "In progress" },
    SUBMITTED: { bg: "#E8F5E9", tx: "#1B5E20", label: "Completed" },
    CLOSED: { bg: "#FEF2F2", tx: "#DC2626", label: "Closed" },
};

/**
 * MyExams — lists the exams the signed-in employee was invited to. Quizzes the
 * admin publishes (status ACTIVE) appear here automatically so the employee can
 * start, resume, or review them straight from their dashboard.
 */
export default function MyExams() {
    const router = useRouter();
    const [exams, setExams] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const d = await api("/api/exam/my");
                setExams(d.exams || []);
            } catch (e) {
                console.error("[MyExams] load failed:", e);
                setError(true);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    // Stay quiet when there's nothing to show — no empty card cluttering the
    // dashboard for employees who have no assigned exams.
    if (loading || error || exams.length === 0) return null;

    return (
        <div className="bg-white border border-[#E0E0E0] rounded-xl p-5 mb-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
                <span style={{ background: "#FEF4E8", color: "#C2410C" }} className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0">
                    <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><path d="M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </span>
                <div>
                    <h3 className="text-[18px] font-bold text-[#003087] leading-tight">My Exams</h3>
                    <p className="text-[13px] text-[#666666]">Quizzes assigned to you</p>
                </div>
            </div>

            <div className="space-y-3">
                {exams.map((e) => {
                    const badge = PROGRESS_BADGE[e.progress] || PROGRESS_BADGE.NOT_STARTED;
                    const done = e.progress === "SUBMITTED";
                    const closed = e.progress === "CLOSED";
                    const ends = fmtDateTime(e.dueDate);
                    // Disabled = nothing actionable: completed-without-result, or closed.
                    const disabled = (done && e.marks == null) || closed;
                    const cta = closed ? "Closed"
                        : done ? (e.marks != null ? "View result" : "Completed")
                        : e.progress === "IN_PROGRESS" ? "Resume" : "Start exam";
                    const btnBg = closed ? "#9CA3AF" : done ? (e.marks != null ? BLUE : "#9CA3AF") : ACCENT;
                    return (
                        <div key={e.id} className="border border-[#E0E0E0] rounded-xl p-4 flex items-start gap-3 flex-wrap sm:flex-nowrap">
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <p className="text-[15px] font-bold text-[#333333] leading-tight">{e.title}</p>
                                    <span style={{ background: badge.bg, color: badge.tx }} className="text-[11px] font-bold px-2.5 py-0.5 rounded-full shrink-0">{badge.label}</span>
                                </div>
                                <p className="text-[12.5px] text-[#666666] mt-1">
                                    {e.questionCount} question{e.questionCount === 1 ? "" : "s"}
                                    {e.timeLimitMin ? ` · ${e.timeLimitMin} min` : " · Untimed"}
                                    {` · Pass ${e.passMark}%`}
                                    {ends ? ` · ${closed ? "Closed" : "Ends"} ${ends}` : ""}
                                </p>
                                {done && e.marks != null && (
                                    <p className="text-[12.5px] font-bold mt-1.5" style={{ color: e.passed ? GREEN : "#C2410C" }}>
                                        Score {Math.round(e.marks)}% — {e.passed ? "Passed" : "Below pass mark"}
                                    </p>
                                )}
                            </div>
                            <button
                                onClick={() => !disabled && router.push(`/exam/${e.id}/take`)}
                                disabled={disabled}
                                style={{ background: btnBg }}
                                className="text-white text-[13.5px] font-bold rounded-[10px] px-5 py-2.5 cursor-pointer transition hover:brightness-105 disabled:cursor-default disabled:opacity-90 shrink-0 whitespace-nowrap"
                            >
                                {cta} {!done && !closed && "→"}
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
