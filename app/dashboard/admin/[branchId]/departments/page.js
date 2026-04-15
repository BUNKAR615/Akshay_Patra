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

export default function BranchDepartmentsPage() {
    const { branchId } = useParams();
    const [departments, setDepartments] = useState([]);
    const [branch, setBranch] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [msg, setMsg] = useState({ text: "", type: "" });

    // Inline rename state
    const [editId, setEditId] = useState(null);
    const [editName, setEditName] = useState("");

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

    if (loading) return <div className="text-center py-12 text-gray-500">Loading departments...</div>;
    if (error) return <div className="p-4 bg-red-50 text-red-700 rounded-lg font-medium">{error}</div>;

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-[#003087]">Departments ({departments.length})</h2>
                <button onClick={fetchDepts} className="px-3 py-1.5 bg-white border border-[#CCCCCC] rounded-lg text-xs font-bold text-[#333] hover:bg-[#F5F5F5] cursor-pointer">
                    Refresh
                </button>
            </div>

            {msg.text && (
                <div className={`p-3 rounded-lg text-sm font-medium ${msg.type === "error" ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>
                    {msg.text}
                </div>
            )}

            <div className="grid gap-3">
                {departments.map(dept => (
                    <div key={dept.id} className="bg-white border border-[#E0E0E0] rounded-xl p-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                {editId === dept.id ? (
                                    <div className="flex items-center gap-2">
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
                                            onClick={() => { setEditId(dept.id); setEditName(dept.name); }}
                                            className="text-[10px] px-2 py-0.5 bg-gray-100 text-gray-600 rounded hover:bg-gray-200 cursor-pointer"
                                        >
                                            Rename
                                        </button>
                                    </>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${dept.collarType === "WHITE_COLLAR" ? "bg-gray-100 text-gray-600" : "bg-blue-50 text-blue-600"}`}>
                                    {dept.collarType === "WHITE_COLLAR" ? "White Collar" : "Blue Collar"}
                                </span>
                                <span className="text-[12px] text-[#666] font-medium">{dept.employeeCount} employees</span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {departments.length === 0 && (
                <div className="bg-[#F5F5F5] border border-[#E0E0E0] rounded-xl p-8 text-center">
                    <h3 className="font-bold text-[#333] mb-1">No Departments</h3>
                    <p className="text-sm text-[#666]">Departments will appear here after employees are uploaded to this branch.</p>
                </div>
            )}
        </div>
    );
}
