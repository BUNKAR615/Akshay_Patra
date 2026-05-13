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

export default function GlobalRemovedEmployeesPage() {
    const [archived, setArchived] = useState([]);
    const [branches, setBranches] = useState([]);
    const [branchId, setBranchId] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [search, setSearch] = useState("");

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
                const url = `/api/admin/employees/archived${branchId ? `?branchId=${branchId}` : ""}`;
                const data = await api(url);
                if (!cancelled) setArchived(data.archived || []);
            } catch (e) {
                if (!cancelled) setError(e.message);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [branchId]);

    const filtered = archived.filter(a => {
        if (!search) return true;
        const q = search.toLowerCase();
        return (
            a.name?.toLowerCase().includes(q) ||
            a.empCode?.toLowerCase().includes(q) ||
            a.department?.toLowerCase().includes(q) ||
            a.archivedBy?.toLowerCase().includes(q)
        );
    });

    return (
        <div className="max-w-6xl mx-auto p-4 lg:p-6 space-y-4">
            <div>
                <a href="/dashboard/admin" className="text-[12px] text-[#003087] font-bold hover:underline">← Admin Dashboard</a>
                <h1 className="text-2xl font-black text-[#003087] mt-1">Removed Employees (Global)</h1>
                <p className="text-sm text-[#666]">Archived users across every branch. Newest first.</p>
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
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search name, empCode, department, removedBy…"
                    className="border rounded-lg px-3 py-2 text-sm flex-1 min-w-[240px]"
                />
            </div>

            {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}

            <div className="bg-white border border-[#E0E0E0] rounded-xl overflow-hidden">
                <div className="p-4 border-b border-[#E0E0E0]">
                    <h3 className="text-base font-bold text-[#003087]">{filtered.length} removed employee{filtered.length === 1 ? "" : "s"}</h3>
                </div>
                {loading ? (
                    <div className="text-center py-8 text-gray-500 text-sm">Loading…</div>
                ) : filtered.length === 0 ? (
                    <div className="text-center py-8 text-gray-500 text-sm">No removed employees match the filter.</div>
                ) : (
                    <div className="divide-y divide-[#F0F0F0]">
                        {filtered.map(a => (
                            <div key={a.id} className="p-4 grid grid-cols-1 md:grid-cols-[140px_1fr_1fr_1fr_1.2fr] gap-3 text-sm">
                                <div className="font-mono text-[12px] font-bold text-[#003087]">{a.empCode || "—"}</div>
                                <div className="font-medium text-[#1a1a1a] break-words">{a.name}</div>
                                <div><span className="text-[10px] text-[#999] font-bold uppercase block">Department</span>{a.department || "—"}</div>
                                <div><span className="text-[10px] text-[#999] font-bold uppercase block">Removed</span>{fmtDate(a.removalDate)}</div>
                                <div>
                                    <span className="text-[10px] text-[#999] font-bold uppercase block">By / Reason</span>
                                    <span className="font-mono text-[11px]">{a.archivedBy || "—"}</span>
                                    <span className="text-[#666]"> · {a.reasonLeaving || "—"}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
