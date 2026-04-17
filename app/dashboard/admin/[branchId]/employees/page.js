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

const ROLE_COLORS = {
    EMPLOYEE: "bg-blue-100 text-blue-700",
    HOD: "bg-purple-100 text-purple-700",
    BRANCH_MANAGER: "bg-emerald-100 text-emerald-700",
    CLUSTER_MANAGER: "bg-orange-100 text-orange-700",
    HR: "bg-sky-100 text-sky-700",
    COMMITTEE: "bg-amber-100 text-amber-700",
};

export default function BranchEmployeesPage() {
    const { branchId } = useParams();
    const [employees, setEmployees] = useState([]);
    const [branch, setBranch] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [search, setSearch] = useState("");
    const [roleFilter, setRoleFilter] = useState("");

    const fetchEmployees = async () => {
        try {
            const url = `/api/admin/branches/${branchId}/employees${roleFilter ? `?role=${roleFilter}` : ""}`;
            const data = await api(url);
            setEmployees(data.employees || []);
            setBranch(data.branch);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchEmployees(); }, [branchId, roleFilter]);

    // Admin-initiated password reset. Uses window.prompt to stay UI-light; a
    // modal can replace this later without touching the API.
    const [resettingId, setResettingId] = useState(null);
    const handleResetPassword = async (emp) => {
        const pwd = window.prompt(`New password for ${emp.name} (${emp.empCode}) — min 8 chars:`);
        if (pwd == null) return;
        if (pwd.length < 8) { alert("Password must be at least 8 characters."); return; }
        setResettingId(emp.id);
        try {
            await api(`/api/admin/users/${emp.id}/reset-password`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ newPassword: pwd }),
            });
            alert("Password reset. The user has been notified.");
        } catch (e) {
            alert(e.message || "Reset failed");
        }
        setResettingId(null);
    };

    const filtered = employees.filter(emp => {
        if (!search) return true;
        const q = search.toLowerCase();
        return (
            emp.name?.toLowerCase().includes(q) ||
            emp.empCode?.toLowerCase().includes(q) ||
            emp.department?.name?.toLowerCase().includes(q) ||
            emp.designation?.toLowerCase().includes(q)
        );
    });

    if (loading) return <div className="text-center py-12 text-gray-500">Loading employees...</div>;
    if (error) return <div className="p-4 bg-red-50 text-red-700 rounded-lg font-medium">{error}</div>;

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-[#003087]">Employees ({filtered.length})</h2>
                <button onClick={fetchEmployees} className="px-3 py-1.5 bg-white border border-[#CCCCCC] rounded-lg text-xs font-bold text-[#333] hover:bg-[#F5F5F5] cursor-pointer">
                    Refresh
                </button>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-2">
                <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search name, empCode, department..."
                    className="border rounded-lg px-3 py-2 text-sm flex-1 min-w-[200px]"
                />
                <select
                    value={roleFilter}
                    onChange={e => setRoleFilter(e.target.value)}
                    className="border rounded-lg px-3 py-2 text-sm"
                >
                    <option value="">All Roles</option>
                    <option value="EMPLOYEE">Employee</option>
                    <option value="BRANCH_MANAGER">Branch Manager</option>
                    <option value="CLUSTER_MANAGER">Cluster Manager</option>
                    <option value="HOD">HOD</option>
                </select>
            </div>

            {/* Table */}
            <div className="bg-white border border-[#E0E0E0] rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-[#F5F5F5] text-left">
                                <th className="px-4 py-3 font-bold text-[11px] text-[#999] uppercase">Emp Code</th>
                                <th className="px-4 py-3 font-bold text-[11px] text-[#999] uppercase">Name</th>
                                <th className="px-4 py-3 font-bold text-[11px] text-[#999] uppercase">Department</th>
                                <th className="px-4 py-3 font-bold text-[11px] text-[#999] uppercase">Designation</th>
                                <th className="px-4 py-3 font-bold text-[11px] text-[#999] uppercase">Role</th>
                                <th className="px-4 py-3 font-bold text-[11px] text-[#999] uppercase">Collar</th>
                                <th className="px-4 py-3 font-bold text-[11px] text-[#999] uppercase">Mobile</th>
                                <th className="px-4 py-3 font-bold text-[11px] text-[#999] uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[#F0F0F0]">
                            {filtered.map(emp => (
                                <tr key={emp.id} className="hover:bg-[#FAFAFA]">
                                    <td className="px-4 py-3 font-mono text-[12px] font-bold text-[#003087]">{emp.empCode || "—"}</td>
                                    <td className="px-4 py-3 font-medium">{emp.name}</td>
                                    <td className="px-4 py-3 text-[#666]">{emp.department?.name || "—"}</td>
                                    <td className="px-4 py-3 text-[#666]">{emp.designation || "—"}</td>
                                    <td className="px-4 py-3">
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${ROLE_COLORS[emp.role] || "bg-gray-100 text-gray-700"}`}>
                                            {emp.role}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        {emp.collarType ? (
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${emp.collarType === "WHITE_COLLAR" ? "bg-gray-100 text-gray-600" : "bg-blue-50 text-blue-600"}`}>
                                                {emp.collarType === "WHITE_COLLAR" ? "WC" : "BC"}
                                            </span>
                                        ) : "—"}
                                    </td>
                                    <td className="px-4 py-3 text-[#666] text-[12px]">{emp.mobile || "—"}</td>
                                    <td className="px-4 py-3">
                                        <button
                                            onClick={() => handleResetPassword(emp)}
                                            disabled={resettingId === emp.id}
                                            className="px-2 py-1 text-[11px] font-bold rounded bg-white border border-[#CCCCCC] text-[#333] hover:bg-[#F5F5F5] disabled:opacity-50 cursor-pointer"
                                        >
                                            {resettingId === emp.id ? "Resetting…" : "Reset password"}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {filtered.length === 0 && (
                    <div className="text-center py-8 text-gray-500 text-sm">No employees found.</div>
                )}
            </div>
        </div>
    );
}
