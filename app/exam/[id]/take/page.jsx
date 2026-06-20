"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { api } from "../../../../lib/clientApi";

const ACCENT = "#F7941D";
const GREEN = "#00843D";
const TYPE_LABEL = { SINGLE: "Single choice", MULTIPLE: "Multiple choice", SHORT: "Short answer", LONG: "Long answer", RATING: "Rating", TRUE_FALSE: "True / False", LIKERT: "Likert scale", RANKING: "Ranking", POLL: "Poll", WORD_CLOUD: "Word cloud", PICTURE: "Picture choice" };
const LIKERT_LABELS = ["Strongly disagree", "Disagree", "Neutral", "Agree", "Strongly agree"];

function isAnswered(q, a) {
    if (a == null) return false;
    if (Array.isArray(a.choiceIds) && a.choiceIds.length) return true;
    if (a.textValue && a.textValue.trim()) return true;
    return a.ratingValue != null;
}
function fmtTime(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
}

export default function TakeExamPage() {
    const { id } = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();
    // External (token) takers hit the public take-external endpoint; internal
    // takers use the authenticated route. One URL drives all three calls.
    const token = searchParams.get("token");
    const external = !!token;
    const takeUrl = external
        ? `/api/exam/${id}/take-external?token=${encodeURIComponent(token)}`
        : `/api/exam/${id}/take`;

    const [loading, setLoading] = useState(true);
    const [exam, setExam] = useState(null);
    const [questions, setQuestions] = useState([]);
    const [answers, setAnswers] = useState({});
    const [bookmarks, setBookmarks] = useState(() => new Set());
    const [startedAtMs, setStartedAtMs] = useState(null);

    const [stage, setStage] = useState("welcome"); // welcome | exam | review | done
    const [index, setIndex] = useState(0);
    const [navOpen, setNavOpen] = useState(false);
    const [anim, setAnim] = useState("in");

    const [saveState, setSaveState] = useState("idle"); // idle | saving | saved | error
    const [submitting, setSubmitting] = useState(false);
    const [result, setResult] = useState(null);

    const dirtyRef = useRef(false);
    const submittingRef = useRef(false);
    const bmKey = `exam-bm-${id}`;

    // ── Load ──
    useEffect(() => {
        (async () => {
            try {
                const d = await api(takeUrl);
                setExam(d.exam);
                setQuestions(d.questions || []);
                setAnswers(d.savedAnswers || {});
                setStartedAtMs(d.startedAt ? new Date(d.startedAt).getTime() : Date.now());
                try {
                    const raw = localStorage.getItem(`exam-bm-${id}`);
                    if (raw) setBookmarks(new Set(JSON.parse(raw)));
                } catch { /* ignore */ }
                if (d.submitted) { setResult(d.result); setStage("done"); }
            } catch (e) {
                console.error("[Take] load failed:", e);
            } finally { setLoading(false); }
        })();
    }, [id, takeUrl]);

    const total = questions.length;
    const answeredCount = useMemo(
        () => questions.filter((q) => isAnswered(q, answers[q.id])).length,
        [questions, answers]
    );
    const hasProgress = answeredCount > 0;

    // ── Autosave (debounced) ──
    const serialize = useCallback(
        () => questions.map((q) => ({
            questionId: q.id,
            choiceIds: answers[q.id]?.choiceIds || [],
            textValue: answers[q.id]?.textValue || null,
            ratingValue: answers[q.id]?.ratingValue ?? null,
        })),
        [questions, answers]
    );
    useEffect(() => {
        if (stage !== "exam" || !dirtyRef.current) return;
        setSaveState("saving");
        const t = setTimeout(async () => {
            try {
                await api(takeUrl, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ answers: serialize() }) });
                setSaveState("saved");
            } catch { setSaveState("error"); }
        }, 900);
        return () => clearTimeout(t);
    }, [answers, stage, id, serialize, takeUrl]);

    // ── Timer ──
    const deadline = useMemo(
        () => (exam?.timeLimitMin && startedAtMs ? startedAtMs + exam.timeLimitMin * 60000 : null),
        [exam, startedAtMs]
    );
    const [nowMs, setNowMs] = useState(() => Date.now());
    useEffect(() => {
        if (stage !== "exam" || !deadline) return;
        const i = setInterval(() => setNowMs(Date.now()), 1000);
        return () => clearInterval(i);
    }, [stage, deadline]);
    const remaining = deadline ? Math.max(0, Math.round((deadline - nowMs) / 1000)) : null;

    const submit = useCallback(async () => {
        if (submittingRef.current) return;
        submittingRef.current = true;
        setSubmitting(true);
        try {
            const payload = {
                timeTakenSec: startedAtMs ? Math.round((Date.now() - startedAtMs) / 1000) : undefined,
                answers: serialize().filter((a) => a.choiceIds.length || a.textValue || a.ratingValue != null),
            };
            const d = await api(takeUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
            setResult(d.showResults ? d : null);
            try { localStorage.removeItem(bmKey); } catch { /* ignore */ }
            setStage("done");
        } catch (e) {
            console.error("[Take] submit failed:", e);
            alert("Could not submit. Please try again.");
        } finally { setSubmitting(false); submittingRef.current = false; }
    }, [serialize, startedAtMs, bmKey, takeUrl]);

    // Auto-submit when the timer hits zero.
    useEffect(() => {
        if (stage === "exam" && deadline && remaining === 0) submit();
    }, [remaining, stage, deadline, submit]);

    // ── Answer mutators ──
    const markDirty = () => { dirtyRef.current = true; };
    const setChoice = (qid, choiceId, multiple) => {
        markDirty();
        setAnswers((prev) => {
            const curIds = prev[qid]?.choiceIds || [];
            if (multiple) {
                const next = curIds.includes(choiceId) ? curIds.filter((c) => c !== choiceId) : [...curIds, choiceId];
                return { ...prev, [qid]: { choiceIds: next } };
            }
            return { ...prev, [qid]: { choiceIds: [choiceId] } };
        });
    };
    const setText = (qid, v) => { markDirty(); setAnswers((p) => ({ ...p, [qid]: { textValue: v } })); };
    const setRating = (qid, n) => { markDirty(); setAnswers((p) => ({ ...p, [qid]: { ratingValue: n } })); };
    const setRanking = (qid, orderedIds) => { markDirty(); setAnswers((p) => ({ ...p, [qid]: { choiceIds: orderedIds } })); };

    const toggleBookmark = (qid) => {
        setBookmarks((prev) => {
            const next = new Set(prev);
            next.has(qid) ? next.delete(qid) : next.add(qid);
            try { localStorage.setItem(bmKey, JSON.stringify([...next])); } catch { /* ignore */ }
            return next;
        });
    };

    const goTo = (i) => {
        if (i === index) return;
        setAnim(i > index ? "next" : "prev");
        setIndex(i);
        setNavOpen(false);
    };
    const next = () => (index < total - 1 ? goTo(index + 1) : setStage("review"));
    const prev = () => index > 0 && goTo(index - 1);

    if (loading) return <LoadingScreen />;

    return (
        <div className="min-h-screen min-h-[100dvh] flex flex-col" style={{ background: "#F4F6FA" }}>
            {stage === "welcome" && (
                <WelcomeScreen exam={exam} total={total} hasProgress={hasProgress} onStart={() => setStage("exam")} onExit={() => router.back()} />
            )}

            {stage === "exam" && total > 0 && (
                <ExamRunner
                    exam={exam} questions={questions} index={index} total={total}
                    answers={answers} bookmarks={bookmarks} answeredCount={answeredCount}
                    remaining={remaining} saveState={saveState} anim={anim} navOpen={navOpen}
                    setChoice={setChoice} setText={setText} setRating={setRating} setRanking={setRanking}
                    toggleBookmark={toggleBookmark} goTo={goTo} onPrev={prev} onNext={next}
                    setNavOpen={setNavOpen} onExit={() => router.back()} onReview={() => setStage("review")}
                />
            )}

            {stage === "exam" && total === 0 && (
                <CenterCard><p className="text-ap-text-muted">This exam has no questions yet.</p></CenterCard>
            )}

            {stage === "review" && (
                <ReviewScreen
                    questions={questions} answers={answers} bookmarks={bookmarks}
                    answeredCount={answeredCount} total={total} submitting={submitting}
                    onJump={(i) => { goTo(i); setStage("exam"); }} onBack={() => setStage("exam")} onSubmit={submit}
                />
            )}

            {stage === "done" && (
                <ResultScreen exam={exam} result={result} answeredCount={answeredCount} total={total} external={external} onExit={() => router.push("/dashboard/exam")} />
            )}

            <style jsx global>{`
                @keyframes apFadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
                @keyframes apSlideNext { from { opacity: 0; transform: translateX(28px); } to { opacity: 1; transform: translateX(0); } }
                @keyframes apSlidePrev { from { opacity: 0; transform: translateX(-28px); } to { opacity: 1; transform: translateX(0); } }
                @keyframes apPop { 0% { transform: scale(.8); opacity: 0; } 60% { transform: scale(1.05); } 100% { transform: scale(1); opacity: 1; } }
            `}</style>
        </div>
    );
}

