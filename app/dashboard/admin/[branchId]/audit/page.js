"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";

async function api(url) {
    const res = await fetch(url);
    const json = await res.json();
    if (!res.ok) {
        if (res.status === 401) { window.location.replace("/login"); return new Promise(() => {}); }
        throw new Error(json.message || "Request failed");
    }
    if (!json.success) throw new Error(json.message || "Request failed");
    return json.data;
}

export default function BranchAuditPage() {
    const { branchId } = useParams();
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [actionFilter, setActionFilter] = useState("");
    const [limit, setLimit] = useState(100);

    const fetchLogs = async () => {
        setLoading(true);
        try {
            let url = `/api/admin/branches/${branchId}/audit-logs?limit=${limit}`;
            if (actionFilter) url += `&action=${actionFilter}`;
            const data = await api(url);
            setLogs(data.logs || []);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchLogs(); }, [branchId, actionFilter, limit]);

    // Derive unique actions for filter
    const uniqueActions = [...new Set(logs.map(l => l.action))].sort();

    if (error && !loading) return <div className="p-4 bg-red-50 text-red-700 rounded-lg font-medium">{error}</div>;

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-[#003087]">Audit Logs</h2>
                <button onClick={fetchLogs} className="px-3 py-1.5 bg-white border border-[#CCCCCC] rounded-lg text-xs font-bold text-[#333] hover:bg-[#F5F5F5] cursor-pointer">
                    Refresh
                </button>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-2">
                <select
                    value={actionFilter}
                    onChange={e => setActionFilter(e.target.value)}
                    className="border rounded-lg px-3 py-2 text-sm"
                >
                    <option value="">All Actions</option>
                    {uniqueActions.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
                <select
                    value={limit}
                    onChange={e => setLimit(Number(e.target.value))}
                    className="border rounded-lg px-3 py-2 text-sm"
                >
                    <option value={50}>50 rows</option>
                    <option value={100}>100 rows</option>
                    <option value={200}>200 rows</option>
                    <option value={500}>500 rows</option>
                </select>
            </div>

            {/* Table */}
            <div className="bg-white border border-[#E0E0E0] rounded-xl overflow-hidden">
                {loading ? (
                    <div className="text-center py-8 text-gray-500 text-sm">Loading...</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-[#F5F5F5] text-left">
                                    <th className="px-4 py-3 font-bold text-[11px] text-[#999] uppercase">Time</th>
                                    <th className="px-4 py-3 font-bold text-[11px] text-[#999] uppercase">User</th>
                                    <th className="px-4 py-3 font-bold text-[11px] text-[#999] uppercase">Role</th>
                                    <th className="px-4 py-3 font-bold text-[11px] text-[#999] uppercase">Action</th>
                                    <th className="px-4 py-3 font-bold text-[11px] text-[#999] uppercase">Details</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#F0F0F0]">
                                {logs.map(log => (
                                    <tr key={log.id} className="hover:bg-[#FAFAFA]">
                                        <td className="px-4 py-3 text-[12px] text-[#666] whitespace-nowrap">
                                            {new Date(log.createdAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className="font-medium text-[#333]">{log.user?.name || "—"}</span>
                                            {log.user?.empCode && <span className="text-[10px] text-gray-400 ml-1">({log.user.empCode})</span>}
                                        </td>
                                        <td className="px-4 py-3 text-[11px] font-bold text-[#666]">{log.user?.role || "—"}</td>
                                        <td className="px-4 py-3">
                                            <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] rounded font-bold">{log.action}</span>
                                        </td>
                                        <td className="px-4 py-3 text-[11px] text-[#999] max-w-[200px] truncate">
                                            {log.details ? JSON.stringify(log.details).slice(0, 120) : "—"}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                {!loading && logs.length === 0 && (
                    <div className="text-center py-8 text-gray-500 text-sm">No audit logs found for this branch.</div>
                )}
            </div>
        </div>
    );
}
