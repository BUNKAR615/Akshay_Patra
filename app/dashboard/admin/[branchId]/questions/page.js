"use client";

import { useState, useEffect } from "react";

async function api(url, opts) {
    const res = await fetch(url, opts);
    const json = await res.json();
    if (!res.ok) {
        if (res.status === 401) { window.location.replace("/login"); return new Promise(() => {}); }
        throw new Error(json.message || "Request failed");
    }
    if (!json.success) throw new Error(json.message || "Request failed");
    return json.data;
}

const LEVELS = ["SELF", "BRANCH_MANAGER", "CLUSTER_MANAGER"];
const LEVEL_LABELS = { SELF: "Self Assessment", BRANCH_MANAGER: "Branch Manager", CLUSTER_MANAGER: "Cluster Manager" };
const CATEGORIES = ["WORK_QUALITY", "BEHAVIOR", "PUNCTUALITY", "TEAMWORK", "INITIATIVE"];

export default function BranchQuestionsPage() {
    const [questions, setQuestions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [msg, setMsg] = useState({ text: "", type: "" });

    // Filters
    const [levelFilter, setLevelFilter] = useState("");
    const [categoryFilter, setCategoryFilter] = useState("");
    const [search, setSearch] = useState("");

    // Add form
    const [showAdd, setShowAdd] = useState(false);
    const [form, setForm] = useState({ text: "", textHindi: "", category: "WORK_QUALITY", level: "SELF" });
    const [saving, setSaving] = useState(false);

    // Edit state
    const [editId, setEditId] = useState(null);
    const [editForm, setEditForm] = useState({ text: "", textHindi: "", category: "", level: "" });

    const fetchQuestions = async () => {
        try {
            const data = await api("/api/admin/questions");
            // Only show Self/BM/CM levels
            const filtered = (data.questions || []).filter(q => LEVELS.includes(q.level));
            setQuestions(filtered);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchQuestions(); }, []);

    const handleAdd = async () => {
        if (!form.text.trim()) { setMsg({ text: "Question text is required", type: "error" }); return; }
        setSaving(true);
        try {
            await api("/api/admin/questions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(form),
            });
            setForm({ text: "", textHindi: "", category: "WORK_QUALITY", level: "SELF" });
            setShowAdd(false);
            setMsg({ text: "Question added!", type: "success" });
            fetchQuestions();
        } catch (e) {
            setMsg({ text: e.message, type: "error" });
        } finally {
            setSaving(false);
        }
    };

    const handleUpdate = async (id) => {
        setSaving(true);
        try {
            await api(`/api/admin/questions/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(editForm),
            });
            setEditId(null);
            setMsg({ text: "Question updated!", type: "success" });
            fetchQuestions();
        } catch (e) {
            setMsg({ text: e.message, type: "error" });
        } finally {
            setSaving(false);
        }
    };

    const handleToggle = async (id, isActive) => {
        try {
            await api(`/api/admin/questions/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ isActive: !isActive }),
            });
            fetchQuestions();
        } catch (e) {
            setMsg({ text: e.message, type: "error" });
        }
    };

    const filtered = questions.filter(q => {
        if (levelFilter && q.level !== levelFilter) return false;
        if (categoryFilter && q.category !== categoryFilter) return false;
        if (search) {
            const s = search.toLowerCase();
            if (!q.text?.toLowerCase().includes(s) && !q.textHindi?.toLowerCase().includes(s)) return false;
        }
        return true;
    });

    // Group by level
    const grouped = {};
    LEVELS.forEach(l => { grouped[l] = filtered.filter(q => q.level === l); });

    if (loading) return <div className="text-center py-12 text-gray-500">Loading questions...</div>;
    if (error) return <div className="p-4 bg-red-50 text-red-700 rounded-lg font-medium">{error}</div>;

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-[#003087]">Question Bank ({filtered.length})</h2>
                <button
                    onClick={() => setShowAdd(!showAdd)}
                    className="px-4 py-2 bg-[#003087] text-white rounded-lg text-sm font-bold hover:bg-[#002266] cursor-pointer"
                >
                    {showAdd ? "Cancel" : "+ Add Question"}
                </button>
            </div>

            {msg.text && (
                <div className={`p-3 rounded-lg text-sm font-medium ${msg.type === "error" ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>
                    {msg.text}
                </div>
            )}

            {/* Add form */}
            {showAdd && (
                <div className="bg-white border border-[#E0E0E0] rounded-xl p-4 space-y-3">
                    <textarea value={form.text} onChange={e => setForm(p => ({ ...p, text: e.target.value }))} placeholder="Question text (English)" className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} />
                    <textarea value={form.textHindi} onChange={e => setForm(p => ({ ...p, textHindi: e.target.value }))} placeholder="Question text (Hindi - optional)" className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} />
                    <div className="grid grid-cols-3 gap-2">
                        <select value={form.level} onChange={e => setForm(p => ({ ...p, level: e.target.value }))} className="border rounded-lg px-3 py-2 text-sm">
                            {LEVELS.map(l => <option key={l} value={l}>{LEVEL_LABELS[l]}</option>)}
                        </select>
                        <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} className="border rounded-lg px-3 py-2 text-sm">
                            {CATEGORIES.map(c => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
                        </select>
                        <button onClick={handleAdd} disabled={saving} className="bg-[#003087] text-white rounded-lg px-4 py-2 text-sm font-bold hover:bg-[#002266] cursor-pointer disabled:opacity-50">
                            {saving ? "Saving..." : "Add Question"}
                        </button>
                    </div>
                </div>
            )}

            {/* Filters */}
            <div className="flex flex-wrap gap-2">
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search questions..." className="border rounded-lg px-3 py-2 text-sm flex-1 min-w-[200px]" />
                <select value={levelFilter} onChange={e => setLevelFilter(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
                    <option value="">All Levels</option>
                    {LEVELS.map(l => <option key={l} value={l}>{LEVEL_LABELS[l]}</option>)}
                </select>
                <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
                    <option value="">All Categories</option>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
                </select>
                {(levelFilter || categoryFilter || search) && (
                    <button onClick={() => { setLevelFilter(""); setCategoryFilter(""); setSearch(""); }} className="text-xs text-[#003087] font-bold cursor-pointer hover:underline px-2">
                        Clear
                    </button>
                )}
            </div>

            {/* Questions grouped by level */}
            {LEVELS.map(level => {
                const qs = grouped[level];
                if (qs.length === 0 && levelFilter && levelFilter !== level) return null;
                return (
                    <div key={level} className="bg-white border border-[#E0E0E0] rounded-xl p-4">
                        <h3 className="text-[14px] font-bold text-[#003087] mb-3 flex items-center justify-between">
                            <span>{LEVEL_LABELS[level]}</span>
                            <span className="text-[12px] text-[#999] font-medium">{qs.length} questions</span>
                        </h3>
                        {qs.length > 0 ? (
                            <div className="space-y-2">
                                {qs.map((q, i) => (
                                    <div key={q.id} className={`rounded-lg px-3 py-2 text-sm ${q.isActive ? "bg-[#F9FAFB]" : "bg-red-50 opacity-60"}`}>
                                        {editId === q.id ? (
                                            <div className="space-y-2">
                                                <textarea value={editForm.text} onChange={e => setEditForm(p => ({ ...p, text: e.target.value }))} className="w-full border rounded px-2 py-1 text-sm" rows={2} />
                                                <textarea value={editForm.textHindi} onChange={e => setEditForm(p => ({ ...p, textHindi: e.target.value }))} placeholder="Hindi" className="w-full border rounded px-2 py-1 text-sm" rows={2} />
                                                <div className="flex gap-2">
                                                    <select value={editForm.category} onChange={e => setEditForm(p => ({ ...p, category: e.target.value }))} className="border rounded px-2 py-1 text-xs">
                                                        {CATEGORIES.map(c => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
                                                    </select>
                                                    <button onClick={() => handleUpdate(q.id)} className="text-xs px-3 py-1 bg-[#003087] text-white rounded cursor-pointer font-bold">Save</button>
                                                    <button onClick={() => setEditId(null)} className="text-xs px-3 py-1 bg-gray-200 rounded cursor-pointer font-bold">Cancel</button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="flex-1">
                                                    <span className="text-[#333]">{i + 1}. {q.text}</span>
                                                    {q.textHindi && <span className="block text-[12px] text-[#666] mt-0.5">{q.textHindi}</span>}
                                                    <span className="inline-block mt-1 px-1.5 py-0.5 bg-gray-100 text-[9px] text-gray-500 rounded font-bold">{q.category?.replace(/_/g, " ")}</span>
                                                </div>
                                                <div className="flex items-center gap-1 shrink-0">
                                                    <button
                                                        onClick={() => { setEditId(q.id); setEditForm({ text: q.text, textHindi: q.textHindi || "", category: q.category, level: q.level }); }}
                                                        className="text-[10px] px-2 py-0.5 bg-gray-100 rounded hover:bg-gray-200 cursor-pointer"
                                                    >
                                                        Edit
                                                    </button>
                                                    <button
                                                        onClick={() => handleToggle(q.id, q.isActive)}
                                                        className={`text-[10px] px-2 py-0.5 rounded cursor-pointer ${q.isActive ? "bg-red-50 text-red-600 hover:bg-red-100" : "bg-green-50 text-green-600 hover:bg-green-100"}`}
                                                    >
                                                        {q.isActive ? "Disable" : "Enable"}
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-gray-500 text-center py-2">No questions at this level</p>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