// ─────────────────────────── Brand bits ───────────────────────────
function Logo({ size = 32 }) {
    return (
        <div style={{ background: ACCENT, width: size, height: size }} className="rounded-[10px] flex items-center justify-center shrink-0">
            <svg width={size * 0.5} height={size * 0.5} fill="none" viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </div>
    );
}
function LoadingScreen() {
    return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: "#F4F6FA" }}>
            <div className="w-10 h-10 rounded-full border-[3px] border-gray-200 animate-spin" style={{ borderTopColor: ACCENT }} />
            <p className="text-ap-text-muted text-[14px] font-semibold">Loading your exam…</p>
        </div>
    );
}
function CenterCard({ children }) {
    return <div className="flex-1 flex items-center justify-center p-6"><div className="bg-white border border-ap-border rounded-2xl p-10 text-center max-w-[480px]">{children}</div></div>;
}

// ─────────────────────────── Welcome ───────────────────────────
function WelcomeScreen({ exam, total, hasProgress, onStart, onExit }) {
    const metas = [
        { label: "Questions", value: total },
        { label: "Time limit", value: exam?.timeLimitMin ? `${exam.timeLimitMin} min` : "Untimed" },
        { label: "Pass mark", value: `${exam?.passMark ?? 0}%` },
    ];
    return (
        <div className="flex-1 flex flex-col" style={{ background: "radial-gradient(1100px 520px at 50% -10%, #0A3FA0 0%, #0D1B3E 55%, #081230 100%)" }}>
            <header className="flex items-center justify-between px-5 sm:px-8 py-5">
                <div className="flex items-center gap-2.5"><Logo size={34} /><div className="leading-tight"><p className="text-white font-extrabold text-[14px]">Akshaya Patra</p><p className="text-white/45 text-[10px] font-bold uppercase tracking-[0.14em]">Online Exam</p></div></div>
                <button onClick={onExit} className="text-white/70 hover:text-white text-[13px] font-bold border border-white/15 hover:border-white/30 rounded-lg px-3.5 py-1.5 cursor-pointer transition-colors">Exit</button>
            </header>

            <div className="flex-1 flex items-center justify-center px-5 py-8">
                <div className="w-full max-w-[600px]" style={{ animation: "apFadeUp .5s ease" }}>
                    <div className="bg-white rounded-[24px] p-8 sm:p-10 shadow-2xl">
                        <div className="flex items-center gap-2 mb-5">
                            <span style={{ background: "#FEF4E8", color: "#C2410C" }} className="text-[11px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wide">Assessment</span>
                            {hasProgress && <span style={{ background: "#EBF7F1", color: GREEN }} className="text-[11px] font-bold px-2.5 py-1 rounded-full">In progress</span>}
                        </div>
                        <h1 className="text-[26px] sm:text-[30px] font-extrabold text-ap-text leading-tight tracking-tight">{exam?.title}</h1>
                        {exam?.description && <p className="text-[14.5px] text-ap-text-muted mt-3 leading-relaxed">{exam.description}</p>}

                        <div className="grid grid-cols-3 gap-3 mt-7">
                            {metas.map((m) => (
                                <div key={m.label} className="rounded-2xl border border-ap-border p-4 text-center" style={{ background: "#F8FAFC" }}>
                                    <p className="text-[22px] font-extrabold text-ap-text leading-none">{m.value}</p>
                                    <p className="text-[11.5px] text-ap-text-muted mt-1.5">{m.label}</p>
                                </div>
                            ))}
                        </div>

                        <div className="mt-7 rounded-2xl border border-ap-border p-5" style={{ background: "#FFFDF8" }}>
                            <p className="text-[12px] font-bold uppercase tracking-wider text-ap-text-faint mb-3">Before you begin</p>
                            <ul className="space-y-2.5">
                                {[
                                    exam?.timeLimitMin ? `You have ${exam.timeLimitMin} minutes once you start — the timer keeps running.` : "This exam is untimed — take your time.",
                                    "Your answers save automatically; you can leave and resume.",
                                    "Bookmark tricky questions and review everything before submitting.",
                                    "Once submitted, your responses are final.",
                                ].map((t, i) => (
                                    <li key={i} className="flex items-start gap-2.5 text-[13.5px] text-ap-text">
                                        <span style={{ background: "#EBF7F1" }} className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-px"><svg width="12" height="12" fill="none" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5" stroke={GREEN} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
                                        {t}
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <button onClick={onStart} disabled={total === 0} style={{ background: ACCENT, boxShadow: "0 8px 22px rgba(247,148,29,.32)" }} className="w-full mt-7 text-white font-extrabold text-[16px] rounded-[14px] py-4 cursor-pointer transition-transform hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed">
                            {hasProgress ? "Resume exam →" : "Start exam →"}
                        </button>
                        {total === 0 && <p className="text-center text-[13px] text-ap-text-muted mt-3">This exam has no questions yet.</p>}
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─────────────────────────── Runner ───────────────────────────
function ExamRunner({ exam, questions, index, total, answers, bookmarks, answeredCount, remaining, saveState, anim, navOpen, setChoice, setText, setRating, setRanking, toggleBookmark, goTo, onPrev, onNext, setNavOpen, onExit, onReview }) {
    const cur = questions[index];
    const isLast = index === total - 1;
    const progress = total ? Math.round(((index + 1) / total) * 100) : 0;
    const low = remaining != null && remaining <= 60;
    const bookmarked = bookmarks.has(cur.id);
    const animName = anim === "next" ? "apSlideNext" : anim === "prev" ? "apSlidePrev" : "apFadeUp";

    return (
        <>
            <header className="h-[60px] bg-white border-b border-ap-border flex items-center gap-3 px-4 sm:px-5 shrink-0 sticky top-0 z-20">
                <Logo size={32} />
                <div className="min-w-0 hidden sm:block">
                    <p className="text-[13.5px] font-extrabold text-ap-text truncate leading-tight">{exam?.title}</p>
                    <p className="text-[10.5px] text-ap-text-faint">Akshaya Patra · Online Exam</p>
                </div>
                <div className="flex-1" />
                <SaveBadge state={saveState} />
                {remaining != null && (
                    <div style={{ background: low ? "#FEF2F2" : "#EEF3FB", borderColor: low ? "#FCA5A5" : "#C7D9F5", color: low ? "#DC2626" : "#003087" }} className="flex items-center gap-1.5 border rounded-lg px-2.5 py-1.5 shrink-0">
                        <svg width="14" height="14" fill="none" viewBox="0 0 24 24"><path d="M12 22a10 10 0 100-20 10 10 0 000 20zM12 6v6l4 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        <span className="text-[13px] font-extrabold tabular-nums">{fmtTime(remaining)}</span>
                    </div>
                )}
                <button onClick={() => setNavOpen(true)} className="lg:hidden text-ap-text-muted border border-ap-border rounded-lg px-2.5 py-1.5 text-[12px] font-bold cursor-pointer">{index + 1}/{total}</button>
                <button onClick={onExit} className="hidden sm:inline text-[13px] font-bold text-ap-text-muted border border-ap-border rounded-lg px-3 py-1.5 hover:bg-ap-bg cursor-pointer">Exit</button>
            </header>

            <div className="h-[6px] bg-gray-200 shrink-0"><div style={{ width: `${progress}%`, background: ACCENT }} className="h-full transition-all duration-300" /></div>

            <div className="flex-1 flex overflow-hidden">
                <main className="flex-1 overflow-y-auto px-4 py-8">
                    <div className="max-w-[720px] mx-auto">
                        <div className="flex items-center justify-between mb-3 text-[13px]">
                            <span className="font-bold text-ap-text">Question {index + 1} <span className="text-ap-text-faint font-semibold">/ {total}</span></span>
                            <span className="text-ap-text-muted">{answeredCount} answered</span>
                        </div>

                        <div key={cur.id} style={{ animation: `${animName} .26s ease`, borderTop: `4px solid ${ACCENT}` }} className="bg-white rounded-[18px] p-6 sm:p-8 shadow-sm">
                            <div className="flex items-start justify-between gap-3 mb-4">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span style={{ background: "#FEF4E8", color: "#C2410C" }} className="text-[11px] font-bold px-2.5 py-0.5 rounded-full">{TYPE_LABEL[cur.type]}</span>
                                    {cur.required && <span className="text-[11px] font-bold text-red-500">* Required</span>}
                                </div>
                                <button onClick={() => toggleBookmark(cur.id)} title={bookmarked ? "Remove bookmark" : "Bookmark this question"} style={{ background: bookmarked ? "#FEF4E8" : "transparent", color: bookmarked ? "#C2410C" : "#94A3B8", borderColor: bookmarked ? "#FAD4A0" : "#E4E7ED" }} className="flex items-center gap-1.5 border rounded-lg px-2.5 py-1.5 text-[12px] font-bold cursor-pointer transition-colors shrink-0">
                                    <svg width="14" height="14" fill={bookmarked ? "currentColor" : "none"} viewBox="0 0 24 24"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                    <span className="hidden sm:inline">{bookmarked ? "Bookmarked" : "Bookmark"}</span>
                                </button>
                            </div>
                            <h2 className="text-[19px] sm:text-[21px] font-bold text-ap-text leading-snug">{cur.text}</h2>
                            {cur.hint && <p className="text-[13.5px] text-ap-text-muted mt-1.5">{cur.hint}</p>}
                            {cur.imageUrl && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={cur.imageUrl} alt="" className="mt-4 max-h-64 w-auto rounded-xl border border-ap-border" />
                            )}
                            <div className="mt-6"><QuestionInput cur={cur} answer={answers[cur.id]} setChoice={setChoice} setText={setText} setRating={setRating} setRanking={setRanking} /></div>
                        </div>

                        <div className="flex items-center justify-between mt-7 gap-3">
                            <button onClick={onPrev} disabled={index === 0} style={{ color: index === 0 ? "#CBD5E1" : "#475569" }} className="text-[14px] font-bold disabled:cursor-not-allowed cursor-pointer px-3 py-2">← Previous</button>
                            <button onClick={onNext} disabled={false} style={{ background: isLast ? GREEN : ACCENT }} className="text-white text-[14px] font-bold rounded-[11px] px-7 py-3 cursor-pointer transition hover:-translate-y-0.5">{isLast ? "Review →" : "Next →"}</button>
                        </div>
                    </div>
                </main>

                {/* Desktop navigator */}
                <aside className="hidden lg:block w-[260px] border-l border-ap-border bg-white overflow-y-auto shrink-0">
                    <Navigator questions={questions} answers={answers} bookmarks={bookmarks} index={index} goTo={goTo} onReview={onReview} answeredCount={answeredCount} total={total} />
                </aside>
            </div>

            {/* Mobile navigator sheet */}
            {navOpen && (
                <div className="lg:hidden fixed inset-0 z-40 flex">
                    <div className="flex-1 bg-black/40" onClick={() => setNavOpen(false)} />
                    <div className="w-[280px] max-w-[82%] bg-white overflow-y-auto" style={{ animation: "apSlideNext .2s ease" }}>
                        <div className="flex items-center justify-between px-4 py-3 border-b border-ap-border"><span className="font-extrabold text-ap-text text-[14px]">Questions</span><button onClick={() => setNavOpen(false)} className="text-ap-text-muted text-[20px] leading-none px-2 cursor-pointer">×</button></div>
                        <Navigator questions={questions} answers={answers} bookmarks={bookmarks} index={index} goTo={goTo} onReview={onReview} answeredCount={answeredCount} total={total} />
                    </div>
                </div>
            )}
        </>
    );
}

function SaveBadge({ state }) {
    if (state === "idle") return null;
    const map = {
        saving: { tx: "#94A3B8", label: "Saving…" },
        saved: { tx: GREEN, label: "Saved" },
        error: { tx: "#DC2626", label: "Save failed" },
    };
    const s = map[state];
    return (
        <span className="hidden sm:flex items-center gap-1.5 text-[12px] font-bold shrink-0" style={{ color: s.tx }}>
            {state === "saving" ? <span className="w-3 h-3 rounded-full border-2 border-gray-200 animate-spin" style={{ borderTopColor: "#94A3B8" }} />
                : state === "saved" ? <svg width="13" height="13" fill="none" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg> : null}
            {s.label}
        </span>
    );
}

function Navigator({ questions, answers, bookmarks, index, goTo, onReview, answeredCount, total }) {
    return (
        <div className="p-4">
            <div className="flex items-center justify-between mb-3">
                <p className="text-[12px] font-bold uppercase tracking-wider text-ap-text-faint">Navigator</p>
                <span className="text-[12px] font-bold text-ap-text">{answeredCount}/{total}</span>
            </div>
            <div className="grid grid-cols-5 gap-2">
                {questions.map((q, i) => {
                    const ans = isAnswered(q, answers[q.id]);
                    const bm = bookmarks.has(q.id);
                    const on = i === index;
                    const bg = on ? ACCENT : ans ? "#EBF7F1" : "#F1F5F9";
                    const tx = on ? "#fff" : ans ? "#006B32" : "#64748B";
                    return (
                        <button key={q.id} onClick={() => goTo(i)} title={`Question ${i + 1}`} style={{ background: bg, color: tx, borderColor: on ? ACCENT : "transparent" }} className="relative h-9 rounded-lg border-2 text-[12.5px] font-bold cursor-pointer transition">
                            {i + 1}
                            {bm && <span style={{ background: "#C2410C" }} className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border border-white" />}
                        </button>
                    );
                })}
            </div>
            <div className="flex items-center gap-3 mt-4 text-[11px] text-ap-text-muted flex-wrap">
                <span className="flex items-center gap-1"><span style={{ background: "#EBF7F1" }} className="w-3 h-3 rounded" /> Answered</span>
                <span className="flex items-center gap-1"><span style={{ background: "#F1F5F9" }} className="w-3 h-3 rounded" /> Empty</span>
                <span className="flex items-center gap-1"><span style={{ background: "#C2410C" }} className="w-2.5 h-2.5 rounded-full" /> Bookmark</span>
            </div>
            <button onClick={onReview} className="w-full mt-5 text-[13px] font-bold text-ap-text border border-ap-border rounded-[10px] py-2.5 hover:bg-ap-bg cursor-pointer">Review &amp; submit</button>
        </div>
    );
}

function QuestionInput({ cur, answer, setChoice, setText, setRating, setRanking }) {
    if (cur.type === "SINGLE" || cur.type === "MULTIPLE" || cur.type === "TRUE_FALSE" || cur.type === "POLL") {
        const multiple = cur.type === "MULTIPLE";
        const picked = answer?.choiceIds || [];
        return (
            <div className="space-y-2.5">
                {cur.choices.map((c) => {
                    const sel = picked.includes(c.id);
                    return (
                        <button key={c.id} onClick={() => setChoice(cur.id, c.id, multiple)} style={{ background: sel ? "#FEF7EE" : "#fff", borderColor: sel ? ACCENT : "#E4E7ED" }} className="w-full flex items-center gap-3 border-[1.5px] rounded-xl px-4 py-3.5 text-left cursor-pointer transition hover:border-ap-orange/60">
                            <span style={{ borderColor: sel ? ACCENT : "#CBD5E1", background: sel ? ACCENT : "#fff", borderRadius: multiple ? 6 : "50%" }} className="w-[22px] h-[22px] border-2 flex items-center justify-center shrink-0">
                                {sel && <svg width="13" height="13" fill="none" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                            </span>
                            <span className="text-[14.5px] text-ap-text">{c.label}</span>
                        </button>
                    );
                })}
            </div>
        );
    }
    if (cur.type === "PICTURE") {
        const picked = answer?.choiceIds || [];
        return (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {cur.choices.map((c) => {
                    const sel = picked.includes(c.id);
                    return (
                        <button key={c.id} onClick={() => setChoice(cur.id, c.id, false)} style={{ borderColor: sel ? ACCENT : "#E4E7ED", background: sel ? "#FEF7EE" : "#fff" }} className="border-2 rounded-xl overflow-hidden text-left cursor-pointer transition hover:-translate-y-0.5">
                            {c.imageUrl
                                // eslint-disable-next-line @next/next/no-img-element
                                ? <img src={c.imageUrl} alt={c.label} className="w-full h-28 object-cover" />
                                : <div className="w-full h-28 bg-gray-100 flex items-center justify-center text-ap-text-faint text-[12px]">No image</div>}
                            <div className="flex items-center gap-2 px-3 py-2.5">
                                <span style={{ borderColor: sel ? ACCENT : "#CBD5E1", background: sel ? ACCENT : "#fff" }} className="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0">
                                    {sel && <svg width="10" height="10" fill="none" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5" stroke="#fff" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                                </span>
                                <span className="text-[13px] text-ap-text truncate">{c.label}</span>
                            </div>
                        </button>
                    );
                })}
            </div>
        );
    }
    if (cur.type === "RANKING") {
        const byId = Object.fromEntries(cur.choices.map((c) => [c.id, c]));
        const order = (answer?.choiceIds || []).filter((id) => byId[id]);
        cur.choices.forEach((c) => { if (!order.includes(c.id)) order.push(c.id); });
        const move = (idx, dir) => {
            const ni = idx + dir; if (ni < 0 || ni >= order.length) return;
            const next = [...order]; [next[idx], next[ni]] = [next[ni], next[idx]]; setRanking(cur.id, next);
        };
        return (
            <div className="space-y-2">
                {order.map((id, idx) => (
                    <div key={id} className="flex items-center gap-3 border-[1.5px] border-ap-border rounded-xl px-4 py-3 bg-white">
                        <span style={{ background: ACCENT }} className="w-7 h-7 rounded-lg text-white text-[13px] font-extrabold flex items-center justify-center shrink-0">{idx + 1}</span>
                        <span className="flex-1 text-[14.5px] text-ap-text">{byId[id].label}</span>
                        <div className="flex flex-col gap-1 shrink-0">
                            <button onClick={() => move(idx, -1)} disabled={idx === 0} className="w-7 h-6 rounded border border-ap-border text-ap-text-muted disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed flex items-center justify-center" aria-label="Move up"><svg width="13" height="13" fill="none" viewBox="0 0 24 24"><path d="M6 15l6-6 6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
                            <button onClick={() => move(idx, 1)} disabled={idx === order.length - 1} className="w-7 h-6 rounded border border-ap-border text-ap-text-muted disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed flex items-center justify-center" aria-label="Move down"><svg width="13" height="13" fill="none" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
                        </div>
                    </div>
                ))}
            </div>
        );
    }
    if (cur.type === "LIKERT") {
        return (
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                {LIKERT_LABELS.map((l, i) => {
                    const n = i + 1; const sel = answer?.ratingValue === n;
                    return <button key={n} onClick={() => setRating(cur.id, n)} style={{ background: sel ? ACCENT : "#fff", borderColor: sel ? ACCENT : "#E4E7ED", color: sel ? "#fff" : "#64748B" }} className="border-[1.5px] rounded-xl px-2 py-3 text-[12.5px] font-bold cursor-pointer transition text-center">{l}</button>;
                })}
            </div>
        );
    }
    if (cur.type === "SHORT" || cur.type === "WORD_CLOUD") return <input value={answer?.textValue || ""} onChange={(e) => setText(cur.id, e.target.value)} placeholder={cur.type === "WORD_CLOUD" ? "Type a word or short phrase…" : "Type your answer…"} className="w-full border-[1.5px] border-gray-300 focus:border-ap-orange rounded-xl px-4 py-3 text-[14.5px] outline-none transition" />;
    if (cur.type === "LONG") return <textarea value={answer?.textValue || ""} onChange={(e) => setText(cur.id, e.target.value)} rows={5} placeholder="Write a few sentences…" className="w-full border-[1.5px] border-gray-300 focus:border-ap-orange rounded-xl px-4 py-3 text-[14.5px] outline-none transition resize-y" />;
    if (cur.type === "RATING") {
        return (
            <div className="flex items-center gap-2.5 flex-wrap">
                {[1, 2, 3, 4, 5].map((n) => {
                    const sel = answer?.ratingValue === n;
                    return <button key={n} onClick={() => setRating(cur.id, n)} style={{ background: sel ? ACCENT : "#fff", borderColor: sel ? ACCENT : "#E4E7ED", color: sel ? "#fff" : "#64748B" }} className="w-14 h-14 border-[1.5px] rounded-2xl text-[18px] font-extrabold cursor-pointer transition hover:-translate-y-0.5">{n}</button>;
                })}
            </div>
        );
    }
    return null;
}

// ─────────────────────────── Review ───────────────────────────
function ReviewScreen({ questions, answers, bookmarks, answeredCount, total, submitting, onJump, onBack, onSubmit }) {
    const unanswered = questions.filter((q) => !isAnswered(q, answers[q.id]));
    const requiredLeft = unanswered.filter((q) => q.required).length;
    const pct = total ? Math.round((answeredCount / total) * 100) : 0;
    return (
        <div className="flex-1 overflow-y-auto px-4 py-8" style={{ animation: "apFadeUp .4s ease" }}>
            <div className="max-w-[720px] mx-auto">
                <h1 className="text-[26px] font-extrabold text-ap-text tracking-tight">Review your answers</h1>
                <p className="text-[14px] text-ap-text-muted mt-1">Check everything before you submit. You can jump back to any question.</p>

                <div className="grid grid-cols-3 gap-3 mt-6">
                    <Stat value={`${answeredCount}/${total}`} label="Answered" />
                    <Stat value={`${pct}%`} label="Complete" color={ACCENT} />
                    <Stat value={bookmarks.size} label="Bookmarked" color="#C2410C" />
                </div>

                {requiredLeft > 0 && (
                    <div style={{ background: "#FEF2F2", borderColor: "#FCA5A5" }} className="border rounded-xl px-4 py-3 mt-5 text-[13.5px] font-semibold text-red-600">
                        {requiredLeft} required question{requiredLeft > 1 ? "s" : ""} still unanswered. You can still submit, but consider completing {requiredLeft > 1 ? "them" : "it"}.
                    </div>
                )}

                <div className="bg-white border border-ap-border rounded-[16px] mt-6 divide-y divide-gray-100">
                    {questions.map((q, i) => {
                        const ans = isAnswered(q, answers[q.id]);
                        const bm = bookmarks.has(q.id);
                        return (
                            <button key={q.id} onClick={() => onJump(i)} className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-ap-bg cursor-pointer transition">
                                <span style={{ background: ans ? "#EBF7F1" : "#F1F5F9", color: ans ? "#006B32" : "#64748B" }} className="w-8 h-8 rounded-lg flex items-center justify-center text-[12.5px] font-bold shrink-0">{i + 1}</span>
                                <span className="flex-1 min-w-0">
                                    <span className="text-[14px] font-semibold text-ap-text line-clamp-1">{q.text}</span>
                                    <span className="text-[12px] mt-0.5 block" style={{ color: ans ? GREEN : "#94A3B8" }}>{ans ? "Answered" : "Not answered"}{q.required && !ans ? " · required" : ""}</span>
                                </span>
                                {bm && <svg width="15" height="15" fill="#C2410C" viewBox="0 0 24 24" className="shrink-0"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" /></svg>}
                                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" className="text-ap-text-faint shrink-0"><path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                            </button>
                        );
                    })}
                </div>

                <div className="flex items-center justify-between gap-3 mt-7 flex-wrap">
                    <button onClick={onBack} className="text-[14px] font-bold text-ap-text-muted border border-ap-border rounded-[11px] px-5 py-3 hover:bg-ap-bg cursor-pointer">← Back to questions</button>
                    <button onClick={onSubmit} disabled={submitting} style={{ background: GREEN, boxShadow: "0 8px 22px rgba(0,132,61,.28)" }} className="text-white text-[15px] font-extrabold rounded-[12px] px-8 py-3.5 cursor-pointer disabled:opacity-60 transition hover:-translate-y-0.5">{submitting ? "Submitting…" : "Submit exam"}</button>
                </div>
            </div>
        </div>
    );
}
function Stat({ value, label, color = "#1E293B" }) {
    return <div className="rounded-2xl border border-ap-border p-4 text-center bg-white"><p className="text-[22px] font-extrabold leading-none" style={{ color }}>{value}</p><p className="text-[11.5px] text-ap-text-muted mt-1.5">{label}</p></div>;
}

// ─────────────────────────── Result ───────────────────────────
function ResultScreen({ exam, result, answeredCount, total, external, onExit }) {
    const showScore = !!result && result.marks != null;
    const passed = result?.passed;
    return (
        <div className="flex-1 flex items-center justify-center px-4 py-10" style={{ background: "radial-gradient(1000px 500px at 50% -10%, #0A3FA0 0%, #0D1B3E 60%, #081230 100%)" }}>
            <div className="w-full max-w-[520px] bg-white rounded-[24px] p-8 sm:p-10 text-center shadow-2xl" style={{ animation: "apFadeUp .5s ease" }}>
                <div style={{ background: "#EBF7F1", animation: "apPop .5s ease" }} className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
                    <svg width="38" height="38" fill="none" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5" stroke={GREEN} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </div>
                <h1 className="text-[26px] font-extrabold text-ap-text tracking-tight">Submitted — thank you!</h1>
                <p className="text-[14.5px] text-ap-text-muted mt-2">Your responses for <span className="font-bold text-ap-text">{exam?.title}</span> have been recorded.</p>

                {showScore ? (
                    <>
                        <div className="mt-7 flex items-center justify-center">
                            <ScoreRing value={Math.round(result.marks)} passed={passed} />
                        </div>
                        <div className="flex items-center justify-center gap-3 mt-6 flex-wrap">
                            <span style={{ background: passed ? "#EBF7F1" : "#FEF4E8", color: passed ? "#006B32" : "#C2410C" }} className="text-[13px] font-extrabold px-4 py-1.5 rounded-full">{passed ? "Passed" : "Below pass mark"}</span>
                            <span className="text-[13px] text-ap-text-muted font-semibold">Pass mark {result.passMark ?? exam?.passMark}%</span>
                            {result.rank != null && <span style={{ background: "#EEF3FB", color: "#003087" }} className="text-[13px] font-extrabold px-4 py-1.5 rounded-full">Rank #{result.rank}</span>}
                        </div>
                        {passed && (
                            <div style={{ background: "#FFFBEB", borderColor: "#FDE68A" }} className="border rounded-xl px-4 py-3 mt-5 flex items-center justify-center gap-2 text-[13.5px] font-bold text-[#B45309]">
                                <svg width="16" height="16" fill="none" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>
                                Eligible for certificate
                            </div>
                        )}
                    </>
                ) : (
                    <div className="mt-7 flex items-center justify-center gap-8 py-5 border-y border-ap-border">
                        <div><p className="text-[26px] font-extrabold text-ap-text">{answeredCount}/{total}</p><p className="text-[12px] text-ap-text-muted">Answered</p></div>
                        <div><p className="text-[26px] font-extrabold" style={{ color: GREEN }}>Done</p><p className="text-[12px] text-ap-text-muted">Status</p></div>
                    </div>
                )}

                {external ? (
                    <p className="mt-8 text-[13.5px] text-ap-text-muted">You may now close this window.</p>
                ) : (
                    <button onClick={onExit} style={{ background: ACCENT }} className="w-full mt-8 text-white font-extrabold text-[15px] rounded-[12px] py-3.5 cursor-pointer transition hover:-translate-y-0.5">Done</button>
                )}
            </div>
        </div>
    );
}
function ScoreRing({ value, passed }) {
    const r = 52, c = 2 * Math.PI * r;
    const off = c - (Math.min(100, Math.max(0, value)) / 100) * c;
    const color = passed ? GREEN : "#F7941D";
    return (
        <div className="relative" style={{ width: 132, height: 132 }}>
            <svg width="132" height="132" viewBox="0 0 132 132">
                <circle cx="66" cy="66" r={r} fill="none" stroke="#EEF2F7" strokeWidth="12" />
                <circle cx="66" cy="66" r={r} fill="none" stroke={color} strokeWidth="12" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} transform="rotate(-90 66 66)" style={{ transition: "stroke-dashoffset 1s ease" }} />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[30px] font-extrabold leading-none" style={{ color }}>{value}%</span>
                <span className="text-[11px] text-ap-text-muted font-semibold mt-1">Score</span>
            </div>
        </div>
    );
}
