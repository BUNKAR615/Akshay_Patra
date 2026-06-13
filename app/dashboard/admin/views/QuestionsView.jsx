"use client";

import { useState } from "react";
import { api } from "../../../../lib/clientApi";
import ConfirmDialog from "../../../../components/ConfirmDialog";
import { SearchInput } from "../../../../components/ui";

const CATEGORIES = ["ATTENDANCE", "DISCIPLINE", "PRODUCTIVITY", "TEAMWORK", "INITIATIVE", "COMMUNICATION", "INTEGRITY"];

// `level` is the evaluation STAGE the question belongs to. Only these three are
// managed here — HOD reuses the Branch Manager bank, HR Stage 4 is attendance-
// based (not question-driven).
const LEVELS = ["SELF", "BRANCH_MANAGER", "CLUSTER_MANAGER"];
const STAGE_LABELS = {
    SELF: "Stage 1 · Self-Assessment",
    BRANCH_MANAGER: "Stage 2 · Branch Manager",
    CLUSTER_MANAGER: "Stage 3 · Cluster Manager",
};

// `collarType` is the employee CATEGORY a question applies to. "BOTH" maps to a
// stored null (shared by every employee) — the default and backward-compatible
// value. The other two restrict a question to one category only.
const COLLAR_OPTIONS = [
    { value: "BOTH", label: "Both categories" },
    { value: "WHITE_COLLAR", label: "White-collar only" },
    { value: "BLUE_COLLAR", label: "Blue-collar only" },
];
const COLLAR_BADGE = {
    BOTH: { label: "Both", cls: "bg-[#EDE7F6] text-[#5E35B1] border-[#D1C4E9]" },
    WHITE_COLLAR: { label: "White-collar", cls: "bg-[#E3F2FD] text-[#003087] border-[#90CAF9]" },
    BLUE_COLLAR: { label: "Blue-collar", cls: "bg-[#FFF8E1] text-[#E65100] border-[#FFE082]" },
};
// A stored question's collarType (null | WHITE_COLLAR | BLUE_COLLAR) → UI token.
const collarOf = (q) => q.collarType || "BOTH";

/**
 * Question bank + Assessment Configuration tab. Each question is defined by a
 * STAGE (level) and an employee CATEGORY (collarType). The configuration
 * overview shows, per stage, how many questions are shared vs. category-specific
 * so the admin can see at a glance whether blue- and white-collar staff get the
 * same or different questions.
 *
 * The questions array is cached in page.js (fetched once per session) — CRUD
 * handlers here mutate it via the passed setQuestions.
 */
