"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";

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

export default function BranchDepartmentsPage() {
    const { branchId } = useParams();
    const router = useRouter();
    const [departments, setDepartments] = useState([]);
    const [branch, setBranch] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [msg, setMsg] = useState({ text: "", type: "" });

    // Inline rename state
    const [editId, setEditId] = useState(null);
    const [editName, setEditName] = useState("");

    // Add-department state
    const [newName, setNewName] = useState("");
    const [adding, setAdding] = useState(false);
    const [deletingId, setDeletingId] = useState(null);

    const fetchDepts = async () => {
        try {
            const data = await api(`/api/admin/branches/${branchId}/departments`);
            setDepartments(data.departments || []);
            setBranch(data.branch);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchDepts(); }, [branchId]);

    const handleAdd = async () => {
        const name = newName.trim();
        if (!name) return;
        setMsg({ text: "", type: "" });
        setAdding(true);
        try {
            await api(`/api/admin/branches/${branchId}/departments`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name }),
            });
            setMsg({ text: `Department "${name}" added to this branch.`, type: "success" });
            setNewName("");
            fetchDepts();
        } catch (e) {
            setMsg({ text: e.message, type: "error" });
        } finally {
            setAdding(false);
        }
    };

    const handleDelete = async (dept) => {
        if (!window.confirm(`Delete "${dept.name}" from this branch? This cannot be undone.`)) return;
        setMsg({ text: "", type: "" });
        setDeletingId(dept.id);
        try {
            await api(`/api/admin/branches/${branchId}/departments/${dept.id}`, { method: "DELETE" });
            setMsg({ text: `Department "${dept.name}" deleted from this branch.`, type: "success" });
            fetchDepts();
        } catch (e) {
            setMsg({ text: e.message, type: "error" });
        } finally {
            setDeletingId(null);
        }
    };

    const handleRename = async (deptId) => {
        if (!editName.trim()) return;
        setMsg({ text: "", type: "" });
        try {
            await api(`/api/admin/branches/${branchId}/departments/${deptId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: editName.trim() }),
            });
            setMsg({ text: "Department renamed successfully!", type: "success" });
            setEditId(null);
            fetchDepts();
        } catch (e) {
            setMsg({ text: e.message, type: "error" });
        }
    };

    // Collapse departments that render as the same name (trailing/secondary
    // whitespace or case differences) into one row so each appears once.
    // Employee counts are summed; the id of the variant with the most
    // employees is kept so click-through and rename hit the populated one.
    const dedupedDepartments = useMemo(() => {
        const groups = new Map();
        for (const d of departments) {
            const display = (d.name || "").trim().replace(/\s+/g, " ");
            const key = display.toLowerCase();
            const count = d.employeeCount || 0;
            const existing = groups.get(key);
            if (!existing) {
                groups.set(key, { id: d.id, name: display, employeeCount: count, canonicalCount: count });
            } else {
                existing.employeeCount += count;
                if (count > existing.canonicalCount) {
                    existing.canonicalCount = count;
                    existing.id = d.id;
                }
            }
        }
        return [...groups.values()];
    }, [departments]);

    if (loading) return <div className="text-center py-12 text-gray-500">Loading departments...</div>;
    if (error) return <div className="p-4 bg-red-50 text-red-700 rounded-lg font-medium">{error}</div>;

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-[#003087]">Departments ({dedupedDepartments.length})</h2>
                <button onClick={fetchDepts} className="px-3 py-1.5 bg-white border border-[#CCCCCC] rounded-lg text-xs font-bold text-[#333] hover:bg-[#F5F5F5] cursor-pointer">
                    Refresh
                </button>
            </div>

            {msg.text && (
                <div className={`p-3 rounded-lg text-sm font-medium ${msg.type === "error" ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>
                    {msg.text}
                </div>
            )}

            <div className="bg-white border border-[#E0E0E0] rounded-xl p-4">
                <label className="block text-xs font-bold text-[#666] mb-1.5">Add a department to {branch?.name || "this branch"}</label>
                <div className="flex items-center gap-2">
                    <input
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") handleAdd(); }}
                        placeholder="e.g. Procurement"
                        className="flex-1 border border-[#CCCCCC] rounded-lg px-3 py-2 text-sm"
                    />
                    <button
                        onClick={handleAdd}
                        disabled={adding || !newName.trim()}
                        className="px-4 py-2 bg-[#003087] text-white text-xs font-bold rounded-lg hover:bg-[#002266] cursor-pointer disabled:opacity-50"
                    >
                        {adding ? "Adding..." : "Add Department"}
                    </button>
                </div>
                <p className="text-[11px] text-[#888] mt-1.5">Only added to this branch. The same name can exist independently in other branches.</p>
            </div>

            <div className="grid gap-3">
                {dedupedDepartments.map(dept => {
                    const isEditing = editId === dept.id;
                    const openDept = () => router.push(`/dashboard/admin/${branchId}/employees?departmentId=${dept.id}&departmentName=${encodeURIComponent(dept.name)}`);
                    return (
                        <div
                            key={dept.id}
                            role={isEditing ? undefined : "button"}
                            tabIndex={isEditing ? -1 : 0}
                            onClick={isEditing ? undefined : openDept}
                            onKeyDown={isEditing ? undefined : (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openDept(); } }}
                            className={`bg-white border border-[#E0E0E0] rounded-xl p-4 ${isEditing ? "" : "hover:border-[#003087] hover:shadow-sm cursor-pointer transition-colors"}`}
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    {isEditing ? (
                                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                            <input
                                                value={editName}
                                                onChange={e => setEditName(e.target.value)}
                                                className="border rounded-lg px-3 py-1.5 text-sm w-48"
                                                autoFocus
                                                onKeyDown={e => e.key === "Enter" && handleRename(dept.id)}
                                            />
                                            <button onClick={() => handleRename(dept.id)} className="px-3 py-1.5 bg-[#003087] text-white text-xs font-bold rounded-lg cursor-pointer">Save</button>
                                            <button onClick={() => setEditId(null)} className="px-3 py-1.5 bg-gray-200 text-xs font-bold rounded-lg cursor-pointer">Cancel</button>
                                        </div>
                                    ) : (
                                        <>
                                            <h4 className="font-bold text-[#003087]">{dept.name}</h4>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setEditId(dept.id); setEditName(dept.name); }}
                                                className="text-[10px] px-2 py-0.5 bg-gray-100 text-gray-600 rounded hover:bg-gray-200 cursor-pointer"
                                            >
                                                Rename
                                            </button>
                                        </>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-[12px] text-[#666] font-medium">{dept.employeeCount} employees</span>
                                    {!isEditing && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleDelete(dept); }}
                                            disabled={deletingId === dept.id}
                                            title={dept.employeeCount > 0 ? "Remove its employees first" : "Delete from this branch"}
                                            className="text-[10px] px-2 py-0.5 bg-red-50 text-red-600 rounded hover:bg-red-100 cursor-pointer disabled:opacity-50"
                                        >
                                            {deletingId === dept.id ? "Deleting..." : "Delete"}
                                        </button>
                                    )}
                                    {!isEditing && <span className="text-[#999] text-sm" aria-hidden="true">›</span>}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {dedupedDepartments.length === 0 && (
                <div className="bg-[#F5F5F5] border border-[#E0E0E0] rounded-xl p-8 text-center">
                    <h3 className="font-bold text-[#333] mb-1">No Departments</h3>
                    <p className="text-sm text-[#666]">Add a department above, or they appear here after employees are uploaded to this branch.</p>
                </div>
            )}
        </div>
    );
}
