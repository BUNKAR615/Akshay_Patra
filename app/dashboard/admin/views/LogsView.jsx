"use client";

import { useEffect, useState } from "react";
import { api } from "../../../../lib/clientApi";
import DataTable from "../../../../components/ui/DataTable";

/** Audit logs tab — server-paginated table with action/date filters. */
export default function LogsView() {
    const [logs, setLogs] = useState([]);
    const [logPage, setLogPage] = useState(1);
    const [logTotal, setLogTotal] = useState(0); // total pages
    const [logActions, setLogActions] = useState([]);
    const [logFilter, setLogFilter] = useState({ action: "", from: "", to: "" });
    const [loading, setLoading] = useState(true);

    const fetchLogs = async (page = 1, filters = logFilter) => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ page, limit: 20 });
            if (filters.action) params.set("action", filters.action);
            if (filters.from) params.set("from", new Date(filters.from).toISOString());
            if (filters.to) params.set("to", new Date(filters.to + "T23:59:59").toISOString());
            const d = await api(`/api/admin/audit-logs?${params}`);
            setLogs(d.logs); setLogTotal(d.pagination.totalPages); setLogPage(page);
            if (d.actions) setLogActions(d.actions);
        } catch (err) { console.error("[Admin] fetchLogs failed:", err); }
        setLoading(false);
    };

    useEffect(() => { fetchLogs(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

    const columns = [
        { key: "time", header: "Time", render: (log) => <span className="text-gray-500 whitespace-nowrap text-xs">{new Date(log.createdAt).toLocaleString()}</span> },
        { key: "user", header: "User", render: (log) => <span className="text-gray-900 text-sm font-medium">{log.user?.name || "system"}</span> },
        { key: "role", header: "Role", hideBelow: "sm", render: (log) => <span className="text-xs text-gray-500">{log.user?.role || "-"}</span> },
        { key: "action", header: "Action", render: (log) => <span className="text-xs px-2.5 py-1 rounded-full bg-ap-blue-50 text-ap-blue border border-[#90CAF9] whitespace-nowrap">{log.action}</span> },
        { key: "ip", header: "IP Address", hideBelow: "md", render: (log) => <span className="text-gray-500 text-xs font-mono">{log.ipAddress || "-"}</span> },
        { key: "details", header: "Details", hideBelow: "lg", render: (log) => <span className="text-gray-500 text-xs block max-w-xs truncate">{log.details ? JSON.stringify(log.details) : "-"}</span> },
    ];

    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-xl font-bold text-ap-blue">Audit Logs</h2>
                <p className="text-sm text-gray-500">Every admin and evaluator action, with timestamps and IP addresses.</p>
            </div>

            {/* Filter Bar */}
            <div className="bg-white border border-ap-border shadow-card rounded-card p-3 sm:p-4 space-y-2 sm:space-y-0 sm:flex sm:flex-wrap sm:items-end sm:gap-3">
                <div className="w-full sm:w-auto">
                    <label className="block text-xs text-gray-700 mb-1 font-medium">Action</label>
                    <select value={logFilter.action} onChange={(e) => setLogFilter({ ...logFilter, action: e.target.value })} className="w-full sm:w-auto px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-ap-blue sm:min-w-[160px]">
                        <option value="">All Actions</option>
                        {logActions.map((a) => <option key={a} value={a}>{a}</option>)}
                    </select>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-3">
                    <div>
                        <label className="block text-xs text-gray-700 mb-1 font-medium">From</label>
                        <input type="date" value={logFilter.from} onChange={(e) => setLogFilter({ ...logFilter, from: e.target.value })} className="w-full sm:w-auto px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-ap-blue" />
                    </div>
                    <div>
                        <label className="block text-xs text-gray-700 mb-1 font-medium">To</label>
                        <input type="date" value={logFilter.to} onChange={(e) => setLogFilter({ ...logFilter, to: e.target.value })} className="w-full sm:w-auto px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-ap-blue" />
                    </div>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => fetchLogs(1, logFilter)} className="flex-1 sm:flex-none px-4 py-2 bg-ap-blue hover:bg-ap-green text-white rounded-lg text-sm font-medium cursor-pointer transition-colors shadow-sm">Apply</button>
                    <button onClick={() => { setLogFilter({ action: "", from: "", to: "" }); fetchLogs(1, { action: "", from: "", to: "" }); }} className="flex-1 sm:flex-none px-4 py-2 bg-gray-50 hover:bg-white border border-ap-border text-gray-700 rounded-lg text-sm cursor-pointer transition-colors">Clear</button>
                </div>
            </div>

            <DataTable
                id="admin-logs"
                columns={columns}
                rows={logs}
                rowKey={(log) => log.id}
                loading={loading}
                emptyIcon="🗒️"
                emptyTitle="No audit logs found"
                emptySub="Try widening the date range or clearing filters"
                columnVisibility
                pagination={logTotal > 1 ? { page: logPage, totalPages: logTotal, onPageChange: (p) => fetchLogs(p) } : null}
                mobileCard={(log) => (
                    <div className="space-y-1">
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-bold text-gray-900">{log.user?.name || "system"}</span>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-ap-blue-50 text-ap-blue border border-[#90CAF9]">{log.action}</span>
                        </div>
                        <p className="text-[11px] text-gray-400 m-0">{new Date(log.createdAt).toLocaleString()}{log.ipAddress ? ` · ${log.ipAddress}` : ""}</p>
                    </div>
                )}
            />
        </div>
    );
}
