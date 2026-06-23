"use client";

import { useState, useEffect, useMemo } from "react";
import { api } from "../../../../lib/clientApi";
import ConfirmDialog from "../../../../components/ConfirmDialog";
import { SearchInput } from "../../../../components/ui";

// `level` is the evaluation STAGE the question belongs to. Only these three are
// managed here — HOD reuses the Branch Manager bank, HR Stage 4 is attendance-
// based (not question-driven).
const LEVELS = ["SELF", "BRANCH_MANAGER", "CLUSTER_MANAGER"];
const STAGE_LABELS = {
    SELF: "Stage 1 · Self-Assessment",
    BRANCH_MANAGER: "Stage 2 · Branch Manager",
    CLUSTER_MANAGER: "Stage 3 · Cluster Manager",
};
const STAGE_SHORT = { SELF: "Stage 1", BRANCH_MANAGER: "Stage 2", CLUSTER_MANAGER: "Stage 3" };

// AUDIENCE — which employees a question is for. "BOTH" maps to a stored null
// (every employee), the default; the other two restrict the question to one
// audience only. (Stored on Question.collarType.)
const COLLAR_OPTIONS = [
    { value: "BOTH", label: "Both" },
    { value: "BLUE_COLLAR", label: "Blue collar" },
    { value: "WHITE_COLLAR", label: "White collar" },
];
const COLLAR_BADGE = {
    BOTH: { label: "Both", cls: "bg-[#EDE7F6] text-[#5E35B1] border-[#D1C4E9]" },
    WHITE_COLLAR: { label: "White collar", cls: "bg-[#E3F2FD] text-[#003087] border-[#90CAF9]" },
    BLUE_COLLAR: { label: "Blue collar", cls: "bg-[#FFF8E1] text-[#E65100] border-[#FFE082]" },
};
// A stored question's collarType (null | WHITE_COLLAR | BLUE_COLLAR) → UI token.
const collarOf = (q) => q.collarType || "BOTH";

const EMPTY_NEW = { text: "", textHindi: "", level: "SELF", collarType: "BOTH", addToQuarter: true };

/**
 * Question bank, redesigned around two axes the admin actually works in:
 *
 *  1. STAGE — tabs across Stage 1 / 2 / 3, so each stage has its own clean list.
 *  2. QUARTER — a quarter picker at the top. Pick a quarter and every question
 *     gets an "In quarter" checkbox; ticking/unticking stages the change locally.
 *     Nothing is written until the admin hits "Apply changes" and confirms.
 *
 * Each question also carries an AUDIENCE (Both / Blue collar / White collar)
 * set on the add & edit forms.
 *
 * Deletion is allowed only while NO quarter is active; editing is always
 * allowed. (The server enforces this too.)
 *
 * The questions array is cached in page.js (fetched once per session) — CRUD
 * handlers here mutate it via the passed setQuestions. Quarter membership is
 * fetched/owned locally since it is quarter-scoped.
 */
