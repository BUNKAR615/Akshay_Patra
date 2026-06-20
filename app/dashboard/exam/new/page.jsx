"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ModuleShell from "../../../../components/shell/ModuleShell";
import { Icon } from "../../../../components/ui/Icons";
import { Toggle } from "../../../../components/ui";
import { api } from "../../../../lib/clientApi";

const ACCENT = "#F7941D";

const STEPS = [
    { num: 1, title: "Details", sub: "Title, timing, rules" },
    { num: 2, title: "Questions", sub: "Add & edit" },
    { num: 3, title: "Audience", sub: "Who takes it" },
    { num: 4, title: "Review", sub: "Publish" },
];

const Q_TYPES = [
    { type: "SINGLE", label: "Single choice", icon: "check", tint: "#EEF3FB", accent: "#003087" },
    { type: "MULTIPLE", label: "Multiple choice", icon: "grid", tint: "#EBF7F1", accent: "#00843D" },
    { type: "SHORT", label: "Short answer", icon: "type", tint: "#FEF4E8", accent: "#C2410C" },
    { type: "LONG", label: "Long answer", icon: "doc", tint: "#F3EFFE", accent: "#7C3AED" },
    { type: "RATING", label: "Rating / scale", icon: "slider", tint: "#FFFBEB", accent: "#B45309" },
];
const Q_META = Object.fromEntries(Q_TYPES.map((t) => [t.type, t]));

const SEG_COLORS = ["#F7B968", "#7DD3A8", "#7FA8E8", "#C4B5FD", "#93C5FD"];
const ALL_BRANCHES = "All branches";
const ALL_DEPTS = "All departments";
const ALL_ROLES = "All roles";
const DEPT_TAG = { "Human Resources": "HR", "Information Technology": "IT" };

let tmpId = 0;
const newId = () => `tmp-${++tmpId}`;

