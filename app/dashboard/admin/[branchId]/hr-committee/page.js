"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";

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

function AssignmentSection({ title, color, assignments, onAssign, onRemove, form, setForm, assigning }) {
    return (
        <div className="bg-white border border-[#E0E0E0] rounded-xl p-5">
            <h3 className={`text-[16px] font-bold ${color} mb-4`}>{title}</h3>

            {/* Add form */}
            <div className="bg-[#F9FAFB] rounded-lg p-4 mb-4 space-y-3">
                <p className="text-[12px] font-bold text-[#999] uppercase tracking-wider">Assign New</p>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                    <input value={form.empCode} onChange={e => setForm(p => ({ ...p, empCode: e.target.value }))} placeholder="Emp Code" className="border rounded-lg px-3 py-2 text-sm" />
                    <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Name (if new)" className="border rounded-lg px-3 py-2 text-sm" />
                    <input value={form.mobile} onChange={e => setForm(p => ({ ...p, mobile: e.target.value }))} placeholder="Mobile (optional)" className="border rounded-lg px-3 py-2 text-sm" />
                    <button
                        onClick={onAssign}
                        disabled={assigning}
                        className="bg-[#003087] text-white rounded-lg px-4 py-2 text-sm font-bold hover:bg-[#002266] cursor-pointer disabled:opacity-50"
                    >
                        {assigning ? "Assigning..." : "Assign"}
                    </button>
                </div>
                <p className="text-[10px] text-gray-400">If emp code doesn't exist, a new user will be created with the given name.</p>
            </div>

            {/* Existing assignments */}
            {assignments.length > 0 ? (
                <div className="space-y-2">
                    {assignments.map(a => {
                        const user = a.hr || a.member;
                        return (
                            <div key={a.id} className="flex items-center justify-between bg-[#F9FAFB] rounded-lg px-4 py-3">
                                <div className="flex items-center gap-3">
                                    <div className={`w-8 h-8 rounded-full ${color.replace("text-", "bg-").replace("700", "500")} text-white flex items-center justify-center text-xs font-bold`}>
                                        {user?.name?.charAt(0) || "?"}
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-[#333]">{user?.name}</p>
                                        <p className="text-[10px] text-gray-500">{user?.empCode} &bull; {user?.mobile || "No mobile"}</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => onRemove(user?.id)}
                                    className="text-[11px] px-2 py-1 bg-red-50 text-red-600 rounded hover:bg-red-100 cursor-pointer font-bold"
                                >
                                    Remove
                                </button>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <p className="text-sm text-gray-500 text-center py-4">No assignments yet</p>
            )}
        </div>
    );
}

export default function HrCommitteePage() {
    const { branchId } = useParams();
    const [hrAssignments, setHrAssignments] = useState([]);
    const [committeeAssignments, setCommitteeAssignments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [msg, setMsg] = useState({ text: "", type: "" });
    const [hrForm, setHrForm] = useState({ empCode: "", name: "", mobile: "" });
    const [committeeForm, setCommitteeForm] = useState({ empCode: "", name: "", mobile: "" });
    const [assigning, setAssigning] = useState(false);

    const fetchAll = async () => {
        try {
            const [hr, committee] = await Promise.all([
                api(`/api/admin/branches/${branchId}/hr-assign`),
                api(`/api/admin/branches/${branchId}/committee-assign`),
            ]);
            setHrAssignments(hr.assignments || []);
            setCommitteeAssignments(committee.assignments || []);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchAll(); }, [branchId]);

    const assignHr = async () => {
        if (!hrForm.empCode.trim()) { setMsg({ text: "Emp Code is required", type: "error" }); return; }
        setAssigning(true);
        setMsg({ text: "", type: "" });
        try {
            await api(`/api/admin/branches/${branchId}/hr-assign`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(hrForm),
            });
            setHrForm({ empCode: "", name: "", mobile: "" });
            setMsg({ text: "HR assigned successfully!", type: "success" });
            fetchAll();
        } catch (e) {
            setMsg({ text: e.message, type: "error" });
        } finally {
            setAssigning(false);
        }
    };

    const removeHr = async (hrUserId) => {
        try {
            await api(`/api/admin/branches/${branchId}/hr-assign?hrUserId=${hrUserId}`, { method: "DELETE" });
            setMsg({ text: "HR removed", type: "success" });
            fetchAll();
        } catch (e) {
            setMsg({ text: e.message, type: "error" });
        }
    };

    const assignCommittee = async () => {
        if (!committeeForm.empCode.trim()) { setMsg({ text: "Emp Code is required", type: "error" }); return; }
        setAssigning(true);
        setMsg({ text: "", type: "" });
        try {
            await api(`/api/admin/branches/${branchId}/committee-assign`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(committeeForm),
            });
            setCommitteeForm({ empCode: "", name: "", mobile: "" });
            setMsg({ text: "Committee member assigned successfully!", type: "success" });
            fetchAll();
        } catch (e) {
            setMsg({ text: e.message, type: "error" });
        } finally {
            setAssigning(false);
        }
    };

    const removeCommittee = async (memberUserId) => {
        try {
            await api(`/api/admin/branches/${branchId}/committee-assign?memberUserId=${memberUserId}`, { method: "DELETE" });
            setMsg({ text: "Committee member removed", type: "success" });
            fetchAll();
        } catch (e) {
            setMsg({ text: e.message, type: "error" });
        }
    };

    if (loading) return <div className="text-center py-12 text-gray-500">Loading assignments...</div>;
    if (error) return <div className="p-4 bg-red-50 text-red-700 rounded-lg font-medium">{error}</div>;

    return (
        <div className="space-y-6">
            <h2 className="text-lg font-bold text-[#003087]">HR & Committee Assignments</h2>

            {msg.text && (
                <div className={`p-3 rounded-lg text-sm font-medium ${msg.type === "error" ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>
                    {msg.text}
                </div>
            )}

            <AssignmentSection
                title="HR Assignments"
                color="text-sky-700"
                assignments={hrAssignments}
                onAssign={assignHr}
                onRemove={removeHr}
                form={hrForm}
                setForm={setHrForm}
                assigning={assigning}
            />

            <AssignmentSection
                title="Committee Assignments"
                color="text-amber-700"
                assignments={committeeAssignments}
                onAssign={assignCommittee}
                onRemove={removeCommittee}
                form={committeeForm}
                setForm={setCommitteeForm}
                assigning={assigning}
            />
        </div>
    );
}
