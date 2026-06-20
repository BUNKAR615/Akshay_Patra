"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "../../../../lib/clientApi";
import { AP } from "../../../../components/ui/tokens";

const ACCENT = "#F7941D";
const TYPE_LABEL = { SINGLE: "Single choice", MULTIPLE: "Multiple choice", SHORT: "Short answer", LONG: "Long answer", RATING: "Rating" };

export default function TakeExamPage() {
    const { id } = useParams();
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [exam, setExam] = useState(null);
    const [questions, setQuestions] = useState([]);
    const [answers, setAnswers] = useState({});
    const [index, setIndex] = useState(0);
    const [submitted, setSubmitted] = useState(false);
    const [result, setResult] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [startedAt] = useState(() => Date.now());

    useEffect(() => {
        (async () => {
            try {
                const d = await api(`/api/exam/${id}/take`);
                setExam(d.exam);
                setQuestions(d.questions || []);
                setAnswers(d.savedAnswers || {});
                if (d.submitted) setSubmitted(true);
            } catch (e) {
                console.error("[Take] load failed:", e);
            } finally { setLoading(false); }
        })();
    }, [id]);

    const total = questions.length;
    const cur = questions[index];
    const isLast = index === total - 1;
    const progress = total ? Math.round(((index + 1) / total) * 100) : 0;
    const answeredCount = useMemo(
        () => questions.filter((q) => {
            const a = answers[q.id];
            if (a == null) return false;
            if (Array.isArray(a.choiceIds)) return a.choiceIds.length > 0;
            return a.textValue || a.ratingValue != null;
        }).length,
        [questions, answers]
    );

    const setChoice = (qid, choiceId, multiple) => {
        setAnswers((prev) => {
            const cur = prev[qid]?.choiceIds || [];
            if (multiple) {
                const next = cur.includes(choiceId) ? cur.filter((c) => c !== choiceId) : [...cur, choiceId];
                return { ...prev, [qid]: { choiceIds: next } };
            }
            return { ...prev, [qid]: { choiceIds: [choiceId] } };
        });
    };
    const setText = (qid, v) => setAnswers((p) => ({ ...p, [qid]: { textValue: v } }));
    const setRating = (qid, n) => setAnswers((p) => ({ ...p, [qid]: { ratingValue: n } }));

    const submit = async () => {
        setSubmitting(true);
        try {
            const payload = {
                timeTakenSec: Math.round((Date.now() - startedAt) / 1000),
                answers: questions.map((q) => ({
                    questionId: q.id,
                    choiceIds: answers[q.id]?.choiceIds || [],
                    textValue: answers[q.id]?.textValue || null,
                    ratingValue: answers[q.id]?.ratingValue ?? null,
                })).filter((a) => a.choiceIds.length || a.textValue || a.ratingValue != null),
            };
            const d = await api(`/api/exam/${id}/take`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
            setResult(d);
            setSubmitted(true);
        } catch (e) {
            console.error("[Take] submit failed:", e);
            alert("Could not submit. Please try again.");
        } finally { setSubmitting(false); }
    };

    if (loading) {
        return <div className="min-h-screen flex items-center justify-center bg-ap-bg text-ap-text-muted">Loading exam…</div>;
    }

    return (
        <div className="min-h-screen min-h-[100dvh] bg-ap-bg flex flex-col">
            {/* Top bar */}
            <header className="h-[60px] bg-white border-b border-ap-border flex items-center gap-3 px-5 shrink-0">
                <div style={{ background: ACCENT }} className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0">
                    <svg width="15" height="15" fill="none" viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </div>
                <div className="min-w-0">
                    <p className="text-[13.5px] font-extrabold text-ap-text truncate leading-tight">{exam?.title}</p>
                    <p className="text-[10.5px] text-ap-text-faint">Akshaya Patra · Online Exam</p>
                </div>
                <div className="flex-1" />
                <button onClick={() => router.back()} className="text-[13px] font-bold text-ap-text-muted border border-ap-border rounded-lg px-3 py-1.5 hover:bg-ap-bg cursor-pointer">Exit</button>
            </header>

            <main className="flex-1 overflow-y-auto px-4 py-8">
                {submitted ? (
                    <Confirmation result={result} total={total} answeredCount={answeredCount} onRestart={() => { setSubmitted(false); setIndex(0); }} />
                ) : total === 0 ? (
                    <div className="max-w-[680px] mx-auto text-center text-ap-text-muted">This exam has no questions yet.</div>
                ) : (
                    <div className="max-w-[680px] mx-auto">
                        {/* Progress header */}
                        <div className="flex items-center justify-between mb-2 text-[13px]">
                            <span className="font-bold text-ap-text">Question {index + 1} of {total}</span>
                            <span className="text-ap-text-muted">{progress}% complete</span>
                        </div>
                        <div className="h-[7px] bg-gray-200 rounded-full overflow-hidden mb-7">
                            <div style={{ width: `${progress}%`, background: ACCENT }} className="h-full rounded-full transition-all duration-300" />
                        </div>

                        {/* Question card */}
                        <div className="bg-white rounded-[16px] p-8" style={{ borderTop: `4px solid ${ACCENT}` }}>
                            <div className="flex items-center gap-2 mb-4">
                                <span style={{ background: "#FEF4E8", color: "#C2410C" }} className="text-[11px] font-bold px-2.5 py-0.5 rounded-full">{TYPE_LABEL[cur.type]}</span>
                                {cur.required && <span className="text-[11px] font-bold text-red-500">* Required</span>}
                            </div>
                            <h2 className="text-[20px] font-bold text-ap-text leading-snug">{cur.text}</h2>
                            {cur.hint && <p className="text-[13.5px] text-ap-text-muted mt-1.5">{cur.hint}</p>}

                            <div className="mt-6">
                                <QuestionInput cur={cur} answer={answers[cur.id]} setChoice={setChoice} setText={setText} setRating={setRating} />
                            </div>
                        </div>

                        {/* Footer nav */}
                        <div className="flex items-center justify-between mt-7">
                            <button
                                onClick={() => setIndex((i) => Math.max(0, i - 1))}
                                disabled={index === 0}
                                style={{ color: index === 0 ? "#CBD5E1" : "#475569" }}
                                className="text-[14px] font-bold disabled:cursor-not-allowed cursor-pointer px-2"
                            >
                                ← Previous
                            </button>
                            <div className="flex items-center gap-1.5">
                                {questions.map((q, i) => (
                                    <span key={q.id} style={{ background: i === index ? ACCENT : i < index ? "#F7B968" : "#E4E7ED" }} className="w-2 h-2 rounded-full transition-colors" />
                                ))}
                            </div>
                            <button
                                onClick={() => (isLast ? submit() : setIndex((i) => Math.min(total - 1, i + 1)))}
                                disabled={submitting}
                                style={{ background: isLast ? AP.green : ACCENT }}
                                className="text-white text-[14px] font-bold rounded-[10px] px-6 py-2.5 cursor-pointer disabled:opacity-60 transition"
                            >
                                {isLast ? (submitting ? "Submitting…" : "Submit") : "Next →"}
                            </button>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}

function QuestionInput({ cur, answer, setChoice, setText, setRating }) {
    if (cur.type === "SINGLE" || cur.type === "MULTIPLE") {
        const multiple = cur.type === "MULTIPLE";
        const picked = answer?.choiceIds || [];
        return (
            <div className="space-y-2.5">
                {cur.choices.map((c) => {
                    const sel = picked.includes(c.id);
                    return (
                        <button
                            key={c.id}
                            onClick={() => setChoice(cur.id, c.id, multiple)}
                            style={{ background: sel ? "#FEF7EE" : "#fff", borderColor: sel ? ACCENT : "#E4E7ED" }}
                            className="w-full flex items-center gap-3 border-[1.5px] rounded-xl px-4 py-3 text-left cursor-pointer transition"
                        >
                            <span
                                style={{ borderColor: sel ? ACCENT : "#CBD5E1", background: sel ? ACCENT : "#fff", borderRadius: multiple ? 6 : "50%" }}
                                className="w-[22px] h-[22px] border-2 flex items-center justify-center shrink-0"
                            >
                                {sel && <svg width="13" height="13" fill="none" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                            </span>
                            <span className="text-[14.5px] text-ap-text">{c.label}</span>
                        </button>
                    );
                })}
            </div>
        );
    }
    if (cur.type === "SHORT") {
        return <input value={answer?.textValue || ""} onChange={(e) => setText(cur.id, e.target.value)} placeholder="Type your answer…" className="w-full border-[1.5px] border-gray-300 focus:border-ap-orange rounded-xl px-4 py-3 text-[14.5px] outline-none transition" />;
    }
    if (cur.type === "LONG") {
        return <textarea value={answer?.textValue || ""} onChange={(e) => setText(cur.id, e.target.value)} rows={5} placeholder="Write a few sentences…" className="w-full border-[1.5px] border-gray-300 focus:border-ap-orange rounded-xl px-4 py-3 text-[14.5px] outline-none transition resize-y" />;
    }
    if (cur.type === "RATING") {
        return (
            <div className="flex items-center gap-2.5">
                {[1, 2, 3, 4, 5].map((n) => {
                    const sel = answer?.ratingValue === n;
                    return (
                        <button key={n} onClick={() => setRating(cur.id, n)} style={{ background: sel ? ACCENT : "#fff", borderColor: sel ? ACCENT : "#E4E7ED", color: sel ? "#fff" : "#64748B" }} className="w-12 h-12 border-[1.5px] rounded-xl text-[16px] font-bold cursor-pointer transition">{n}</button>
                    );
                })}
            </div>
        );
    }
    return null;
}

function Confirmation({ result, total, answeredCount, onRestart }) {
    return (
        <div className="max-w-[520px] mx-auto bg-white border border-ap-border rounded-[18px] p-9 text-center mt-6">
            <div style={{ background: "#EBF7F1" }} className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5">
                <svg width="30" height="30" fill="none" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5" stroke="#00843D" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </div>
            <h2 className="text-[22px] font-extrabold text-ap-text mb-1.5">Response submitted</h2>
            <p className="text-[14px] text-ap-text-muted mb-6">Thank you for completing the exam. Your answers have been recorded.</p>
            <div className="flex items-center justify-center gap-8 py-4 border-y border-ap-border mb-6">
                <div><p className="text-[24px] font-extrabold text-ap-text">{answeredCount}/{total}</p><p className="text-[12px] text-ap-text-muted">Answered</p></div>
                <div><p className="text-[24px] font-extrabold text-ap-text">100%</p><p className="text-[12px] text-ap-text-muted">Complete</p></div>
                {result?.marks != null && (
                    <div><p className="text-[24px] font-extrabold" style={{ color: result.passed ? "#00843D" : "#B45309" }}>{result.marks}</p><p className="text-[12px] text-ap-text-muted">Marks</p></div>
                )}
            </div>
            <button onClick={onRestart} className="text-[13.5px] font-bold text-ap-text-muted border border-ap-border rounded-[10px] px-5 py-2.5 hover:bg-ap-bg cursor-pointer">Back to start</button>
        </div>
    );
}