export default function QuestionsView({ questions, setQuestions, fetchQuestions, can = () => true }) {
    const [newQ, setNewQ] = useState(EMPTY_NEW);
    const [qMsg, setQMsg] = useState({ type: "", text: "" });
    const [qFilter, setQFilter] = useState({ collar: "", search: "" });
    const [onlyInQuarter, setOnlyInQuarter] = useState(false);
    const [editingQ, setEditingQ] = useState(null);
    const [deleteQ, setDeleteQ] = useState(null);
    const [showAddForm, setShowAddForm] = useState(false);
    const [showConfig, setShowConfig] = useState(false);
    const [activeStage, setActiveStage] = useState("SELF");

    // Generic confirm dialog ("Apply changes?") shared by add / edit / apply.
    const [confirm, setConfirm] = useState(null); // { title, message, confirmLabel, variant, onConfirm }
    const [confirmLoading, setConfirmLoading] = useState(false);

    // ── Quarter membership state ──
    const [quarters, setQuarters] = useState([]);
    const [selectedQuarterId, setSelectedQuarterId] = useState("");
    const [committedQIds, setCommittedQIds] = useState(new Set()); // saved membership of selected quarter
    const [pending, setPending] = useState({}); // questionId -> desired bool (only entries that differ from committed)
    const [quarterLoading, setQuarterLoading] = useState(false);

    const selectedQuarter = quarters.find((q) => q.id === selectedQuarterId) || null;
    const quarterIsClosed = selectedQuarter?.status === "CLOSED";
    const quarterReadOnly = !selectedQuarterId || quarterIsClosed;

    // Deletion is blocked entirely while ANY quarter is active (editing stays
    // allowed). With no active quarter, questions are freely deletable.
    const activeQuarter = quarters.find((q) => q.status === "ACTIVE") || null;
    const deleteBlocked = !!activeQuarter;

    // Load the quarter list once; default the picker to the active quarter.
    useEffect(() => {
        (async () => {
            try {
                const d = await api("/api/admin/quarters/list");
                setQuarters(d.quarters || []);
                setSelectedQuarterId((prev) => prev || d.activeQuarterId || "");
            } catch (err) { console.error("[Questions] quarter list failed:", err); }
        })();
    }, []);

    // Whenever the selected quarter changes, load its locked question set and
    // drop any staged-but-unapplied changes (they belonged to the old quarter).
    useEffect(() => {
        setPending({});
        if (!selectedQuarterId) { setCommittedQIds(new Set()); return; }
        let cancelled = false;
        (async () => {
            setQuarterLoading(true);
            try {
                const d = await api(`/api/admin/quarters/${selectedQuarterId}/questions`);
                if (!cancelled) setCommittedQIds(new Set(d.questionIds || []));
            } catch (err) {
                if (!cancelled) { setCommittedQIds(new Set()); console.error("[Questions] quarter membership failed:", err); }
            } finally {
                if (!cancelled) setQuarterLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [selectedQuarterId]);

    // Desired membership for a question = staged value if present, else committed.
    const desiredIn = (id) => (Object.prototype.hasOwnProperty.call(pending, id) ? pending[id] : committedQIds.has(id));
    const pendingCount = Object.keys(pending).length;

    const toggleQuarter = (id) => {
        if (quarterReadOnly) return;
        const next = !desiredIn(id);
        setPending((prev) => {
            const copy = { ...prev };
            if (next === committedQIds.has(id)) delete copy[id]; // back to saved state — no longer pending
            else copy[id] = next;
            return copy;
        });
    };

    const applyQuarterChanges = async () => {
        const add = Object.keys(pending).filter((id) => pending[id]);
        const remove = Object.keys(pending).filter((id) => !pending[id]);
        try {
            const d = await api(`/api/admin/quarters/${selectedQuarterId}/questions`, {
                method: "PUT", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ add, remove }),
            });
            const finalIds = new Set(d.questionIds || []);
            setCommittedQIds(finalIds);
            setPending({});
            const n = finalIds.size;
            setQMsg({ type: "success", text: `${n} question${n !== 1 ? "s are" : " is"} selected for ${selectedQuarter?.name || "the quarter"}. You can proceed.` });
        } catch (e) { setQMsg({ type: "error", text: e.message }); }
    };

    // ── Question CRUD ──
    const addQuestion = async () => {
        if (!newQ.text.trim()) { setQMsg({ type: "error", text: "Question text is required" }); return; }
        try {
            const d = await api("/api/admin/questions", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: newQ.text, textHindi: newQ.textHindi, level: newQ.level, collarType: newQ.collarType }),
            });
            setQuestions((prev) => [d.question, ...prev]);

            // Optionally link the brand-new question into the selected quarter.
            let extra = "";
            if (newQ.addToQuarter && selectedQuarterId && !quarterIsClosed) {
                try {
                    const r = await api(`/api/admin/quarters/${selectedQuarterId}/questions`, {
                        method: "PUT", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ add: [d.question.id], remove: [] }),
                    });
                    setCommittedQIds(new Set(r.questionIds || []));
                    extra = ` and added to ${selectedQuarter?.name || "quarter"}`;
                } catch (e) { extra = ` (but adding to quarter failed: ${e.message})`; }
            }
            setNewQ({ ...EMPTY_NEW, level: activeStage });
            setShowAddForm(false);
            setQMsg({ type: "success", text: `Question added${extra}!` });
        } catch (e) { setQMsg({ type: "error", text: e.message }); }
    };

    const saveEditQuestion = async () => {
        if (!editingQ) return;
        try {
            const d = await api(`/api/admin/questions/${editingQ.id}`, {
                method: "PUT", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: editingQ.text, textHindi: editingQ.textHindi, level: editingQ.level, collarType: editingQ.collarType }),
            });
            setQuestions((prev) => prev.map((q) => (q.id === editingQ.id ? d.question : q)));
            setEditingQ(null);
            setQMsg({ type: "success", text: "Question updated!" });
        } catch (e) { setQMsg({ type: "error", text: e.message }); }
    };

    const toggleQuestion = async (id) => {
        try {
            const d = await api(`/api/admin/questions/${id}`, { method: "PATCH" });
            setQuestions((prev) => prev.map((q) => (q.id === id ? d.question : q)));
        } catch (err) { console.error("[Admin] toggleQuestion failed:", err); }
    };

    const confirmDeleteQuestion = async () => {
        if (!deleteQ) return;
        setQMsg({ type: "", text: "" });
        try {
            await api(`/api/admin/questions/${deleteQ.id}`, { method: "DELETE" });
            setQuestions((prev) => prev.filter((q) => q.id !== deleteQ.id));
            setDeleteQ(null);
            setQMsg({ type: "success", text: "Question deleted!" });
        } catch (e) { setQMsg({ type: "error", text: e.message }); setDeleteQ(null); }
    };

    // Run the action behind the active confirm dialog, then close it.
    const runConfirm = async () => {
        if (!confirm?.onConfirm) { setConfirm(null); return; }
        setConfirmLoading(true);
        try { await confirm.onConfirm(); } finally { setConfirmLoading(false); setConfirm(null); }
    };

    // ── Derived lists ──
    const search = qFilter.search.toLowerCase();
    const visible = useMemo(() => {
        return questions
            .filter((q) => q.level === activeStage)
            .filter((q) => !qFilter.collar || collarOf(q) === qFilter.collar)
            .filter((q) => !search || q.text.toLowerCase().includes(search) || (q.textHindi || "").toLowerCase().includes(search))
            .filter((q) => !onlyInQuarter || desiredIn(q.id))
            .sort((a, b) => a.text.localeCompare(b.text));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [questions, activeStage, qFilter, onlyInQuarter, pending, committedQIds]);

    const stageStats = LEVELS.map((level) => {
        const all = questions.filter((q) => q.level === level);
        return {
            level,
            total: all.length,
            inQuarter: selectedQuarterId ? all.filter((q) => desiredIn(q.id)).length : 0,
        };
    });

    const activeCount = questions.filter((q) => q.isActive).length;
    const filtersActive = qFilter.search || qFilter.collar || onlyInQuarter;

    // Per-stage breakdown of ACTIVE questions by audience.
    const configByStage = LEVELS.map((level) => {
        const ql = questions.filter((q) => q.level === level && q.isActive);
        return {
            level,
            both: ql.filter((q) => !q.collarType).length,
            white: ql.filter((q) => q.collarType === "WHITE_COLLAR").length,
            blue: ql.filter((q) => q.collarType === "BLUE_COLLAR").length,
        };
    });

    const askApply = () => {
        const addN = Object.keys(pending).filter((id) => pending[id]).length;
        const remN = Object.keys(pending).filter((id) => !pending[id]).length;
        const parts = [];
        if (addN) parts.push(`add ${addN}`);
        if (remN) parts.push(`remove ${remN}`);
        setConfirm({
            title: "Apply changes?",
            message: `This will ${parts.join(" and ")} question${pendingCount !== 1 ? "s" : ""} for "${selectedQuarter?.name || "this quarter"}", updating its locked question set.`,
            confirmLabel: "Apply changes",
            variant: "warning",
            onConfirm: applyQuarterChanges,
        });
    };

    return (
        <div className="space-y-5">
            {qMsg.text && (<div className={`p-3 rounded-lg text-sm border ${qMsg.type === "success" ? "bg-[#E8F5E9] border-[#A5D6A7] text-[#1B5E20]" : "bg-[#FFEBEE] border-[#EF9A9A] text-[#D32F2F]"}`}>{qMsg.text}</div>)}

            {/* ═══════ Header ═══════ */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h2 className="text-xl font-bold text-ap-blue">Question Bank</h2>
                    <p className="text-sm text-gray-700">{questions.length} total · {activeCount} active</p>
                    {deleteBlocked && (
                        <p className="mt-1 text-[12px] text-[#E65100] font-medium">Quarter “{activeQuarter?.name}” is active — questions can be edited but not deleted until it’s closed.</p>
                    )}
                </div>
                <div className="flex gap-2">
                    <button onClick={fetchQuestions} className="min-h-[44px] px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 hover:text-ap-blue text-[14px] cursor-pointer hover:bg-gray-50 transition-colors">↻ Refresh</button>
                    {can("questions.add") && <button onClick={() => { setNewQ({ ...EMPTY_NEW, level: activeStage }); setShowAddForm((s) => !s); }} className="px-4 py-2 min-h-[44px] bg-ap-blue hover:bg-ap-green text-white font-bold text-[14px] rounded-lg cursor-pointer transition-all shadow-sm">+ Add Question</button>}
                </div>
            </div>

            {/* ═══════ Quarter picker ═══════ */}
            <div className="bg-white border border-ap-border shadow-card rounded-card p-4 sm:p-5">
                <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                    <div className="sm:min-w-[280px]">
                        <label className="block text-xs text-gray-700 mb-1 font-semibold uppercase tracking-wider">Quarter</label>
                        <select value={selectedQuarterId} onChange={(e) => setSelectedQuarterId(e.target.value)} className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-ap-blue">
                            <option value="">— Question bank only (no quarter) —</option>
                            {quarters.map((q) => (
                                <option key={q.id} value={q.id}>{q.name}{q.status === "ACTIVE" ? " (active)" : q.status === "CLOSED" ? " (closed)" : ""}</option>
                            ))}
                        </select>
                    </div>
                    {selectedQuarterId && (
                        <div className="flex items-center gap-2 text-sm">
                            <span className={`inline-block text-[11px] font-bold px-2 py-1 rounded-full border ${quarterIsClosed ? "bg-gray-100 text-gray-600 border-gray-300" : "bg-[#E8F5E9] text-[#1B5E20] border-[#A5D6A7]"}`}>{quarterIsClosed ? "Closed" : "Active"}</span>
                            <span className="text-gray-700">{committedQIds.size} question{committedQIds.size !== 1 ? "s" : ""} in this quarter{quarterLoading ? " …" : ""}</span>
                        </div>
                    )}
                </div>
                <p className="text-[12px] text-gray-500 mt-3">
                    {selectedQuarterId
                        ? quarterIsClosed
                            ? "This quarter is closed — its question set is read-only. Pick an active quarter to make changes."
                            : "Tick “In quarter” on any question below to stage it for this quarter, then “Apply changes” to save. Stage 2 & 3 questions take effect immediately for evaluators; Stage 1 questions are assigned per-employee when a quarter starts."
                        : "Pick a quarter to select which questions belong to it. With no quarter selected you're just editing the bank."}
                </p>
            </div>

            {/* Add Question Form (collapsible) */}
            {showAddForm && (
                <div className="bg-white border border-ap-border shadow-card rounded-card p-5 sm:p-6">
                    <h3 className="text-lg font-semibold text-ap-blue mb-4">Add New Question</h3>
                    <div className="space-y-4">
                        <div><label className="block text-sm text-gray-700 mb-1 font-medium">Question Text (English)</label><textarea value={newQ.text} onChange={(e) => setNewQ({ ...newQ, text: e.target.value })} rows={2} placeholder="Enter the question text in English..." className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-ap-blue resize-none" /></div>
                        <div><label className="block text-sm text-gray-700 mb-1 font-medium">Question Text (Hindi)</label><textarea value={newQ.textHindi} onChange={(e) => setNewQ({ ...newQ, textHindi: e.target.value })} rows={2} placeholder="Enter the question text in Hindi..." className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-ap-blue resize-none" /></div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div><label className="block text-sm text-gray-700 mb-1 font-medium">Stage</label><select value={newQ.level} onChange={(e) => setNewQ({ ...newQ, level: e.target.value })} className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-ap-blue">{LEVELS.map((l) => <option key={l} value={l}>{STAGE_LABELS[l]}</option>)}</select></div>
                            <div>
                                <label className="block text-sm text-gray-700 mb-1 font-medium">Audience</label>
                                <div className="flex flex-wrap gap-2">
                                    {COLLAR_OPTIONS.map((c) => (
                                        <label key={c.value} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm cursor-pointer select-none transition-colors ${newQ.collarType === c.value ? "border-ap-blue bg-ap-blue-50 text-ap-blue font-semibold" : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"}`}>
                                            <input type="radio" name="new-audience" value={c.value} checked={newQ.collarType === c.value} onChange={(e) => setNewQ({ ...newQ, collarType: e.target.value })} className="w-4 h-4 accent-ap-blue cursor-pointer" />
                                            {c.label}
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </div>
                        {selectedQuarterId && !quarterIsClosed && (
                            <label className="flex items-center gap-2 text-sm text-gray-800 cursor-pointer select-none">
                                <input type="checkbox" checked={newQ.addToQuarter} onChange={(e) => setNewQ({ ...newQ, addToQuarter: e.target.checked })} className="w-4 h-4 accent-ap-blue cursor-pointer" />
                                Add this question to <span className="font-semibold">{selectedQuarter?.name}</span> right away
                            </label>
                        )}
                        <div className="flex gap-2">
                            <button onClick={() => setConfirm({ title: "Apply changes?", message: "Save this new question to the bank?", confirmLabel: "Save question", variant: "default", onConfirm: addQuestion })} className="px-6 py-2.5 bg-ap-blue hover:bg-ap-green text-white font-semibold rounded-lg cursor-pointer transition-all shadow-sm">Save Question</button>
                            <button onClick={() => setShowAddForm(false)} className="px-4 py-2.5 bg-gray-50 border border-gray-300 text-gray-700 hover:text-ap-blue hover:bg-white rounded-lg cursor-pointer transition-colors">Cancel</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════ Stage tabs ═══════ */}
            <div className="flex flex-wrap gap-2">
                {stageStats.map(({ level, total, inQuarter }) => {
                    const isActive = activeStage === level;
                    return (
                        <button key={level} onClick={() => setActiveStage(level)} className={`px-4 py-2.5 rounded-lg text-sm font-bold border transition-colors cursor-pointer flex items-center gap-2 ${isActive ? "bg-ap-blue text-white border-ap-blue shadow-sm" : "bg-white text-gray-700 border-ap-border hover:bg-gray-50"}`}>
                            <span>{STAGE_SHORT[level]}</span>
                            <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${isActive ? "bg-white/20 text-white" : "bg-gray-100 text-gray-600"}`}>{total}</span>
                            {selectedQuarterId && (
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${isActive ? "bg-ap-green/90 text-white border-transparent" : "bg-[#E8F5E9] text-[#1B5E20] border-[#A5D6A7]"}`} title="In selected quarter">★ {inQuarter}</span>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* ═══════ Filters ═══════ */}
            <div className="bg-white border border-ap-border shadow-card rounded-card p-3 sm:p-4 space-y-2 sm:space-y-0 sm:flex sm:flex-wrap sm:items-end sm:gap-3">
                <div className="w-full sm:flex-1 sm:min-w-[200px]">
                    <label className="block text-xs text-gray-700 mb-1 font-medium">Search</label>
                    <SearchInput value={qFilter.search} onChange={(v) => setQFilter((p) => ({ ...p, search: v }))} placeholder={`Search ${STAGE_SHORT[activeStage]} questions...`} />
                </div>
                <div className="flex gap-3">
                    <div>
                        <label className="block text-xs text-gray-700 mb-1 font-medium">Audience</label>
                        <select value={qFilter.collar} onChange={(e) => setQFilter({ ...qFilter, collar: e.target.value })} className="w-full sm:w-auto px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-ap-blue sm:min-w-[150px]">
                            <option value="">All audiences</option>
                            {COLLAR_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                        </select>
                    </div>
                </div>
                {selectedQuarterId && (
                    <label className="flex items-center gap-2 text-sm text-gray-800 cursor-pointer select-none sm:ml-1">
                        <input type="checkbox" checked={onlyInQuarter} onChange={(e) => setOnlyInQuarter(e.target.checked)} className="w-4 h-4 accent-ap-blue cursor-pointer" />
                        Only in quarter
                    </label>
                )}
                {filtersActive && (
                    <button onClick={() => { setQFilter({ collar: "", search: "" }); setOnlyInQuarter(false); }} className="w-full sm:w-auto px-3 py-2 bg-gray-50 hover:bg-white border border-ap-border text-gray-700 rounded-lg text-sm cursor-pointer transition-colors">Clear</button>
                )}
            </div>

            <p className="text-xs text-gray-500">{visible.length} {STAGE_SHORT[activeStage]} question{visible.length !== 1 ? "s" : ""} shown</p>

            {/* ═══════ Question list (current stage) ═══════ */}
            <div className="bg-white border border-ap-border rounded-card overflow-hidden shadow-card divide-y divide-ap-border">
                {visible.map((q) => {
                    const inQ = desiredIn(q.id);
                    const staged = Object.prototype.hasOwnProperty.call(pending, q.id);
                    return (
                        <div key={q.id} className={`px-3 sm:px-4 py-3 transition-colors group ${staged ? "bg-[#FFF8E1]" : "hover:bg-gray-50"}`}>
                            {editingQ?.id === q.id ? (
                                <div className="space-y-2">
                                    <textarea value={editingQ.text} onChange={(e) => setEditingQ({ ...editingQ, text: e.target.value })} rows={2} placeholder="English text" className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-ap-blue resize-none" />
                                    <textarea value={editingQ.textHindi || ""} onChange={(e) => setEditingQ({ ...editingQ, textHindi: e.target.value })} rows={2} placeholder="Hindi text" className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-ap-blue resize-none" />
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        <div><label className="block text-[11px] text-gray-500 mb-0.5 font-medium">Stage</label><select value={editingQ.level} onChange={(e) => setEditingQ({ ...editingQ, level: e.target.value })} className="w-full px-2 py-1.5 bg-white border border-gray-300 rounded-lg text-gray-900 text-xs">{LEVELS.map((l) => <option key={l} value={l}>{STAGE_LABELS[l]}</option>)}</select></div>
                                        <div><label className="block text-[11px] text-gray-500 mb-0.5 font-medium">Audience</label><select value={editingQ.collarType} onChange={(e) => setEditingQ({ ...editingQ, collarType: e.target.value })} className="w-full px-2 py-1.5 bg-white border border-gray-300 rounded-lg text-gray-900 text-xs">{COLLAR_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select></div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={() => setConfirm({ title: "Apply changes?", message: "Save the edits to this question?", confirmLabel: "Save", variant: "default", onConfirm: saveEditQuestion })} className="min-h-[40px] px-3 py-1.5 bg-ap-blue hover:bg-ap-green text-white text-[13px] sm:text-[14px] font-bold rounded-lg cursor-pointer transition-colors shadow-sm">Save</button>
                                        <button onClick={() => setEditingQ(null)} className="min-h-[40px] px-3 py-1.5 bg-white border border-gray-300 text-gray-700 font-bold text-[13px] sm:text-[14px] rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">Cancel</button>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                                    {selectedQuarterId && can("questions.select") && (
                                        <label className={`flex items-center gap-1.5 shrink-0 text-[11px] font-bold select-none ${quarterReadOnly ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`} title={quarterReadOnly ? "Read-only" : "Include in selected quarter"}>
                                            <input type="checkbox" disabled={quarterReadOnly} checked={inQ} onChange={() => toggleQuarter(q.id)} className="w-4 h-4 accent-ap-blue cursor-pointer disabled:cursor-not-allowed" />
                                            <span className={inQ ? "text-ap-blue" : "text-gray-400"}>In quarter</span>
                                        </label>
                                    )}
                                    <div className={`flex-1 ${q.isActive ? "" : "opacity-50"}`}>
                                        <div className="flex items-start gap-2 flex-wrap">
                                            <span className={`mt-0.5 shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border ${COLLAR_BADGE[collarOf(q)].cls}`} title={`Audience: ${COLLAR_BADGE[collarOf(q)].label}`}>{COLLAR_BADGE[collarOf(q)].label}</span>
                                            <div className="min-w-0">
                                                <p className={`text-[13px] sm:text-sm tracking-tight ${q.isActive ? "text-gray-900" : "text-gray-400 line-through"}`}>{q.text}</p>
                                                {q.textHindi && <p className="text-[12px] sm:text-[13px] text-gray-500 italic mt-0.5">{q.textHindi}</p>}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                                        {can("questions.editdelete") && <button onClick={() => setEditingQ({ id: q.id, text: q.text, textHindi: q.textHindi || "", level: q.level, collarType: collarOf(q) })} className="min-h-[36px] sm:min-h-[40px] px-2.5 sm:px-3 py-1.5 bg-gray-50 font-bold border border-ap-border text-gray-700 hover:text-ap-blue rounded-md cursor-pointer transition-colors text-[12px] sm:text-[13px]">Edit</button>}
                                        {can("questions.editdelete") && <button onClick={() => setDeleteQ(q)} disabled={deleteBlocked} title={deleteBlocked ? `Delete is disabled while "${activeQuarter?.name}" is active — you can still edit.` : "Delete question"} className={`min-h-[36px] sm:min-h-[40px] px-2.5 sm:px-3 py-1.5 font-bold border rounded-md transition-colors text-[12px] sm:text-[13px] ${deleteBlocked ? "bg-gray-100 border-gray-200 text-gray-300 cursor-not-allowed" : "bg-gray-50 border-ap-border text-gray-700 hover:text-[#D32F2F] cursor-pointer"}`}>Delete</button>}
                                        <button onClick={() => toggleQuestion(q.id)} className={`min-h-[36px] sm:min-h-[40px] text-[12px] sm:text-[13px] font-bold px-2.5 sm:px-3 py-1.5 rounded-lg border transition-colors cursor-pointer shrink-0 shadow-sm ${q.isActive ? "bg-ap-green text-white border-[#A5D6A7]" : "bg-gray-300 text-gray-700 border-[#EF9A9A]"}`}>{q.isActive ? "Active" : "Off"}</button>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
                {visible.length === 0 && <div className="p-8 text-center text-gray-700">No {STAGE_SHORT[activeStage]} questions match your filters.</div>}
            </div>

            {/* ═══════ Assessment Configuration (collapsible) ═══════ */}
            <div className="bg-white border border-ap-border shadow-card rounded-card">
                <button onClick={() => setShowConfig((s) => !s)} className="w-full flex items-center justify-between px-5 py-4 cursor-pointer text-left">
                    <div>
                        <h2 className="text-lg font-bold text-ap-blue">Assessment Configuration</h2>
                        <p className="text-[12px] text-gray-500">Per-stage breakdown of active questions by audience.</p>
                    </div>
                    <span className="text-gray-400 text-sm">{showConfig ? "▲ Hide" : "▼ Show"}</span>
                </button>
                {showConfig && (
                    <div className="px-5 pb-5">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm min-w-[520px]">
                                <thead>
                                    <tr className="text-[11px] uppercase tracking-wider text-gray-500 border-b border-ap-border">
                                        <th className="py-2 pr-4 font-semibold">Stage</th>
                                        <th className="py-2 px-3 font-semibold text-center">Both</th>
                                        <th className="py-2 px-3 font-semibold text-center">White-collar only</th>
                                        <th className="py-2 px-3 font-semibold text-center">Blue-collar only</th>
                                        <th className="py-2 pl-3 font-semibold text-center">Effective set</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-ap-border">
                                    {configByStage.map((row) => {
                                        const whiteTotal = row.both + row.white;
                                        const blueTotal = row.both + row.blue;
                                        const differs = row.white > 0 || row.blue > 0;
                                        return (
                                            <tr key={row.level}>
                                                <td className="py-2.5 pr-4 font-semibold text-ap-blue">{STAGE_LABELS[row.level]}</td>
                                                <td className="py-2.5 px-3 text-center tabular-nums text-gray-900">{row.both}</td>
                                                <td className="py-2.5 px-3 text-center tabular-nums text-gray-900">{row.white}</td>
                                                <td className="py-2.5 px-3 text-center tabular-nums text-gray-900">{row.blue}</td>
                                                <td className="py-2.5 pl-3 text-center">
                                                    <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full border ${differs ? "bg-[#FFF8E1] text-[#E65100] border-[#FFE082]" : "bg-[#E8F5E9] text-[#1B5E20] border-[#A5D6A7]"}`}>
                                                        {differs ? `WC ${whiteTotal} · BC ${blueTotal}` : `Same · ${row.both}`}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        <p className="text-[12px] text-gray-500 mt-3">
                            &ldquo;Effective set&rdquo; is what each employee actually receives: shared (Both) questions plus the ones tagged for their audience.
                        </p>
                    </div>
                )}
            </div>

            {/* ═══════ Sticky "Apply changes" bar (quarter staging) ═══════ */}
            {pendingCount > 0 && !quarterReadOnly && can("questions.select") && (
                <div className="sticky bottom-3 z-20">
                    <div className="bg-ap-blue text-white rounded-xl shadow-pop px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <span className="text-sm font-semibold">
                            {pendingCount} pending change{pendingCount !== 1 ? "s" : ""} for <span className="underline">{selectedQuarter?.name}</span>
                        </span>
                        <div className="flex gap-2">
                            <button onClick={() => setPending({})} className="px-4 py-2 bg-white/15 hover:bg-white/25 text-white font-bold text-sm rounded-lg cursor-pointer transition-colors">Discard</button>
                            <button onClick={askApply} className="px-5 py-2 bg-white text-ap-blue font-bold text-sm rounded-lg cursor-pointer hover:bg-gray-100 transition-colors shadow-sm">Apply changes</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Generic confirm (apply / add / edit) */}
            <ConfirmDialog
                open={!!confirm}
                title={confirm?.title || ""}
                message={confirm?.message || ""}
                confirmLabel={confirm?.confirmLabel || "Confirm"}
                variant={confirm?.variant || "warning"}
                loading={confirmLoading}
                onConfirm={runConfirm}
                onCancel={() => setConfirm(null)}
            />

            {/* Delete Confirmation */}
            <ConfirmDialog
                open={!!deleteQ}
                title="Delete Question?"
                message={deleteQ ? `Are you sure you want to delete: "${deleteQ.text}"? This cannot be undone.` : ""}
                confirmLabel="Delete"
                variant="danger"
                onConfirm={confirmDeleteQuestion}
                onCancel={() => setDeleteQ(null)}
            />
        </div>
    );
}
