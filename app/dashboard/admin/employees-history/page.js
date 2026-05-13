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

function fmtDate(d) {
    if (!d) return "—";
    try { return new Date(d).toLocaleString(); } catch { return String(d); }
}

export default function GlobalEmployeeHistoryPage() {
    const [history, setHistory] = useState([]);
    const [branches, setBranches] = useState([]);
    const [branchId, setBranchId] = useState("");
    const [empCode, setEmpCode] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const data = await api(`/api/admin/branches`);
                if (!cancelled) setBranches(data.branches || []);
            } catch { /* non-fatal */ }
        })();
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        (async () => {
            try {
                const qs = new URLSearchParams({ limit: "200" });
                if (branchId) qs.set("branchId", branchId);
                if (empCode.trim()) qs.set("empCode", empCode.trim());
                const data = await api(`/api/admin/employees/history?${qs.toString()}`);
                if (!cancelled) setHistory(data.history || []);
            } catch (e) {
                if (!cancelled) setError(e.message);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [branchId, empCode]);

    return (
        <div className="max-w-6xl mx-auto p-4 lg:p-6 space-y-4">
            <div>
                <a href="/dashboard/admin" className="text-[12px] text-[#003087] font-bold hover:underline">← Admin Dashboard</a>
                <h1 className="text-2xl font-black text-[#003087] mt-1">Department / Role Change History (Global)</h1>
                <p className="text-sm text-[#666]">Every recorded role, department, or branch transition. Newest first.</p>
            </div>

            <div className="flex flex-wrap gap-2">
                <select
                    value={branchId}
                    onChange={e => setBranchId(e.target.value)}
                    className="border rounded-lg px-3 py-2 text-sm"
                >
                    <option value="">All Branches</option>
                    {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
                <input
                    value={empCode}
                    onChange={e => setEmpCode(e.target.value)}
                    placeholder="Filter by employee code"
                    className="border rounded-lg px-3 py-2 text-sm flex-1 min-w-[200px]"
                />
            </div>

            {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}

            <div className="bg-white border border-[#E0E0E0] rounded-xl overflow-hidden">
                <div className="p-4 border-b border-[#E0E0E0]">
                    <h3 className="text-base font-bold text-[#003087]">{history.length} change{history.length === 1 ? "" : "s"}</h3>
                </div>
                {loading ? (
                    <div className="text-center py-8 text-gray-500 text-sm">Loading…</div>
                ) : history.length === 0 ? (
                    <div className="text-center py-8 text-gray-500 text-sm">No changes recorded yet.</div>
                ) : (
                    <div className="divide-y divide-[#F0F0F0]">
                        {history.map(h => (
                            <div key={h.id} className="p-4 space-y-1.5 text-sm">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-mono text-[12px] font-bold text-[#003087]">{h.empCode || "—"}</span>
                                    <span className="font-medium">{h.employeeName || "—"}</span>
                                    <span className="text-[11px] text-[#666] ml-auto">{fmtDate(h.changedAt)} · by <span className="font-mono">{h.changedByEmpCode || "—"}</span></span>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[12px]">
                                    {(h.oldRole || h.newRole) && (
                                        <div className="bg-[#F8F8F8] rounded p-2">
                                            <span className="text-[10px] text-[#999] font-bold uppercase block">Role</span>
                                            <span className="text-[#666]">{h.oldRole || "—"}</span>
                                            <span className="px-1 text-[#999]">→</span>
                                            <span className="font-bold text-[#003087]">{h.newRole || "—"}</span>
                                        </div>
                                    )}
                                    {(h.oldDepartmentName || h.newDepartmentName) && (
                                        <div className="bg-[#F8F8F8] rounded p-2">
                                            <span className="text-[10px] text-[#999] font-bold uppercase block">Department</span>
                                            <span className="text-[#666]">{h.oldDepartmentName || "—"}</span>
                                            <span className="px-1 text-[#999]">→</span>
                                            <span className="font-bold text-[#003087]">{h.newDepartmentName || "—"}</span>
                                        </div>
                                    )}
                                    {(h.oldBranchName || h.newBranchName) && (h.oldBranchId !== h.newBranchId) && (
                                        <div className="bg-[#F8F8F8] rounded p-2">
                                            <span className="text-[10px] text-[#999] font-bold uppercase block">Branch</span>
                                            <span className="text-[#666]">{h.oldBranchName || "—"}</span>
                                            <span className="px-1 text-[#999]">→</span>
                                            <span className="font-bold text-[#003087]">{h.newBranchName || "—"}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
