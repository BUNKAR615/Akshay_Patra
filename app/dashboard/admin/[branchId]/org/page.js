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

export default function BranchOrgPage() {
    const { branchId } = useParams();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        (async () => {
            try {
                const [summary, empData, deptData, bmData, cmData] = await Promise.all([
                    api(`/api/admin/branches/${branchId}/summary`),
                    api(`/api/admin/branches/${branchId}/employees`),
                    api(`/api/admin/branches/${branchId}/departments`),
                    // bm-assign / cm-assign are the source of truth for who is
                    // currently the BM / CM of this branch (employees-by-role
                    // can lag during role transitions).
                    api(`/api/admin/branches/${branchId}/bm-assign`),
                    api(`/api/admin/branches/${branchId}/cm-assign`),
                ]);
                const employees = empData.employees || [];
                const hods = employees.filter(e => e.role === "HOD");
                const cms = (cmData.assignments || []).map(a => a.cm).filter(Boolean);
                const bms = bmData.assignment ? [bmData.assignment.bm] : [];
                const departments = deptData.departments || [];

                setData({ branch: summary.branch, cms, bms, hods, departments });
            } catch (e) {
                setError(e.message);
            } finally {
                setLoading(false);
            }
        })();
    }, [branchId]);

    if (loading) return <div className="text-center py-12 text-gray-500">Loading org structure...</div>;
    if (error) return <div className="p-4 bg-red-50 text-red-700 rounded-lg font-medium">{error}</div>;
    if (!data) return null;

    const { cms, bms, hods, departments } = data;

    return (
        <div className="space-y-6">
            <h2 className="text-lg font-bold text-[#003087]">Organization Structure</h2>

            {/* CM */}
            <div className="bg-white border border-[#E0E0E0] rounded-xl p-4">
                <h3 className="text-[13px] font-bold text-[#999] uppercase tracking-wider mb-3">Cluster Manager</h3>
                {cms.length > 0 ? (
                    <div className="flex flex-wrap gap-3">
                        {cms.map(cm => (
                            <div key={cm.id} className="flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
                                <div className="w-8 h-8 rounded-full bg-orange-500 text-white flex items-center justify-center text-xs font-bold">
                                    {cm.name?.charAt(0)}
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-[#333]">{cm.name}</p>
                                    <p className="text-[10px] text-gray-500">{cm.empCode}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-sm text-gray-500">No Cluster Manager assigned</p>
                )}
            </div>

            {/* BM */}
            <div className="bg-white border border-[#E0E0E0] rounded-xl p-4">
                <h3 className="text-[13px] font-bold text-[#999] uppercase tracking-wider mb-3">Branch Manager</h3>
                {bms.length > 0 ? (
                    <div className="flex flex-wrap gap-3">
                        {bms.map(bm => (
                            <div key={bm.id} className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                                <div className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center text-xs font-bold">
                                    {bm.name?.charAt(0)}
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-[#333]">{bm.name}</p>
                                    <p className="text-[10px] text-gray-500">{bm.empCode}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-sm text-gray-500">No Branch Manager assigned</p>
                )}
            </div>

            {/* HODs */}
            {hods.length > 0 && (
                <div className="bg-white border border-[#E0E0E0] rounded-xl p-4">
                    <h3 className="text-[13px] font-bold text-[#999] uppercase tracking-wider mb-3">HODs</h3>
                    <div className="flex flex-wrap gap-3">
                        {hods.map(h => (
                            <div key={h.id} className="flex items-center gap-2 bg-purple-50 border border-purple-200 rounded-lg px-3 py-2">
                                <div className="w-8 h-8 rounded-full bg-purple-500 text-white flex items-center justify-center text-xs font-bold">
                                    {h.name?.charAt(0)}
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-[#333]">{h.name}</p>
                                    <p className="text-[10px] text-gray-500">{h.empCode} {h.department?.name ? `· ${h.department.name}` : ""}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Departments */}
            <div className="bg-white border border-[#E0E0E0] rounded-xl p-4">
                <h3 className="text-[13px] font-bold text-[#999] uppercase tracking-wider mb-3">Departments ({departments.length})</h3>
                {departments.length > 0 ? (
                    <div className="grid gap-2">
                        {departments.map(d => (
                            <div key={d.id} className="flex items-center justify-between bg-[#F9FAFB] rounded-lg px-3 py-2">
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
