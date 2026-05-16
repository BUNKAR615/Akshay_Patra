"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";

async function api(url, opts) {
    const res = await fetch(url, opts);
    const json = await res.json();
    if (!res.ok) {
        if (res.status === 401) { window.location.replace("/login"); return new Promise(() => {}); }
        const err = new Error(json.message || "Request failed");
        err.status = res.status;
        throw err;
    }
    if (!json.success) throw new Error(json.message || "Request failed");
    return json.data;
}

function AssignmentSection({ title, color, bgColor, borderColor, avatarBg, mode = "multi", assignments, onAssign, onRemove, form, setForm, assigning, emptyHint, note }) {
    const isSingle = mode === "single";
    const occupied = isSingle && assignments.length > 0;

    return (
        <div className="bg-white border border-[#E0E0E0] rounded-xl p-5">
            <h3 className={`text-[15px] font-bold ${color} ${note ? "mb-1" : "mb-4"} uppercase tracking-wide`}>{title}</h3>
            {note && <p className="text-[12px] text-gray-500 mb-4">{note}</p>}

            {occupied ? (
                <div className="space-y-3">
                    {assignments.map(a => {
                        const u = a.bm || a.cm || a.hr || a.member;
                        return (
                            <div key={a.id} className={`flex items-center justify-between ${bgColor} border ${borderColor} rounded-xl px-5 py-4`}>
                                <div className="flex items-center gap-4">
                                    <div className={`w-12 h-12 rounded-full ${avatarBg} text-white flex items-center justify-center text-lg font-bold shrink-0`}>
                                        {u?.name?.charAt(0) || "?"}
                                    </div>
                                    <div className="space-y-0.5">
                                        <p className="text-base font-bold text-[#1A1A2E]">{u?.name}</p>
                                        <p className="text-sm text-gray-600">
                                            <span className="font-medium">Employee ID:</span> {u?.empCode || "—"}
                                        </p>
                                        <p className="text-sm text-gray-600">
                                            <span className="font-medium">Mobile:</span> {u?.mobile || "Not provided"}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => onRemove(u?.id)}
                                    className="text-sm px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 cursor-pointer font-bold border border-red-200 shrink-0"
                                >
                                    Remove
                                </button>
                            </div>
                        );
                    })}
                    <p className="text-xs text-gray-400 italic mt-1">
                        Only one {title} is allowed per branch. Remove the current assignment before adding a new one.
                    </p>
                </div>
            ) : (
                <>
                    <div className="bg-[#F9FAFB] rounded-lg p-4 mb-4 space-y-3">
                        <p className="text-[11px] font-bold text-[#999] uppercase tracking-wider">Assign New</p>
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
                        <p className="text-[10px] text-gray-400">If emp code doesn&apos;t exist, a new user will be created with the given name.</p>
                    </div>

                    {!isSingle && assignments.length > 0 ? (
                        <div className="space-y-3">
                            {assignments.map(a => {
                                const user = a.hr || a.member || a.cm || a.bm;
                                return (
                                    <div key={a.id} className={`flex items-center justify-between ${bgColor} border ${borderColor} rounded-xl px-5 py-4`}>
                                        <div className="flex items-center gap-4">
                                            <div className={`w-12 h-12 rounded-full ${avatarBg} text-white flex items-center justify-center text-lg font-bold shrink-0`}>
                                                {user?.name?.charAt(0) || "?"}
                                            </div>
                                            <div className="space-y-0.5">
                                                <p className="text-base font-bold text-[#1A1A2E]">{user?.name}</p>
                                                <p className="text-sm text-gray-600">
                                                    <span className="font-medium">Employee ID:</span> {user?.empCode || "—"}
                                                </p>
                                                <p className="text-sm text-gray-600">
                                                    <span className="font-medium">Mobile:</span> {user?.mobile || "Not provided"}
                                                </p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => onRemove(user?.id)}
                                            className="text-sm px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 cursor-pointer font-bold border border-red-200 shrink-0"
                                        >
                                            Remove
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    ) : !isSingle && (
                        <p className="text-sm text-gray-500 text-center py-4">{emptyHint || "No assignments yet"}</p>
                    )}
                </>
            )}
        </div>
    );
}

export default function BranchOrgPage() {
    const { branchId } = useParams();

    // Assignment state
    const [bmAssignment, setBmAssignment] = useState(null);
    const [hrAssignments, setHrAssignments] = useState([]);
    const [committeeAssignments, setCommitteeAssignments] = useState([]);
    const [cmAssignments, setCmAssignments] = useState([]);

    // Read-only org data
    const [hods, setHods] = useState([]);
    const [departments, setDepartments] = useState([]);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [msg, setMsg] = useState({ text: "", type: "" });

    // Forms
    const [bmForm, setBmForm] = useState({ empCode: "", name: "", mobile: "" });
    const [hrForm, setHrForm] = useState({ empCode: "", name: "", mobile: "" });
    const [committeeForm, setCommitteeForm] = useState({ empCode: "", name: "", mobile: "" });
    const [cmForm, setCmForm] = useState({ empCode: "", name: "", mobile: "" });
    const [assigning, setAssigning] = useState(false);

    const fetchAll = async () => {
        try {
            const [bm, hr, committee, cm, empData, deptData] = await Promise.all([
                api(`/api/admin/branches/${branchId}/bm-assign`),
                api(`/api/admin/branches/${branchId}/hr-assign`),
                api(`/api/admin/branches/${branchId}/committee-assign`),
                api(`/api/admin/branches/${branchId}/cm-assign`),
                api(`/api/admin/branches/${branchId}/employees`),
                api(`/api/admin/branches/${branchId}/departments`),
            ]);
            setBmAssignment(bm.assignment || null);
            setHrAssignments(hr.assignments || []);
            setCommitteeAssignments(committee.assignments || []);
            setCmAssignments(cm.assignments || []);
            const employees = empData.employees || [];
            setHods(employees.filter(e => e.role === "HOD"));
            setDepartments(deptData.departments || []);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchAll(); }, [branchId]);

    const assignBm = async () => {
        if (!bmForm.empCode.trim()) { setMsg({ text: "Emp Code is required", type: "error" }); return; }
        setAssigning(true); setMsg({ text: "", type: "" });
        try {
            await api(`/api/admin/branches/${branchId}/bm-assign`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(bmForm) });
            setBmForm({ empCode: "", name: "", mobile: "" });
            setMsg({ text: "Branch Manager assigned successfully!", type: "success" });
            fetchAll();
        } catch (e) { setMsg({ text: e.message, type: "error" }); }
        finally { setAssigning(false); }
    };

    const removeBm = async () => {
        try {
            await api(`/api/admin/branches/${branchId}/bm-assign`, { method: "DELETE" });
            setMsg({ text: "Branch Manager removed", type: "success" });
            fetchAll();
        } catch (e) { setMsg({ text: e.message, type: "error" }); }
    };

    const assignHr = async () => {
        if (!hrForm.empCode.trim()) { setMsg({ text: "Emp Code is required", type: "error" }); return; }
        setAssigning(true); setMsg({ text: "", type: "" });
        try {
            await api(`/api/admin/branches/${branchId}/hr-assign`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(hrForm) });
            setHrForm({ empCode: "", name: "", mobile: "" });
            setMsg({ text: "HR assigned successfully!", type: "success" });
            fetchAll();
        } catch (e) { setMsg({ text: e.message, type: "error" }); }
        finally { setAssigning(false); }
    };

    const removeHr = async (hrUserId) => {
        try {
            await api(`/api/admin/branches/${branchId}/hr-assign?hrUserId=${hrUserId}`, { method: "DELETE" });
            setMsg({ text: "HR removed", type: "success" });
            fetchAll();
        } catch (e) { setMsg({ text: e.message, type: "error" }); }
    };

    const assignCommittee = async () => {
        if (!committeeForm.empCode.trim()) { setMsg({ text: "Emp Code is required", type: "error" }); return; }
        setAssigning(true); setMsg({ text: "", type: "" });
        try {
            await api(`/api/admin/branches/${branchId}/committee-assign`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(committeeForm) });
            setCommitteeForm({ empCode: "", name: "", mobile: "" });
            setMsg({ text: "Committee member assigned successfully!", type: "success" });
            fetchAll();
        } catch (e) { setMsg({ text: e.message, type: "error" }); }
        finally { setAssigning(false); }
    };

    const removeCommittee = async (memberUserId) => {
        try {
            await api(`/api/admin/branches/${branchId}/committee-assign?memberUserId=${memberUserId}`, { method: "DELETE" });
            setMsg({ text: "Committee member removed", type: "success" });
            fetchAll();
        } catch (e) { setMsg({ text: e.message, type: "error" }); }
    };

    const assignCm = async () => {
        if (!cmForm.empCode.trim()) { setMsg({ text: "Emp Code is required", type: "error" }); return; }
        setAssigning(true); setMsg({ text: "", type: "" });
        try {
            await api(`/api/admin/branches/${branchId}/cm-assign`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cmForm) });
            setCmForm({ empCode: "", name: "", mobile: "" });
            setMsg({ text: "Cluster Manager assigned successfully!", type: "success" });
            fetchAll();
        } catch (e) { setMsg({ text: e.message, type: "error" }); }
        finally { setAssigning(false); }
    };

    const removeCm = async (cmUserId) => {
        try {
            await api(`/api/admin/branches/${branchId}/cm-assign?cmUserId=${cmUserId}`, { method: "DELETE" });
            setMsg({ text: "Cluster Manager removed", type: "success" });
            fetchAll();
        } catch (e) { setMsg({ text: e.message, type: "error" }); }
    };

    if (loading) return <div className="text-center py-12 text-gray-500">Loading organizational structure...</div>;
    if (error) return <div className="p-4 bg-red-50 text-red-700 rounded-lg font-medium">{error}</div>;

    return (
        <div className="space-y-6">
            <h2 className="text-lg font-bold text-[#003087]">Organizational Structure</h2>

            {msg.text && (
                <div className={`p-3 rounded-lg text-sm font-medium ${msg.type === "error" ? "bg-red-50 text-red-700 border border-red-200" : "bg-green-50 text-green-700 border border-green-200"}`}>
                    {msg.text}
                </div>
            )}

            <AssignmentSection
                title="Branch Manager"
                color="text-emerald-700"
                bgColor="bg-emerald-50"
                borderColor="border-emerald-200"
                avatarBg="bg-emerald-500"
                mode="single"
                assignments={bmAssignment ? [bmAssignment] : []}
                onAssign={assignBm}
                onRemove={removeBm}
                form={bmForm}
                setForm={setBmForm}
                assigning={assigning}
                emptyHint="No Branch Manager assigned to this branch"
            />

            <AssignmentSection
                title="Cluster Manager"
                color="text-purple-700"
                bgColor="bg-purple-50"
                borderColor="border-purple-200"
                avatarBg="bg-purple-500"
                mode="single"
                assignments={cmAssignments}
                onAssign={assignCm}
                onRemove={removeCm}
                form={cmForm}
                setForm={setCmForm}
                assigning={assigning}
                emptyHint="No Cluster Manager assigned to this branch"
            />

            <AssignmentSection
                title="HR Personnel"
                color="text-sky-700"
                bgColor="bg-sky-50"
                borderColor="border-sky-200"
                avatarBg="bg-sky-500"
                mode="multi"
                assignments={hrAssignments}
                onAssign={assignHr}
                onRemove={removeHr}
                form={hrForm}
                setForm={setHrForm}
                assigning={assigning}
                note="Up to 3 HR personnel per branch. The same person may serve multiple branches."
            />

            <AssignmentSection
                title="Committee Members"
                color="text-amber-700"
                bgColor="bg-amber-50"
                borderColor="border-amber-200"
                avatarBg="bg-amber-500"
                mode="multi"
                assignments={committeeAssignments}
                onAssign={assignCommittee}
                onRemove={removeCommittee}
                form={committeeForm}
                setForm={setCommitteeForm}
                assigning={assigning}
                note="Committee is global — assigning a member here applies to all branches automatically (max 3 members)."
            />

            {hods.length > 0 && (
                <div className="bg-white border border-[#E0E0E0] rounded-xl p-5">
                    <h3 className="text-[13px] font-bold text-[#999] uppercase tracking-wider mb-3">HODs</h3>
                    <div className="flex flex-wrap gap-3">
                        {hods.map(h => (
                            <div key={h.id} className="flex items-center gap-3 bg-purple-50 border border-purple-200 rounded-xl px-4 py-3">
                                <div className="w-10 h-10 rounded-full bg-purple-500 text-white flex items-center justify-center text-sm font-bold shrink-0">
                                    {h.name?.charAt(0)}
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-[#333]">{h.name}</p>
                                    <p className="text-xs text-gray-500">{h.empCode}{h.department?.name ? ` · ${h.department.name}` : ""}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="bg-white border border-[#E0E0E0] rounded-xl p-5">
                <h3 className="text-[13px] font-bold text-[#999] uppercase tracking-wider mb-3">Departments ({departments.length})</h3>
                {departments.length > 0 ? (
                    <div className="grid gap-2">
                        {departments.map(d => (
                            <div key={d.id} className="flex items-center justify-between bg-[#F9FAFB] rounded-lg px-4 py-3">
                                <div className="flex items-center gap-2">
                                    <span className="font-medium text-sm text-[#333]">{d.name}</span>
                                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${d.collarType === "WHITE_COLLAR" ? "bg-gray-100 text-gray-600" : "bg-blue-50 text-blue-600"}`}>
                                        {d.collarType === "WHITE_COLLAR" ? "WC" : "BC"}
                                    </span>
                                </div>
                                <span className="text-[12px] text-[#666] font-medium">{d.employeeCount} emp</span>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-sm text-gray-500">No departments yet</p>
                )}
            </div>
        </div>
    );
}
