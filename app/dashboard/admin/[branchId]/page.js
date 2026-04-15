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

function StatBox({ label, value, color = "text-[#003087]" }) {
    return (
        <div className="bg-white border border-[#E0E0E0] rounded-xl p-4 text-center">
            <p className={`text-[28px] font-black ${color}`}>{value}</p>
            <p className="text-[11px] text-[#999999] font-bold uppercase tracking-wider mt-1">{label}</p>
        </div>
    );
}

export default function BranchSummaryPage() {
    const { branchId } = useParams();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        api(`/api/admin/branches/${branchId}/summary`)
            .then(setData)
            .catch(e => setError(e.message))
            .finally(() => setLoading(false));
    }, [branchId]);

    if (loading) return <div className="text-center py-12 text-gray-500">Loading summary...</div>;
    if (error) return <div className="p-4 bg-red-50 text-red-700 rounded-lg font-medium">{error}</div>;
    if (!data) return null;

    const { counts, quarter } = data;

    return (
        <div className="space-y-6">
            {/* Quarter bar */}
            {quarter && (
                <div className="bg-white border border-[#E0E0E0] rounded-xl p-4 flex items-center justify-between">
                    <div>
                        <p className="text-[11px] text-[#999999] font-bold uppercase tracking-wider">Active Quarter</p>
                        <p className="text-[18px] font-bold text-[#003087]">{quarter.name}</p>
                    </div>
                    <span className="px-3 py-1 rounded-full text-[12px] font-bold bg-green-100 text-green-700 border border-green-200">
                        {quarter.status}
                    </span>
                </div>
            )}

            {/* Overall stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatBox label="Employees" value={counts.employees} />
                <StatBox label="Departments" value={counts.departments} />
                <StatBox label="Branch Managers" value={counts.bm} color="text-emerald-700" />
                <StatBox label="Cluster Managers" value={counts.cm} color="text-orange-700" />
            </div>

            {/* Org assignments */}
            <div className="grid grid-cols-3 gap-3">
                <StatBox label="HODs Assigned" value={counts.hod} color="text-purple-700" />
                <StatBox label="HR Assigned" value={counts.hr} color="text-sky-700" />
                <StatBox label="Committee" value={counts.committee} color="text-amber-700" />
            </div>

            {/* Stage progress */}
            {quarter && (
                <div className="bg-white border border-[#E0E0E0] rounded-xl p-5">
                    <h3 className="text-[16px] font-bold text-[#003087] mb-4">Evaluation Pipeline</h3>
                    <div className="space-y-3">
                        {[
                            { label: "Stage 1 — Self Assessment", count: counts.stage1, color: "bg-blue-500" },
                            { label: "Stage 2 — BM/HOD Evaluation", count: counts.stage2, color: "bg-emerald-500" },
                            { label: "Stage 3 — CM Evaluation", count: counts.stage3, color: "bg-orange-500" },
                            { label: "Stage 4 — HR Evaluation", count: counts.stage4, color: "bg-purple-500" },
                            { label: "Winners", count: counts.winners, color: "bg-[#00843D]" },
                        ].map(stage => (
                            <div key={stage.label} className="flex items-center gap-3">
                                <div className={`w-2.5 h-2.5 rounded-full ${stage.color} shrink-0`} />
                                <span className="text-[13px] font-medium text-[#333333] flex-1">{stage.label}</span>
                                <span className="text-[15px] font-black text-[#003087] tabular-nums">{stage.count}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {!quarter && (
                <div className="bg-[#F5F5F5] border border-[#E0E0E0] rounded-xl p-8 text-center">
                    <span className="text-3xl block mb-3 opacity-50">📅</span>
                    <h3 className="font-bold text-[#333333] mb-1">No Active Quarter</h3>
                    <p className="text-sm text-[#666666]">Start a new quarter from the Quarter Management page to see evaluation progress.</p>
                </div>
            )}
        </div>
    );
}