export default function QuestionsView({ questions, setQuestions, fetchQuestions }) {
    const [newQ, setNewQ] = useState({ text: "", textHindi: "", category: "ATTENDANCE", level: "SELF", collarType: "BOTH" });
    const [qMsg, setQMsg] = useState({ type: "", text: "" });
    const [qFilter, setQFilter] = useState({ level: "", category: "", collar: "", search: "" });
    const [editingQ, setEditingQ] = useState(null);
    const [deleteQ, setDeleteQ] = useState(null);
    const [showAddForm, setShowAddForm] = useState(false);

    const addQuestion = async () => {
        setQMsg({ type: "", text: "" });
        if (!newQ.text.trim()) { setQMsg({ type: "error", text: "Question text is required" }); return; }
        try {
            const d = await api("/api/admin/questions", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify(newQ),
            });
            setQuestions((prev) => [d.question, ...prev]);
            setNewQ({ text: "", textHindi: "", category: "ATTENDANCE", level: "SELF", collarType: "BOTH" });
            setShowAddForm(false);
            setQMsg({ type: "success", text: "Question added!" });
        } catch (e) { setQMsg({ type: "error", text: e.message }); }
    };

    const toggleQuestion = async (id) => {
        try {
            const d = await api(`/api/admin/questions/${id}`, { method: "PATCH" });
            setQuestions((prev) => prev.map((q) => (q.id === id ? d.question : q)));
        } catch (err) { console.error("[Admin] toggleQuestion failed:", err); }
    };

    // Curate which questions a MANUAL-mode quarter locks. Has no effect on
    // quarters started in Automatic mode.
    const toggleInclude = async (q) => {
        try {
            const d = await api(`/api/admin/questions/${q.id}`, {
                method: "PUT", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ includedInQuarter: !q.includedInQuarter }),
            });
            setQuestions((prev) => prev.map((x) => (x.id === q.id ? d.question : x)));
        } catch (err) { console.error("[Admin] toggleInclude failed:", err); }
    };

    const saveEditQuestion = async () => {
        if (!editingQ) return;
        setQMsg({ type: "", text: "" });
        try {
            const d = await api(`/api/admin/questions/${editingQ.id}`, {
                method: "PUT", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: editingQ.text, textHindi: editingQ.textHindi, category: editingQ.category, level: editingQ.level, collarType: editingQ.collarType }),
            });
            setQuestions((prev) => prev.map((q) => (q.id === editingQ.id ? d.question : q)));
            setEditingQ(null);
            setQMsg({ type: "success", text: "Question updated!" });
        } catch (e) { setQMsg({ type: "error", text: e.message }); }
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

    const filteredQuestions = questions.filter((q) => {
        if (qFilter.level && q.level !== qFilter.level) return false;
        if (qFilter.category && q.category !== qFilter.category) return false;
        if (qFilter.collar && collarOf(q) !== qFilter.collar) return false;
        if (qFilter.search && !q.text.toLowerCase().includes(qFilter.search.toLowerCase())) return false;
        return true;
    });
    const activeCount = questions.filter((q) => q.isActive).length;
    const groupedByLevel = LEVELS.reduce((acc, level) => {
        const levelQs = filteredQuestions.filter((q) => q.level === level);
        if (levelQs.length > 0) acc.push({ level, questions: levelQs });
        return acc;
    }, []);

    // Per-stage breakdown of ACTIVE questions by employee category — drives the
    // configuration overview so the admin can confirm the same/different setup.
    const configByStage = LEVELS.map((level) => {
        const ql = questions.filter((q) => q.level === level && q.isActive);
        return {
            level,
            both: ql.filter((q) => !q.collarType).length,
            white: ql.filter((q) => q.collarType === "WHITE_COLLAR").length,
            blue: ql.filter((q) => q.collarType === "BLUE_COLLAR").length,
        };
    });

    return (
        <div className="space-y-6">
            {qMsg.text && (<div className={`p-3 rounded-lg text-sm border ${qMsg.type === "success" ? "bg-[#E8F5E9] border-[#A5D6A7] text-[#1B5E20]" : "bg-[#FFEBEE] border-[#EF9A9A] text-[#D32F2F]"}`}>{qMsg.text}</div>)}

            {/* ═══════ Assessment Configuration overview ═══════ */}
            <div className="bg-white border border-ap-border shadow-card rounded-card p-5 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-4">
                    <div>
                        <h2 className="text-xl font-bold text-ap-blue">Assessment Configuration</h2>
                        <p className="text-sm text-gray-700 mt-1 max-w-3xl">
                            Each question belongs to a <span className="font-semibold">stage</span> and applies to an
                            <span className="font-semibold"> employee category</span>. Set a question to
                            <span className="font-semibold"> Both</span> to reuse it for every employee, or restrict it to
                            <span className="font-semibold"> White-collar</span> or <span className="font-semibold">Blue-collar</span> when
                            it only makes sense for that group. Blue-collar staff never see white-collar-only questions, and vice-versa.
                        </p>
                    </div>
                </div>
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
                    &ldquo;Effective set&rdquo; is what each employee actually receives: shared (Both) questions plus the ones tagged for their category.
                    A green &ldquo;Same&rdquo; badge means both categories get an identical set for that stage.
                </p>
            </div>

            {/* Summary + Add button */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h2 className="text-xl font-bold text-ap-blue">Question Bank</h2>
                    <p className="text-sm text-gray-700">{questions.length} total questions | {activeCount} active</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={fetchQuestions} className="min-h-[44px] min-w-[80px] font-bold px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 hover:text-ap-blue text-[14px] cursor-pointer hover:bg-gray-50 transition-colors">↻ Refresh</button>
                    <button onClick={() => setShowAddForm(!showAddForm)} className="px-4 py-2 min-h-[44px] min-w-[80px] bg-ap-blue hover:bg-ap-green text-white font-bold text-[14px] rounded-lg cursor-pointer transition-all shadow-sm">+ Add Question</button>
                </div>
            </div>

            {/* Add Question Form (collapsible) */}
            {showAddForm && (
                <div className="bg-white border border-ap-border shadow-card rounded-card p-6">
                    <h3 className="text-lg font-semibold text-ap-blue mb-4">Add New Question</h3>
                    <div className="space-y-4">
                        <div><label className="block text-sm text-gray-700 mb-1 font-medium">Question Text (English)</label><textarea value={newQ.text} onChange={(e) => setNewQ({ ...newQ, text: e.target.value })} rows={2} placeholder="Enter the question text in English..." className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-ap-blue resize-none" /></div>
                        <div><label className="block text-sm text-gray-700 mb-1 font-medium">Question Text (Hindi)</label><textarea value={newQ.textHindi} onChange={(e) => setNewQ({ ...newQ, textHindi: e.target.value })} rows={2} placeholder="Enter the question text in Hindi..." className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-ap-blue resize-none" /></div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div><label className="block text-sm text-gray-700 mb-1 font-medium">Stage</label><select value={newQ.level} onChange={(e) => setNewQ({ ...newQ, level: e.target.value })} className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-ap-blue">{LEVELS.map((l) => <option key={l} value={l}>{STAGE_LABELS[l]}</option>)}</select></div>
                            <div><label className="block text-sm text-gray-700 mb-1 font-medium">Employee Category</label><select value={newQ.collarType} onChange={(e) => setNewQ({ ...newQ, collarType: e.target.value })} className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-ap-blue">{COLLAR_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select></div>
                            <div><label className="block text-sm text-gray-700 mb-1 font-medium">Category</label><select value={newQ.category} onChange={(e) => setNewQ({ ...newQ, category: e.target.value })} className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-ap-blue">{CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={addQuestion} className="px-6 py-2.5 bg-ap-blue hover:bg-ap-green text-white font-semibold rounded-lg cursor-pointer transition-all shadow-sm">Save Question</button>
                            <button onClick={() => setShowAddForm(false)} className="px-4 py-2.5 bg-gray-50 border border-gray-300 text-gray-700 hover:text-ap-blue hover:bg-white rounded-lg cursor-pointer transition-colors">Cancel</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Filter Bar */}
            <div className="bg-white border border-ap-border shadow-card rounded-card p-3 sm:p-4 space-y-2 sm:space-y-0 sm:flex sm:flex-wrap sm:items-end sm:gap-3">
                <div className="w-full sm:flex-1 sm:min-w-[200px]">
                    <label className="block text-xs text-gray-700 mb-1 font-medium">Search</label>
                    <SearchInput value={qFilter.search} onChange={(v) => setQFilter((p) => ({ ...p, search: v }))} placeholder="Search questions..." />
                </div>
                <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-3">
                    <div>
                        <label className="block text-xs text-gray-700 mb-1 font-medium">Stage</label>
                        <select value={qFilter.level} onChange={(e) => setQFilter({ ...qFilter, level: e.target.value })} className="w-full sm:w-auto px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-ap-blue sm:min-w-[150px]">
                            <option value="">All Stages</option>
                            {LEVELS.map((l) => <option key={l} value={l}>{STAGE_LABELS[l]}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs text-gray-700 mb-1 font-medium">Employee Category</label>
                        <select value={qFilter.collar} onChange={(e) => setQFilter({ ...qFilter, collar: e.target.value })} className="w-full sm:w-auto px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-ap-blue sm:min-w-[150px]">
                            <option value="">All Categories</option>
                            {COLLAR_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs text-gray-700 mb-1 font-medium">Topic</label>
                        <select value={qFilter.category} onChange={(e) => setQFilter({ ...qFilter, category: e.target.value })} className="w-full sm:w-auto px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-ap-blue sm:min-w-[150px]">
                            <option value="">All Topics</option>
                            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>
                </div>
                {(qFilter.search || qFilter.level || qFilter.category || qFilter.collar) && (
                    <button onClick={() => setQFilter({ level: "", category: "", collar: "", search: "" })} className="w-full sm:w-auto px-3 py-2 bg-gray-50 hover:bg-white border border-ap-border text-gray-700 rounded-lg text-sm cursor-pointer transition-colors">Clear</button>
                )}
            </div>

            <p className="text-xs text-gray-500">{filteredQuestions.length} question{filteredQuestions.length !== 1 ? "s" : ""} shown</p>

            {/* Grouped Questions */}
            {groupedByLevel.map(({ level, questions: levelQs }) => {
                const byCategory = {};
                levelQs.forEach((q) => { if (!byCategory[q.category]) byCategory[q.category] = []; byCategory[q.category].push(q); });
                return (
                    <div key={level} className="space-y-3">
                        <h3 className="text-lg font-bold text-ap-blue flex items-center gap-2">
                            <span className="text-xs px-2.5 py-1 rounded-full bg-[#E8EAF6] text-[#3F51B5] border border-[#C5CAE9] font-semibold">{STAGE_LABELS[level]}</span>
                            <span className="text-sm text-gray-700 font-normal">{levelQs.length} question{levelQs.length !== 1 ? "s" : ""}</span>
                        </h3>
                        {Object.entries(byCategory).map(([cat, catQs]) => (
                            <div key={cat} className="bg-white border border-ap-border rounded-card overflow-hidden shadow-card">
                                <div className="px-4 py-2.5 border-b border-ap-border flex items-center justify-between bg-gray-50">
                                    <span className="text-xs font-semibold text-ap-blue uppercase tracking-wider">{cat}</span>
                                    <span className="text-xs text-gray-700">{catQs.length}</span>
                                </div>
                                <div className="divide-y divide-ap-border">
                                    {catQs.map((q) => (
                                        <div key={q.id} className="px-3 sm:px-4 py-3 hover:bg-gray-50 transition-colors group">
                                            {editingQ?.id === q.id ? (
                                                <div className="space-y-2">
                                                    <textarea value={editingQ.text} onChange={(e) => setEditingQ({ ...editingQ, text: e.target.value })} rows={2} placeholder="English text" className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-ap-blue resize-none" />
                                                    <textarea value={editingQ.textHindi || ""} onChange={(e) => setEditingQ({ ...editingQ, textHindi: e.target.value })} rows={2} placeholder="Hindi text" className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-ap-blue resize-none" />
                                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                                        <select value={editingQ.level} onChange={(e) => setEditingQ({ ...editingQ, level: e.target.value })} className="px-2 py-1.5 bg-white border border-gray-300 rounded-lg text-gray-900 text-xs">{LEVELS.map((l) => <option key={l} value={l}>{STAGE_LABELS[l]}</option>)}</select>
                                                        <select value={editingQ.collarType} onChange={(e) => setEditingQ({ ...editingQ, collarType: e.target.value })} className="px-2 py-1.5 bg-white border border-gray-300 rounded-lg text-gray-900 text-xs">{COLLAR_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select>
                                                        <select value={editingQ.category} onChange={(e) => setEditingQ({ ...editingQ, category: e.target.value })} className="px-2 py-1.5 bg-white border border-gray-300 rounded-lg text-gray-900 text-xs">{CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <button onClick={saveEditQuestion} className="min-h-[40px] px-3 py-1.5 bg-ap-blue hover:bg-ap-green text-white text-[13px] sm:text-[14px] font-bold rounded-lg cursor-pointer transition-colors shadow-sm">Save</button>
                                                        <button onClick={() => setEditingQ(null)} className="min-h-[40px] px-3 py-1.5 bg-white border border-gray-300 text-gray-700 font-bold text-[13px] sm:text-[14px] rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">Cancel</button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                                                    <div className={`flex-1 ${q.isActive ? "" : "opacity-50"}`}>
                                                        <div className="flex items-start gap-2">
                                                            <span className={`mt-0.5 shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border ${COLLAR_BADGE[collarOf(q)].cls}`} title={`Applies to: ${COLLAR_BADGE[collarOf(q)].label}`}>{COLLAR_BADGE[collarOf(q)].label}</span>
                                                            <div>
                                                                <p className={`text-[13px] sm:text-sm tracking-tight ${q.isActive ? "text-gray-900" : "text-gray-400 line-through"}`}>{q.text}</p>
                                                                {q.textHindi && <p className="text-[12px] sm:text-[13px] text-gray-500 italic mt-0.5">{q.textHindi}</p>}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                                                        <button onClick={() => setEditingQ({ id: q.id, text: q.text, textHindi: q.textHindi || "", category: q.category, level: q.level, collarType: collarOf(q) })} className="min-h-[36px] sm:min-h-[40px] px-2.5 sm:px-3 py-1.5 bg-gray-50 font-bold border border-ap-border text-gray-700 hover:text-ap-blue rounded-md cursor-pointer transition-colors text-[12px] sm:text-[13px]">Edit</button>
                                                        <button onClick={() => setDeleteQ(q)} className="min-h-[36px] sm:min-h-[40px] px-2.5 sm:px-3 py-1.5 bg-gray-50 font-bold border border-ap-border text-gray-700 hover:text-[#D32F2F] rounded-md cursor-pointer transition-colors text-[12px] sm:text-[13px]">Delete</button>
                                                        <button onClick={() => toggleQuestion(q.id)} className={`min-h-[36px] sm:min-h-[40px] text-[12px] sm:text-[13px] font-bold px-2.5 sm:px-3 py-1.5 rounded-lg border transition-colors cursor-pointer shrink-0 shadow-sm ${q.isActive ? "bg-ap-green text-white border-[#A5D6A7]" : "bg-gray-300 text-gray-700 border-[#EF9A9A]"}`}>{q.isActive ? "Active" : "Off"}</button>
                                                        <button onClick={() => toggleInclude(q)} title="Whether this question is locked into a quarter started in Manual mode" className={`min-h-[36px] sm:min-h-[40px] text-[12px] sm:text-[13px] font-bold px-2.5 sm:px-3 py-1.5 rounded-lg border transition-colors cursor-pointer shrink-0 shadow-sm ${q.includedInQuarter ? "bg-ap-blue text-white border-[#90CAF9]" : "bg-white text-gray-500 border-gray-300"}`}>{q.includedInQuarter ? "In quarter" : "Excluded"}</button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                );
            })}
            {filteredQuestions.length === 0 && <div className="bg-white border border-ap-border shadow-card rounded-card p-8 text-center text-gray-700">No questions match your filters.</div>}

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