export default function ExamBuilderPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const editId = searchParams.get("id");

    const [step, setStep] = useState(0);
    const [examId, setExamId] = useState(editId || null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    // Details
    const [details, setDetails] = useState({
        title: "", description: "", timeLimitMin: 45, passMark: 70, dueDate: "",
        shuffle: true, showResults: false, requireCompletion: true,
    });
    // Questions
    const [questions, setQuestions] = useState([]);
    // Audience — live employee picker. The audience is an explicit set of
    // selected employee ids, persisted as a CUSTOM audience.
    const [employees, setEmployees] = useState([]);
    const [empLoading, setEmpLoading] = useState(true);
    const [audSel, setAudSel] = useState({}); // { [employeeId]: true }
    const [audSearch, setAudSearch] = useState("");
    const [audBranch, setAudBranch] = useState(ALL_BRANCHES);
    const [audDept, setAudDept] = useState(ALL_DEPTS);
    const [audRole, setAudRole] = useState(ALL_ROLES);
    const [audOpen, setAudOpen] = useState(null); // "branch" | "dept" | "role" | null
    const [audSaved, setAudSaved] = useState([]);

    // Load the live employee directory once for the picker.
    useEffect(() => {
        (async () => {
            try { const d = await api("/api/exam/employees"); setEmployees(d.employees || []); }
            catch (e) { console.error("[Builder] employees load failed:", e); }
            finally { setEmpLoading(false); }
        })();
    }, []);

    // Load existing exam when editing.
    useEffect(() => {
        if (!editId) return;
        (async () => {
            try {
                const d = await api(`/api/exam/${editId}`);
                const e = d.exam;
                setDetails({
                    title: e.title || "", description: e.description || "",
                    timeLimitMin: e.timeLimitMin ?? 45, passMark: e.passMark ?? 70,
                    dueDate: e.dueDate ? e.dueDate.slice(0, 10) : "",
                    shuffle: e.shuffle, showResults: e.showResults, requireCompletion: e.requireCompletion,
                });
                setQuestions((e.questions || []).map((q) => ({
                    _id: q.id, type: q.type, text: q.text, hint: q.hint || "", required: q.required, points: q.points,
                    choices: (q.choices || []).map((c) => ({ _id: c.id, label: c.label, isCorrect: c.isCorrect })),
                })));
                const ids = e.audience?.customRules?.employeeIds;
                if (Array.isArray(ids)) setAudSel(Object.fromEntries(ids.map((id) => [id, true])));
            } catch (err) { console.error("[Builder] load failed:", err); }
        })();
    }, [editId]);

    // ── Audience derivations (all client-side, like the prototype) ──
    const empById = useMemo(() => Object.fromEntries(employees.map((e) => [e.id, e])), [employees]);
    const selectedIds = useMemo(() => Object.keys(audSel).filter((id) => audSel[id]), [audSel]);

    // Label built from whichever filters are active when the audience is saved.
    const labelBase = useMemo(() => {
        const p = [];
        if (audBranch !== ALL_BRANCHES) p.push(audBranch.split(" — ")[0]);
        if (audDept !== ALL_DEPTS) p.push(audDept);
        if (audRole !== ALL_ROLES) p.push(audRole + "s");
        return p.length ? p.join(" · ") : "Custom selection";
    }, [audBranch, audDept, audRole]);

    const audienceSummary = useMemo(() => {
        const sel = selectedIds.map((id) => empById[id]).filter(Boolean);
        const count = sel.length;
        const byBranch = {};
        sel.forEach((e) => { byBranch[e.branch] = (byBranch[e.branch] || 0) + 1; });
        const branchesInSel = Object.keys(byBranch).length;
        const deptsInSel = new Set(sel.map((e) => e.dept)).size;
        const branchRows = Object.entries(byBranch)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([label, value], i) => ({ label, value, pct: Math.round((value / Math.max(count, 1)) * 100), color: SEG_COLORS[i % SEG_COLORS.length] }));
        const previewRows = sel.slice(0, 6).map((e) => ({ name: e.name, initials: e.initials, tag: e.role }));
        return {
            count, branchesInSel, deptsInSel, branchRows, previewRows,
            more: Math.max(0, count - 6),
            label: count === 0 ? "Not set" : labelBase,
        };
    }, [selectedIds, empById, labelBase]);

    const totalPoints = useMemo(
        () => questions.filter((q) => q.type === "SINGLE" || q.type === "MULTIPLE").reduce((s, q) => s + (q.points || 0), 0),
        [questions]
    );

    // ── Question helpers ──
    const addQuestion = (type) => {
        const base = { _id: newId(), type, text: "", hint: "", required: true, points: 0, choices: [] };
        if (type === "SINGLE" || type === "MULTIPLE") base.choices = [{ _id: newId(), label: "", isCorrect: false }, { _id: newId(), label: "", isCorrect: false }];
        setQuestions((qs) => [...qs, base]);
    };
    const updateQ = (id, patch) => setQuestions((qs) => qs.map((q) => (q._id === id ? { ...q, ...patch } : q)));
    const removeQ = (id) => setQuestions((qs) => qs.filter((q) => q._id !== id));
    const addChoice = (qid) => setQuestions((qs) => qs.map((q) => (q._id === qid ? { ...q, choices: [...q.choices, { _id: newId(), label: "", isCorrect: false }] } : q)));
    const updateChoice = (qid, cid, patch) => setQuestions((qs) => qs.map((q) => q._id !== qid ? q : { ...q, choices: q.choices.map((c) => (c._id === cid ? { ...c, ...patch } : c)) }));
    const removeChoice = (qid, cid) => setQuestions((qs) => qs.map((q) => q._id !== qid ? q : { ...q, choices: q.choices.filter((c) => c._id !== cid) }));
    const toggleCorrect = (qid, cid, single) => setQuestions((qs) => qs.map((q) => {
        if (q._id !== qid) return q;
        return { ...q, choices: q.choices.map((c) => ({ ...c, isCorrect: c._id === cid ? !c.isCorrect : single ? false : c.isCorrect })) };
    }));

    // ── Persistence ──
    const ensureExam = async () => {
        if (examId) {
            await api(`/api/exam/${examId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(detailPayload()) });
            return examId;
        }
        const d = await api("/api/exam", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: details.title || "Untitled exam", description: details.description }) });
        const id = d.exam.id;
        setExamId(id);
        await api(`/api/exam/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(detailPayload()) });
        return id;
    };
    const detailPayload = () => ({
        title: details.title || "Untitled exam",
        description: details.description || null,
        timeLimitMin: details.timeLimitMin ? Number(details.timeLimitMin) : null,
        passMark: Number(details.passMark) || 0,
        dueDate: details.dueDate ? new Date(details.dueDate).toISOString() : null,
        shuffle: details.shuffle, showResults: details.showResults, requireCompletion: details.requireCompletion,
    });
    const questionsPayload = () => ({
        questions: questions.map((q) => ({
            type: q.type, text: q.text || "Untitled question", hint: q.hint || null, required: q.required, points: q.points || 0,
            choices: (q.type === "SINGLE" || q.type === "MULTIPLE") ? q.choices.filter((c) => c.label.trim()).map((c) => ({ label: c.label, isCorrect: c.isCorrect })) : [],
        })),
    });
    const audiencePayload = () => ({
        mode: "CUSTOM",
        branchId: null,
        departmentId: null,
        randomCount: null,
        customRules: { employeeIds: selectedIds },
    });

    const persist = async ({ publish }) => {
        setError("");
        if (!details.title.trim()) { setStep(0); setError("Please give the exam a title."); return; }
        if (publish && selectedIds.length === 0) { setStep(2); setError("Select at least one employee before publishing."); return; }
        setSaving(true);
        try {
            const id = await ensureExam();
            await api(`/api/exam/${id}/questions`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(questionsPayload()) });
            await api(`/api/exam/${id}/audience${publish ? "?materialize=1" : ""}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(audiencePayload()) });
            await api(`/api/exam/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: publish ? "ACTIVE" : "DRAFT" }) });
            router.push(publish ? `/dashboard/exam/${id}/results` : "/dashboard/exam");
        } catch (err) {
            console.error("[Builder] save failed:", err);
            setError(err.message || "Could not save the exam.");
        } finally { setSaving(false); }
    };

    return (
        <ModuleShell moduleId="exam" crumb={editId ? "Edit Exam" : "Create Exam"} activeNavId="builder">
            <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
                <div>
                    <h1 className="text-[27px] font-extrabold text-ap-text tracking-tight">{editId ? "Edit Exam" : "Create Exam"}</h1>
                    <p className="text-[13.5px] text-ap-text-muted mt-1">Build an assessment, target an audience, and publish.</p>
                </div>
                <div className="flex items-center gap-2.5">
                    <button onClick={() => router.push("/dashboard/exam")} className="text-[13px] font-bold text-ap-text-muted border border-ap-border rounded-[10px] px-3.5 py-2 hover:bg-ap-bg cursor-pointer">Cancel</button>
                    <button onClick={() => persist({ publish: false })} disabled={saving} className="text-[13px] font-bold text-ap-text border border-ap-border rounded-[10px] px-3.5 py-2 hover:bg-ap-bg cursor-pointer disabled:opacity-60">Save draft</button>
                    <button onClick={() => persist({ publish: true })} disabled={saving} style={{ background: ACCENT }} className="text-[13px] font-bold text-white rounded-[10px] px-4 py-2 cursor-pointer disabled:opacity-60">{saving ? "Saving…" : "Publish"}</button>
                </div>
            </div>

            {error && <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-[13px] font-semibold rounded-lg px-4 py-2.5">{error}</div>}

            {/* Stepper */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-6">
                {STEPS.map((st, i) => {
                    const active = step === i, done = step > i;
                    return (
                        <button key={st.num} onClick={() => setStep(i)} style={{ background: active ? "#FEF4E8" : "#fff", borderColor: active ? "#FAD4A0" : "#E4E7ED" }} className="flex items-center gap-2.5 border rounded-[12px] p-3 text-left cursor-pointer transition">
                            <span style={{ background: active ? ACCENT : done ? "#EBF7F1" : "#F1F5F9", color: active ? "#fff" : done ? "#006B32" : "#94A3B8" }} className="w-[30px] h-[30px] rounded-full flex items-center justify-center text-[13px] font-extrabold shrink-0">{done ? "✓" : st.num}</span>
                            <div className="min-w-0">
                                <p style={{ color: active ? "#1E293B" : "#64748B" }} className="text-[13.5px] font-extrabold leading-tight">{st.title}</p>
                                <p className="text-[11px] text-ap-text-faint truncate">{st.sub}</p>
                            </div>
                        </button>
                    );
                })}
            </div>

            {/* Step bodies */}
            {step === 0 && <DetailsStep details={details} setDetails={setDetails} onNext={() => setStep(1)} />}
            {step === 1 && (
                <QuestionsStep
                    questions={questions} totalPoints={totalPoints} onAdd={addQuestion}
                    updateQ={updateQ} removeQ={removeQ} addChoice={addChoice} updateChoice={updateChoice} removeChoice={removeChoice} toggleCorrect={toggleCorrect}
                    onNext={() => setStep(2)}
                />
            )}
            {step === 2 && (
                <EmployeePickerStep
                    employees={employees} empLoading={empLoading}
                    audSel={audSel} setAudSel={setAudSel}
                    audSearch={audSearch} setAudSearch={setAudSearch}
                    audBranch={audBranch} setAudBranch={setAudBranch}
                    audDept={audDept} setAudDept={setAudDept}
                    audRole={audRole} setAudRole={setAudRole}
                    audOpen={audOpen} setAudOpen={setAudOpen}
                    audSaved={audSaved} setAudSaved={setAudSaved}
                    summary={audienceSummary} labelBase={labelBase}
                    onNext={() => setStep(3)}
                />
            )}
            {step === 3 && (
                <ReviewStep details={details} questions={questions} totalPoints={totalPoints} summary={audienceSummary} onPublish={() => persist({ publish: true })} saving={saving} />
            )}
        </ModuleShell>
    );
}

// ── Step 1: Details ──
function DetailsStep({ details, setDetails, onNext }) {
    const set = (k, v) => setDetails((d) => ({ ...d, [k]: v }));
    const inputCls = "w-full border-[1.5px] border-gray-300 focus:border-ap-orange rounded-lg px-3 py-2 text-[13.5px] outline-none transition";
    return (
        <div className="bg-white border border-ap-border rounded-[16px] p-6 max-w-[720px]">
            <div className="space-y-4">
                <Field label="Exam title" required>
                    <input value={details.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Food Safety & Hygiene Certification" className={inputCls} />
                </Field>
                <Field label="Description">
                    <textarea value={details.description} onChange={(e) => set("description", e.target.value)} rows={3} placeholder="What is this exam about?" className={`${inputCls} resize-y`} />
                </Field>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <Field label="Time limit (min)"><input type="number" min="0" value={details.timeLimitMin} onChange={(e) => set("timeLimitMin", e.target.value)} className={inputCls} /></Field>
                    <Field label="Pass mark (%)"><input type="number" min="0" max="100" value={details.passMark} onChange={(e) => set("passMark", e.target.value)} className={inputCls} /></Field>
                    <Field label="Due date"><input type="date" value={details.dueDate} onChange={(e) => set("dueDate", e.target.value)} className={inputCls} /></Field>
                </div>
                <div className="flex flex-wrap gap-2.5 pt-1">
                    {[["shuffle", "Shuffle questions"], ["showResults", "Show results on submit"], ["requireCompletion", "Require completion"]].map(([k, l]) => (
                        <div key={k} className="flex items-center gap-2.5 border border-ap-border rounded-[10px] px-3 py-2">
                            <Toggle on={details[k]} onChange={(v) => set(k, v)} label={l} />
                            <span className="text-[13px] font-semibold text-ap-text">{l}</span>
                        </div>
                    ))}
                </div>
            </div>
            <div className="flex justify-end mt-6">
                <button onClick={onNext} style={{ background: ACCENT }} className="text-white text-[13.5px] font-bold rounded-[10px] px-5 py-2.5 cursor-pointer">Next: Questions →</button>
            </div>
        </div>
    );
}

// ── Step 2: Questions ──
function QuestionsStep({ questions, totalPoints, onAdd, updateQ, removeQ, addChoice, updateChoice, removeChoice, toggleCorrect, onNext }) {
    return (
        <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-5">
            <div className="lg:sticky lg:top-2 self-start">
                <div className="bg-white border border-ap-border rounded-[14px] p-3.5">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-ap-text-faint mb-2.5 px-1">Add question</p>
                    <div className="space-y-1.5">
                        {Q_TYPES.map((t) => (
                            <button key={t.type} onClick={() => onAdd(t.type)} className="w-full flex items-center gap-2.5 rounded-[10px] px-2.5 py-2 hover:bg-[#FEF4E8] cursor-pointer transition text-left">
                                <span style={{ background: t.tint, color: t.accent }} className="w-[30px] h-[30px] rounded-lg flex items-center justify-center shrink-0"><Icon name={t.icon} size={17} /></span>
                                <span className="text-[13px] font-semibold text-ap-text">{t.label}</span>
                            </button>
                        ))}
                    </div>
                    <div className="border-t border-ap-border mt-3 pt-3 px-1 text-[12px] text-ap-text-muted">{questions.length} questions · {totalPoints} points</div>
                </div>
            </div>

            <div className="space-y-3.5">
                {questions.length === 0 && (
                    <div className="bg-white border border-dashed border-ap-border rounded-[14px] p-10 text-center text-ap-text-muted text-[13.5px]">Add your first question from the panel.</div>
                )}
                {questions.map((q, i) => {
                    const meta = Q_META[q.type];
                    const isChoice = q.type === "SINGLE" || q.type === "MULTIPLE";
                    return (
                        <div key={q._id} className="bg-white rounded-[14px] p-4" style={{ borderLeft: `4px solid ${meta.accent}` }}>
                            <div className="flex items-center justify-between mb-2.5">
                                <div className="flex items-center gap-2">
                                    <span className="text-[12px] font-extrabold text-ap-text">Q{i + 1}</span>
                                    <span style={{ background: meta.tint, color: meta.accent }} className="text-[10.5px] font-bold px-2 py-0.5 rounded-full">{meta.label}</span>
                                </div>
                                <button onClick={() => removeQ(q._id)} className="text-ap-text-faint hover:text-red-500 cursor-pointer text-[12px] font-bold">Remove</button>
                            </div>
                            <input value={q.text} onChange={(e) => updateQ(q._id, { text: e.target.value })} placeholder="Question text" className="w-full border-[1.5px] border-gray-200 focus:border-ap-orange rounded-lg px-3 py-2 text-[14px] font-semibold outline-none mb-2" />
                            <div className="flex flex-wrap items-center gap-3 mb-2.5">
                                <input value={q.hint} onChange={(e) => updateQ(q._id, { hint: e.target.value })} placeholder="Hint (optional)" className="flex-1 min-w-[160px] border-[1.5px] border-gray-200 focus:border-ap-orange rounded-lg px-3 py-1.5 text-[12.5px] outline-none" />
                                {isChoice && <label className="flex items-center gap-1.5 text-[12px] text-ap-text-muted">Points <input type="number" min="0" value={q.points} onChange={(e) => updateQ(q._id, { points: Number(e.target.value) })} className="w-16 border-[1.5px] border-gray-200 rounded-lg px-2 py-1 text-[12.5px]" /></label>}
                                <label className="flex items-center gap-1.5 text-[12px] text-ap-text-muted"><input type="checkbox" checked={q.required} onChange={(e) => updateQ(q._id, { required: e.target.checked })} /> Required</label>
                            </div>

                            {isChoice && (
                                <div className="space-y-1.5">
                                    {q.choices.map((c) => (
                                        <div key={c._id} className="flex items-center gap-2" style={{ background: c.isCorrect ? "#F4FBF7" : "transparent", borderRadius: 8, padding: c.isCorrect ? "2px 6px" : "0 6px" }}>
                                            <button onClick={() => toggleCorrect(q._id, c._id, q.type === "SINGLE")} title="Mark correct" style={{ borderColor: c.isCorrect ? "#00843D" : "#CBD5E1", background: c.isCorrect ? "#00843D" : "#fff", borderRadius: q.type === "MULTIPLE" ? 5 : "50%" }} className="w-[18px] h-[18px] border-2 flex items-center justify-center shrink-0 cursor-pointer">
                                                {c.isCorrect && <svg width="11" height="11" fill="none" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                                            </button>
                                            <input value={c.label} onChange={(e) => updateChoice(q._id, c._id, { label: e.target.value })} placeholder="Option" className="flex-1 border-[1.5px] border-gray-200 focus:border-ap-orange rounded-lg px-2.5 py-1.5 text-[13px] outline-none" />
                                            {c.isCorrect && <span className="text-[10.5px] font-bold text-ap-green">Correct</span>}
                                            {q.choices.length > 2 && <button onClick={() => removeChoice(q._id, c._id)} className="text-ap-text-faint hover:text-red-500 cursor-pointer text-[16px] leading-none px-1">×</button>}
                                        </div>
                                    ))}
                                    <button onClick={() => addChoice(q._id)} className="text-[12.5px] font-bold text-ap-orange-700 hover:underline cursor-pointer mt-1">+ Add option</button>
                                </div>
                            )}
                            {q.type === "SHORT" && <div className="border border-dashed border-ap-border rounded-lg px-3 py-2 text-[12.5px] text-ap-text-faint">Single line response</div>}
                            {q.type === "LONG" && <div className="border border-dashed border-ap-border rounded-lg px-3 py-5 text-[12.5px] text-ap-text-faint">Paragraph response</div>}
                            {q.type === "RATING" && <div className="flex gap-1.5">{[1, 2, 3, 4, 5].map((n) => <span key={n} className="w-10 h-10 border border-ap-border rounded-lg flex items-center justify-center text-[14px] font-bold text-ap-text-muted">{n}</span>)}</div>}
                        </div>
                    );
                })}
                <div className="flex justify-end">
                    <button onClick={onNext} style={{ background: ACCENT }} className="text-white text-[13.5px] font-bold rounded-[10px] px-5 py-2.5 cursor-pointer">Next: Audience →</button>
                </div>
            </div>
        </div>
    );
}

// ── Step 3: Audience — live employee picker ──
function FilterDropdown({ dim, label, value, options, open, onToggle }) {
    const active = value !== `All ${dim}s` && !value.startsWith("All ");
    const style = active
        ? { bg: "#FEF4E8", bd: ACCENT, tx: "#C2410C" }
        : { bg: "#F8FAFC", bd: "#E4E7ED", tx: "#1E293B" };
    return (
        <div className="relative flex-1 min-w-[150px]">
            <button onClick={onToggle} style={{ background: style.bg, borderColor: style.bd }} className="w-full flex items-center justify-between gap-2 border-[1.5px] rounded-[10px] px-3 py-2.5 cursor-pointer">
                <span className="flex flex-col items-start min-w-0">
                    <span className="text-[10px] font-bold text-ap-text-faint uppercase tracking-wide">{label}</span>
                    <span style={{ color: style.tx }} className="text-[13px] font-bold truncate max-w-[130px]">{value}</span>
                </span>
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            {open && (
                <div className="absolute left-0 right-0 z-30 bg-white border border-ap-border rounded-[12px] p-1.5 max-h-[248px] overflow-y-auto" style={{ top: "calc(100% + 6px)", boxShadow: "0 8px 30px rgba(13,27,62,.16)" }}>
                    {options.map((o) => (
                        <button key={o.label} onClick={o.onSelect} style={{ background: o.bg, color: o.tx, fontWeight: o.weight }} className="w-full flex items-center justify-between gap-2 text-left rounded-lg px-2.5 py-2 text-[13px] cursor-pointer hover:bg-ap-bg">
                            {o.label}<span className="text-[11px] text-ap-text-faint font-semibold">{o.count}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

function EmployeePickerStep({
    employees, empLoading,
    audSel, setAudSel,
    audSearch, setAudSearch,
    audBranch, setAudBranch,
    audDept, setAudDept,
    audRole, setAudRole,
    audOpen, setAudOpen,
    audSaved, setAudSaved,
    summary, labelBase, onNext,
}) {
    const aq = audSearch.trim().toLowerCase();
    const mSearch = (e) => !aq || e.name.toLowerCase().includes(aq) || e.code.includes(aq);
    const mBranch = (e) => audBranch === ALL_BRANCHES || e.branch === audBranch;
    const mDept = (e) => audDept === ALL_DEPTS || e.dept === audDept;
    const mRole = (e) => audRole === ALL_ROLES || e.role === audRole;
    const filtered = employees.filter((e) => mSearch(e) && mBranch(e) && mDept(e) && mRole(e));

    // Facet counts: count under all *other* active filters, skipping the one
    // being faceted so each option shows how many it would yield.
    const facet = (dim, val, skip) => employees.filter((e) => mSearch(e)
        && (skip === "b" || mBranch(e)) && (skip === "d" || mDept(e)) && (skip === "r" || mRole(e))
        && (val === "__all" || e[dim] === val)).length;
    const uniq = (arr) => [...new Set(arr)].sort();
    const mkOpts = (list, cur, setter, dim, skip) => list.map((v) => {
        const on = cur === v;
        return {
            label: v, count: v.startsWith("All ") ? facet(dim, "__all", skip) : facet(dim, v, skip),
            bg: on ? "#FEF4E8" : "#fff", tx: on ? "#C2410C" : "#1E293B", weight: on ? 800 : 600,
            onSelect: () => { setter(v); setAudOpen(null); },
        };
    });
    const branchOptions = mkOpts([ALL_BRANCHES, ...uniq(employees.map((e) => e.branch))], audBranch, setAudBranch, "branch", "b");
    const deptOptions = mkOpts([ALL_DEPTS, ...uniq(employees.map((e) => e.dept))], audDept, setAudDept, "dept", "d");
    const roleOptions = mkOpts([ALL_ROLES, ...uniq(employees.map((e) => e.role))], audRole, setAudRole, "role", "r");

    const bActive = audBranch !== ALL_BRANCHES, dActive = audDept !== ALL_DEPTS, rActive = audRole !== ALL_ROLES;
    const hasActiveFilters = bActive || dActive || rActive;
    const chips = [];
    if (bActive) chips.push({ label: "Branch · " + audBranch, onClear: () => setAudBranch(ALL_BRANCHES) });
    if (dActive) chips.push({ label: "Dept · " + audDept, onClear: () => setAudDept(ALL_DEPTS) });
    if (rActive) chips.push({ label: "Role · " + audRole, onClear: () => setAudRole(ALL_ROLES) });
    const clearFilters = () => { setAudBranch(ALL_BRANCHES); setAudDept(ALL_DEPTS); setAudRole(ALL_ROLES); setAudSearch(""); setAudOpen(null); };

    const toggleOne = (id) => setAudSel((st) => { const n = { ...st }; if (n[id]) delete n[id]; else n[id] = true; return n; });
    const selectFiltered = () => setAudSel((st) => { const n = { ...st }; filtered.forEach((e) => { n[e.id] = true; }); return n; });
    const clearAll = () => setAudSel({});
    const saveAudience = () => {
        if (summary.count === 0) return;
        const codes = Object.keys(audSel).filter((id) => audSel[id]);
        setAudSaved((prev) => [...prev, { name: labelBase, count: codes.length, codes }].slice(-4));
    };
    const applySaved = (codes) => setAudSel(Object.fromEntries(codes.map((c) => [c, true])));

    const totalFmt = employees.length.toLocaleString() + " employees";
    const audLabelText = summary.count === 0
        ? "No recipients selected yet"
        : `${summary.branchesInSel} ${summary.branchesInSel === 1 ? "branch" : "branches"} · ${summary.deptsInSel} ${summary.deptsInSel === 1 ? "department" : "departments"}`;

    return (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5 items-start">
            {/* Employee picker */}
            <div className="relative bg-white border border-ap-border rounded-[16px] p-6">
                <div className="flex items-start justify-between gap-3.5 mb-[18px]">
                    <div>
                        <h3 className="text-[16px] font-extrabold text-ap-text mb-1">Who takes this exam?</h3>
                        <p className="text-[13px] text-ap-text-faint">Filter and hand-pick employees from the live directory.</p>
                    </div>
                    <div style={{ background: "#EBF7F1", borderColor: "#A3D9BC" }} className="flex items-center gap-1.5 border px-2.5 py-1.5 rounded-full shrink-0">
                        <span style={{ background: "#00843D" }} className="w-1.5 h-1.5 rounded-full" />
                        <span className="text-[11.5px] font-bold text-[#006B32]">{empLoading ? "Loading…" : `Live · ${totalFmt}`}</span>
                    </div>
                </div>

                {/* search */}
                <div className="relative mb-3">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ap-text-faint flex"><Icon name="search" size={18} sw={1.9} /></span>
                    <input value={audSearch} onChange={(e) => setAudSearch(e.target.value)} placeholder="Search by employee name or ID…" style={{ background: "#F8FAFC" }} className="w-full border-[1.5px] border-ap-border focus:border-ap-orange focus:bg-white rounded-[11px] pl-[42px] pr-3.5 py-3 text-[14px] text-ap-text outline-none transition" />
                </div>

                {/* filter dropdowns */}
                <div className="flex gap-2.5 flex-wrap mb-3.5">
                    <FilterDropdown dim="branche" label="Branch" value={audBranch} options={branchOptions} open={audOpen === "branch"} onToggle={() => setAudOpen((o) => (o === "branch" ? null : "branch"))} />
                    <FilterDropdown dim="department" label="Department" value={audDept} options={deptOptions} open={audOpen === "dept"} onToggle={() => setAudOpen((o) => (o === "dept" ? null : "dept"))} />
                    <FilterDropdown dim="role" label="Role" value={audRole} options={roleOptions} open={audOpen === "role"} onToggle={() => setAudOpen((o) => (o === "role" ? null : "role"))} />
                </div>

                {/* active filter chips */}
                {hasActiveFilters && (
                    <div className="flex flex-wrap gap-2 items-center mb-3.5">
                        {chips.map((c) => (
                            <span key={c.label} style={{ background: "#FEF4E8", borderColor: "#FAD4A0" }} className="flex items-center gap-1.5 border text-[#C2410C] text-[12px] font-bold pl-[11px] pr-1.5 py-1 rounded-full">
                                {c.label}
                                <button onClick={c.onClear} style={{ background: "rgba(194,65,12,.12)" }} className="flex items-center justify-center w-[17px] h-[17px] rounded-full text-[#C2410C] cursor-pointer">
                                    <svg width="11" height="11" fill="none" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>
                                </button>
                            </span>
                        ))}
                        <button onClick={clearFilters} className="text-[12px] font-bold text-ap-text-muted cursor-pointer px-1.5 py-1">Clear filters</button>
                    </div>
                )}

                {/* results + bulk bar */}
                <div className="flex items-center justify-between gap-2.5 flex-wrap py-2.5 border-t border-b border-gray-100 mb-2.5">
                    <div className="text-[12.5px] text-ap-text-muted font-semibold">
                        Showing <b className="text-ap-text">{filtered.length.toLocaleString()}</b> of {totalFmt} · <b className="text-[#C2410C]">{summary.count.toLocaleString()} selected</b>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={selectFiltered} style={{ background: "#EEF3FB", borderColor: "#C7D9F5" }} className="text-[12px] font-bold text-[#003087] border px-3 py-1.5 rounded-lg cursor-pointer">Select {filtered.length} shown</button>
                        <button onClick={clearAll} style={{ background: "#F4F6FA", borderColor: "#E4E7ED" }} className="text-[12px] font-bold text-ap-text-muted border px-3 py-1.5 rounded-lg cursor-pointer">Clear all</button>
                    </div>
                </div>

                {/* employee list */}
                {empLoading ? (
                    <div className="py-12 text-center text-ap-text-muted text-[13px]">Loading employees…</div>
                ) : filtered.length > 0 ? (
                    <div className="max-h-[392px] overflow-y-auto -mx-1.5 px-1.5 py-1 flex flex-col gap-[7px]">
                        {filtered.map((e) => {
                            const sel = !!audSel[e.id];
                            return (
                                <button key={e.id} onClick={() => toggleOne(e.id)} style={{ background: sel ? "#FFFBF5" : "#fff", borderColor: sel ? ACCENT : "#EEF2F7" }} className="flex items-center gap-3 text-left cursor-pointer px-3 py-2.5 rounded-[12px] border-[1.5px] transition-colors">
                                    <span style={{ borderColor: sel ? ACCENT : "#CBD5E1", background: sel ? ACCENT : "#fff" }} className="w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0">
                                        {sel && <svg width="12" height="12" fill="none" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                                    </span>
                                    <span style={{ background: e.avBg, color: e.avTx }} className="w-[38px] h-[38px] rounded-full flex items-center justify-center font-extrabold text-[12.5px] shrink-0">{e.initials}</span>
                                    <span className="flex-1 min-w-0">
                                        <span className="flex items-center gap-2">
                                            <span className="text-[14px] font-bold text-ap-text truncate">{e.name}</span>
                                            <span className="text-[11px] text-ap-text-faint font-semibold shrink-0">#{e.code}</span>
                                        </span>
                                        <span className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                                            <span style={{ background: "#EEF3FB", color: "#003087" }} className="text-[10.5px] font-bold px-2 py-0.5 rounded-full">{e.branch}</span>
                                            <span style={{ background: "#F1F5F9", color: "#475569" }} className="text-[10.5px] font-bold px-2 py-0.5 rounded-full">{DEPT_TAG[e.dept] || e.dept}</span>
                                            <span style={{ background: "#FEF4E8", color: "#C2410C" }} className="text-[10.5px] font-bold px-2 py-0.5 rounded-full">{e.role}</span>
                                        </span>
                                    </span>
                                    {sel && <span style={{ background: "#EBF7F1", color: "#006B32" }} className="text-[10.5px] font-extrabold px-2.5 py-1 rounded-full shrink-0">Selected</span>}
                                </button>
                            );
                        })}
                    </div>
                ) : (
                    <div className="text-center py-[46px] px-5">
                        <div style={{ background: "#F4F6FA", color: "#CBD5E1" }} className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3.5"><Icon name="users" size={26} sw={1.6} /></div>
                        <div className="text-[14.5px] font-extrabold text-ap-text-muted mb-1">No employees match</div>
                        <p className="text-[13px] text-ap-text-faint mb-4">Try a different search term or clear your filters.</p>
                        <button onClick={clearFilters} style={{ background: "#EEF3FB", borderColor: "#C7D9F5" }} className="text-[13px] font-bold text-[#003087] border px-4 py-2.5 rounded-lg cursor-pointer">Clear filters</button>
                    </div>
                )}

                {/* footer */}
                <div className="flex items-center justify-between gap-3 mt-[18px] pt-4 border-t border-gray-100 flex-wrap">
                    <button onClick={saveAudience} style={{ color: summary.count > 0 ? "#003087" : "#CBD5E1", cursor: summary.count > 0 ? "pointer" : "not-allowed" }} className="flex items-center gap-2 bg-white border-[1.5px] border-ap-border font-bold text-[13px] px-3.5 py-2.5 rounded-[10px]">
                        <Icon name="bookmark" size={17} sw={1.8} />Save as custom audience
                    </button>
                    <button onClick={onNext} style={{ background: ACCENT }} className="text-white font-bold text-[14px] px-5 py-3 rounded-[11px] cursor-pointer">Next: Review →</button>
                </div>

                {audOpen && <div onClick={() => setAudOpen(null)} className="fixed inset-0 z-20" />}
            </div>

            {/* Dark live preview */}
            <div style={{ background: "#0D1B3E" }} className="rounded-[16px] p-6 text-white lg:sticky lg:top-0">
                <div className="text-[12px] font-bold text-white/50 uppercase tracking-[0.1em] mb-2.5">Recipients selected</div>
                <div className="flex items-baseline gap-2">
                    <div className="text-[52px] font-extrabold leading-none" style={{ letterSpacing: "-1.5px" }}>{summary.count.toLocaleString()}</div>
                    <div className="text-[13px] text-white/45 font-semibold">employees</div>
                </div>
                <div className="text-[13px] text-white/60 mt-1.5 font-semibold">{audLabelText}</div>
                <div className="h-px bg-white/10 my-5" />

                <div className="text-[11px] font-bold text-white/50 uppercase tracking-[0.1em] mb-3">Preview</div>
                {summary.count > 0 ? (
                    <div className="flex flex-col gap-2.5">
                        {summary.previewRows.map((p, i) => (
                            <div key={i} className="flex items-center gap-2.5">
                                <span className="w-[30px] h-[30px] rounded-full bg-white/10 text-white flex items-center justify-center font-extrabold text-[11px] shrink-0">{p.initials}</span>
                                <span className="flex-1 min-w-0 text-[13px] font-semibold text-white/90 truncate">{p.name}</span>
                                <span className="text-[10px] font-bold text-white/55 bg-white/[0.08] px-2 py-0.5 rounded-full shrink-0">{p.tag}</span>
                            </div>
                        ))}
                        {summary.more > 0 && <div className="text-[12px] text-white/45 font-semibold pl-10">+{summary.more} more selected</div>}
                    </div>
                ) : (
                    <div className="bg-white/[0.04] border border-dashed border-white/15 rounded-[12px] px-4 py-5 text-center">
                        <div className="text-[13px] text-white/60 font-semibold leading-relaxed">No one selected yet.<br />Pick employees or apply a filter to begin.</div>
                    </div>
                )}

                {summary.count > 0 && (
                    <>
                        <div className="h-px bg-white/10 my-5" />
                        <div className="text-[11px] font-bold text-white/50 uppercase tracking-[0.1em] mb-3">By branch</div>
                        <div className="flex flex-col gap-[11px]">
                            {summary.branchRows.map((r) => (
                                <div key={r.label}>
                                    <div className="flex items-center justify-between mb-1.5">
                                        <span className="text-[12px] text-white/75 font-semibold">{r.label}</span>
                                        <span className="text-[12px] font-extrabold">{r.value}</span>
                                    </div>
                                    <div className="h-[5px] bg-white/10 rounded-full overflow-hidden"><div style={{ width: `${r.pct}%`, background: r.color }} className="h-full rounded-full" /></div>
                                </div>
                            ))}
                        </div>
                    </>
                )}

                {audSaved.length > 0 && (
                    <>
                        <div className="h-px bg-white/10 my-5" />
                        <div className="text-[11px] font-bold text-white/50 uppercase tracking-[0.1em] mb-3">Saved audiences</div>
                        <div className="flex flex-wrap gap-2">
                            {audSaved.map((a, i) => (
                                <button key={i} onClick={() => applySaved(a.codes)} className="flex items-center gap-1.5 bg-white/[0.06] border border-white/15 text-white text-[12px] font-bold px-3 py-1.5 rounded-full cursor-pointer hover:bg-white/[0.12]">
                                    {a.name}<span className="text-white/50 font-semibold">{a.count}</span>
                                </button>
                            ))}
                        </div>
                    </>
                )}

                <div style={{ background: "rgba(247,148,29,.16)", borderColor: "rgba(247,148,29,.3)" }} className="mt-[22px] border rounded-[11px] px-3.5 py-3 flex gap-2.5">
                    <svg width="18" height="18" fill="none" viewBox="0 0 24 24" className="shrink-0 mt-px"><path d="M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L14.7 3.9a2 2 0 00-3.4 0z" stroke="#F7941D" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    <span className="text-[12px] text-white/80 leading-relaxed">Only the employees you select are invited. Duplicate picks across filters are removed automatically.</span>
                </div>
            </div>
        </div>
    );
}

// ── Step 4: Review ──
function ReviewStep({ details, questions, totalPoints, summary, onPublish, saving }) {
    const items = [
        ["Exam title", details.title || "Untitled"],
        ["Questions", `${questions.length} questions · ${totalPoints} pts`],
        ["Time limit", details.timeLimitMin ? `${details.timeLimitMin} minutes` : "Untimed"],
        ["Pass mark", `${details.passMark}%`],
        ["Audience", summary.label || "—"],
        ["Recipients", `${(summary.count ?? 0).toLocaleString()} employees`],
    ];
    return (
        <div className="max-w-[760px]">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mb-5">
                {items.map(([label, value]) => (
                    <div key={label} className="bg-white border border-ap-border rounded-[14px] p-4">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-ap-text-faint mb-1">{label}</p>
                        <p className="text-[15px] font-bold text-ap-text">{value}</p>
                    </div>
                ))}
            </div>
            <div style={{ background: "#EBF7F1", borderColor: "#A3D9BC" }} className="border rounded-[14px] p-5 flex items-center justify-between gap-4 flex-wrap">
                <div>
                    <p className="text-[15px] font-extrabold text-[#006B32]">Ready to publish</p>
                    <p className="text-[13px] text-[#006B32]/80">Invites will be created for the selected recipients.</p>
                </div>
                <button onClick={onPublish} disabled={saving} style={{ background: "#00843D" }} className="text-white text-[14px] font-bold rounded-[11px] px-6 py-3 cursor-pointer disabled:opacity-60">{saving ? "Publishing…" : "Publish Exam"}</button>
            </div>
        </div>
    );
}

function Field({ label, required, children }) {
    return (
        <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold text-gray-700 uppercase tracking-wide">{label}{required && <span className="text-red-600 ml-0.5">*</span>}</label>
            {children}
        </div>
    );
}
