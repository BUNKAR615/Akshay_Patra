"use client";

import { useState, useEffect } from "react";
import DashboardShell from "../../../components/DashboardShell";

async function api(url, opts) {
    const res = await fetch(url, opts);
    const json = await res.json();
    if (!res.ok || !json.success) throw new Error(json.message || "Request failed");
    return json.data;
}

const HR_ALLOWED = ["1800349", "5100029"];

export default function HRManagement() {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [authorized, setAuthorized] = useState(false);

    // Employee list
    const [employees, setEmployees] = useState([]);
    const [empDepartments, setEmpDepartments] = useState([]);
    const [empTotal, setEmpTotal] = useState(0);
    const [empTotalPages, setEmpTotalPages] = useState(1);
    const [empPage, setEmpPage] = useState(1);
    const [empLoading, setEmpLoading] = useState(false);
    const [empFilter, setEmpFilter] = useState({ search: "", department: "", role: "" });

    // Sub-tab
    const [subTab, setSubTab] = useState("active");

    // Add employee
    const [showAddEmp, setShowAddEmp] = useState(false);
    const [addForm, setAddForm] = useState({ name: "", mobile: "", departmentName: "", joiningDate: "", reason: "", empCode: "", designation: "" });
    const [addMsg, setAddMsg] = useState({ type: "", text: "" });
    const [addLoading, setAddLoading] = useState(false);

    // Remove employee
    const [removeId, setRemoveId] = useState(null);
    const [removeReason, setRemoveReason] = useState("");
    const [removeLoading, setRemoveLoading] = useState(false);

    // Archived
    const [archived, setArchived] = useState([]);
    const [archivedLoading, setArchivedLoading] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const d = await api("/api/auth/me");
                setUser(d.user);
                setAuthorized(HR_ALLOWED.includes(d.user.empCode));
            } catch { }
            setLoading(false);
        })();
    }, []);

    const fetchEmployees = async (pg = empPage, filters = empFilter) => {
        setEmpLoading(true);
        try {
            const params = new URLSearchParams({ page: pg.toString() });
            if (filters.search) params.set("search", filters.search);
            if (filters.department) params.set("department", filters.department);
            if (filters.role) params.set("role", filters.role);
            const d = await api(`/api/admin/employees?${params}`);
            setEmployees(d.employees);
            setEmpTotal(d.total);
            setEmpTotalPages(d.totalPages);
            setEmpPage(pg);
            if (d.departments) setEmpDepartments(d.departments);
        } catch { }
        setEmpLoading(false);
    };

    const fetchArchived = async () => {
        setArchivedLoading(true);
        try {
            const d = await api("/api/admin/employees/archived");
            setArchived(d.archived);
        } catch { }
        setArchivedLoading(false);
    };

    const handleAdd = async () => {
        setAddLoading(true);
        setAddMsg({ type: "", text: "" });
        try {
            const d = await api("/api/admin/employees", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(addForm),
            });
            setAddMsg({ type: "success", text: `${d.employee.name} added. Default password: ${d.defaultPassword}` });
            setAddForm({ name: "", mobile: "", departmentName: "", joiningDate: "", reason: "", empCode: "", designation: "" });
            fetchEmployees(1);
        } catch (err) {
            setAddMsg({ type: "error", text: err.message || "Failed to add employee" });
        }
        setAddLoading(false);
    };

    const handleRemove = async () => {
        if (!removeId || !removeReason) return;
        setRemoveLoading(true);
        try {
            await api(`/api/admin/employees/${removeId}`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ reasonLeaving: removeReason }),
            });
            setRemoveId(null);
            setRemoveReason("");
            fetchEmployees(1);
        } catch (err) {
            alert(err.message || "Failed to remove employee");
        }
        setRemoveLoading(false);
    };

    useEffect(() => { if (authorized) fetchEmployees(1); }, [authorized]);
    useEffect(() => { if (authorized) { const t = setTimeout(() => fetchEmployees(1, empFilter), 300); return () => clearTimeout(t); } }, [empFilter.search, empFilter.department, empFilter.role]);
    useEffect(() => { if (authorized && subTab === "archived") fetchArchived(); }, [subTab]);

    if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#003087]" /></div>;

    if (!authorized) {
        return (
            <DashboardShell user={user} title="HR Management">
                <div className="bg-red-50 border border-red-200 rounded-xl p-8 text-center">
                    <p className="text-red-700 font-bold text-lg">Access Denied</p>
                    <p className="text-red-600 text-sm mt-2">You are not authorized to access employee management.</p>
                </div>
            </DashboardShell>
        );
    }

    return (
        <DashboardShell user={user} title="HR Employee Management">
            <div className="space-y-6">
                {/* Header: Sub-tabs + Add button */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex gap-2">
                        <button onClick={() => setSubTab("active")} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all cursor-pointer ${subTab === "active" ? "bg-[#003087] text-white" : "bg-[#F5F5F5] text-[#333333] border border-[#E0E0E0]"}`}>Active Employees</button>
                        <button onClick={() => setSubTab("archived")} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all cursor-pointer ${subTab === "archived" ? "bg-[#003087] text-white" : "bg-[#F5F5F5] text-[#333333] border border-[#E0E0E0]"}`}>Removed History</button>
                    </div>
                    {subTab === "active" && (
                        <button onClick={() => { setShowAddEmp(!showAddEmp); setAddMsg({ type: "", text: "" }); }} className="px-4 py-2 bg-[#00843D] text-white rounded-lg text-sm font-bold hover:bg-[#006B32] transition-colors cursor-pointer">
                            {showAddEmp ? "Cancel" : "+ Add Employee"}
                        </button>
                    )}
                </div>

                {/* Add Employee Form */}
                {showAddEmp && subTab === "active" && (
                    <div className="bg-white border border-[#E0E0E0] rounded-xl p-5 shadow-sm space-y-4">
                        <h3 className="text-lg font-bold text-[#003087]">Add New Employee</h3>
                        {addMsg.text && (
                            <div className={`p-3 rounded-lg text-sm font-medium ${addMsg.type === "success" ? "bg-green-50 text-green-800 border border-green-200" : "bg-red-50 text-red-800 border border-red-200"}`}>{addMsg.text}</div>
                        )}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-[#666666] mb-1">Name *</label>
                                <input type="text" value={addForm.name} onChange={(e) => setAddForm({ ...addForm, name: e.target.value })} placeholder="Full name" className="w-full h-10 px-3 bg-[#F5F5F5] border border-[#CCCCCC] rounded-lg text-sm" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-[#666666] mb-1">Employee Code</label>
                                <input type="text" value={addForm.empCode} onChange={(e) => setAddForm({ ...addForm, empCode: e.target.value })} placeholder="e.g. 5100030" className="w-full h-10 px-3 bg-[#F5F5F5] border border-[#CCCCCC] rounded-lg text-sm" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-[#666666] mb-1">Mobile Number</label>
                                <input type="text" value={addForm.mobile} onChange={(e) => setAddForm({ ...addForm, mobile: e.target.value })} placeholder="Phone number" className="w-full h-10 px-3 bg-[#F5F5F5] border border-[#CCCCCC] rounded-lg text-sm" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-[#666666] mb-1">Department *</label>
                                <select value={addForm.departmentName} onChange={(e) => setAddForm({ ...addForm, departmentName: e.target.value })} className="w-full h-10 px-3 bg-[#F5F5F5] border border-[#CCCCCC] rounded-lg text-sm">
                                    <option value="">Select Department</option>
                                    {empDepartments.map(d => <option key={d} value={d}>{d}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-[#666666] mb-1">Designation</label>
                                <input type="text" value={addForm.designation} onChange={(e) => setAddForm({ ...addForm, designation: e.target.value })} placeholder="e.g. Executive" className="w-full h-10 px-3 bg-[#F5F5F5] border border-[#CCCCCC] rounded-lg text-sm" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-[#666666] mb-1">Joining Date</label>
                                <input type="date" value={addForm.joiningDate} onChange={(e) => setAddForm({ ...addForm, joiningDate: e.target.value })} className="w-full h-10 px-3 bg-[#F5F5F5] border border-[#CCCCCC] rounded-lg text-sm" />
                            </div>
                            <div className="sm:col-span-2 lg:col-span-3">
                                <label className="block text-xs font-bold text-[#666666] mb-1">Reason for Joining</label>
                                <input type="text" value={addForm.reason} onChange={(e) => setAddForm({ ...addForm, reason: e.target.value })} placeholder="e.g. New hire, Transfer from another branch" className="w-full h-10 px-3 bg-[#F5F5F5] border border-[#CCCCCC] rounded-lg text-sm" />
                            </div>
                        </div>
                        <button onClick={handleAdd} disabled={addLoading || !addForm.name || !addForm.departmentName} className="px-6 py-2 bg-[#003087] text-white rounded-lg text-sm font-bold hover:bg-[#002266] transition-colors cursor-pointer disabled:opacity-50">
                            {addLoading ? "Adding..." : "Add Employee"}
                        </button>
                    </div>
                )}

                {/* Remove Confirmation Modal */}
                {removeId && (
                    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
                        <div className="bg-white rounded-xl p-6 max-w-md w-full shadow-2xl space-y-4">
                            <h3 className="text-lg font-bold text-red-700">Remove Employee</h3>
                            <p className="text-sm text-[#666666]">This will archive the employee and remove them from all active lists, evaluations, and department mappings. This cannot be undone.</p>
                            <div>
                                <label className="block text-xs font-bold text-[#666666] mb-1">Reason for Leaving *</label>
                                <textarea value={removeReason} onChange={(e) => setRemoveReason(e.target.value)} placeholder="e.g. Resignation, Termination, Transfer" rows={3} className="w-full px-3 py-2 bg-[#F5F5F5] border border-[#CCCCCC] rounded-lg text-sm resize-none" />
                            </div>
                            <div className="flex gap-3 justify-end">
                                <button onClick={() => { setRemoveId(null); setRemoveReason(""); }} className="px-4 py-2 border border-[#E0E0E0] rounded-lg text-sm font-bold text-[#333333] cursor-pointer">Cancel</button>
                                <button onClick={handleRemove} disabled={removeLoading || !removeReason} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-bold hover:bg-red-700 cursor-pointer disabled:opacity-50">
                                    {removeLoading ? "Removing..." : "Confirm Remove"}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Active Employees */}
                {subTab === "active" && (
                    <>
                        <div className="bg-white border rounded-xl p-3 sm:p-5 shadow-sm border-[#E0E0E0] space-y-3 sm:space-y-0 sm:flex sm:flex-row sm:gap-4 sm:justify-between sm:items-center">
                            <div className="relative w-full sm:flex-1 sm:max-w-xs">
                                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#999999]"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg></span>
                                <input type="text" placeholder="Search name or code..." value={empFilter.search} onChange={(e) => setEmpFilter({ ...empFilter, search: e.target.value })} className="w-full h-10 pl-10 pr-4 bg-[#F5F5F5] border border-[#CCCCCC] rounded-lg text-sm text-[#333333] focus:outline-none focus:ring-2 focus:ring-[#003087]/20 focus:border-[#003087]" />
                            </div>
                            <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-4 sm:w-auto">
                                <select value={empFilter.department} onChange={(e) => setEmpFilter({ ...empFilter, department: e.target.value })} className="h-10 px-2 sm:px-3 bg-[#F5F5F5] border border-[#CCCCCC] rounded-lg text-xs sm:text-sm text-[#333333] w-full sm:w-48">
                                    <option value="">All Departments</option>
                                    {empDepartments.map(d => <option key={d} value={d}>{d}</option>)}
                                </select>
                                <select value={empFilter.role} onChange={(e) => setEmpFilter({ ...empFilter, role: e.target.value })} className="h-10 px-2 sm:px-3 bg-[#F5F5F5] border border-[#CCCCCC] rounded-lg text-xs sm:text-sm text-[#333333] w-full sm:w-40">
                                    <option value="">All Roles</option>
                                    <option value="EMPLOYEE">Employee</option>
                                    <option value="SUPERVISOR">Supervisor</option>
                                    <option value="BRANCH_MANAGER">Branch Manager</option>
                                    <option value="CLUSTER_MANAGER">Cluster Manager</option>
                                    <option value="ADMIN">Admin</option>
                                </select>
                            </div>
                        </div>
                        <div className="bg-white border border-[#E0E0E0] rounded-xl overflow-hidden shadow-sm">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-[#F5F5F5] border-b border-[#E0E0E0]">
                                            <th className="px-5 py-3 text-[12px] font-bold text-[#666666] uppercase tracking-wider">Emp Code</th>
                                            <th className="px-5 py-3 text-[12px] font-bold text-[#666666] uppercase tracking-wider">Name</th>
                                            <th className="px-5 py-3 text-[12px] font-bold text-[#666666] uppercase tracking-wider">Department</th>
                                            <th className="px-5 py-3 text-[12px] font-bold text-[#666666] uppercase tracking-wider">Designation</th>
                                            <th className="px-5 py-3 text-[12px] font-bold text-[#666666] uppercase tracking-wider">Roles</th>
                                            <th className="px-5 py-3 text-[12px] font-bold text-[#666666] uppercase tracking-wider">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[#E0E0E0]">
                                        {empLoading ? <tr><td colSpan={6} className="px-5 py-8 text-center text-[#666666]">Loading...</td></tr> :
                                        employees.length === 0 ? <tr><td colSpan={6} className="px-5 py-8 text-center text-[#666666]">No employees found</td></tr> :
                                        employees.map(e => {
                                            const roles = e.roles || [e.role];
                                            const isAdmin = roles.includes("ADMIN");
                                            return (
                                            <tr key={e.id} className="hover:bg-[#FAFAFA] transition-colors">
                                                <td className="px-5 py-3 text-sm text-[#333333] font-mono">{e.empCode || "—"}</td>
                                                <td className="px-5 py-3 text-sm font-bold text-[#003087]">{e.name}</td>
                                                <td className="px-5 py-3 text-sm text-[#333333]">{e.department}{e.evaluatorRoles?.length > 0 && <span className="block text-[10px] text-[#666666] mt-0.5">{e.evaluatorRoles.map(er => `${er.role.replace("_"," ")} — ${er.department}`).join(", ")}</span>}</td>
                                                <td className="px-5 py-3 text-sm text-[#666666]">{e.designation}</td>
                                                <td className="px-5 py-3"><div className="flex flex-wrap gap-1">{roles.map(r => <span key={r} className={`text-[10px] px-2 py-0.5 rounded-full border font-bold uppercase tracking-wider ${r === "EMPLOYEE" ? "bg-gray-50 text-gray-700 border-gray-200" : r === "SUPERVISOR" ? "bg-blue-50 text-[#003087] border-blue-200" : r === "BRANCH_MANAGER" ? "bg-emerald-50 text-[#00843D] border-emerald-200" : r === "CLUSTER_MANAGER" ? "bg-orange-50 text-[#F7941D] border-orange-200" : "bg-[#003087] text-white border-[#003087]"}`}>{r.replace("_", " ")}</span>)}</div></td>
                                                <td className="px-5 py-3">
                                                    {!isAdmin && <button onClick={() => setRemoveId(e.id)} className="text-xs px-3 py-1 bg-red-50 text-red-700 border border-red-200 rounded-full font-bold hover:bg-red-100 cursor-pointer">Remove</button>}
                                                </td>
                                            </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            {!empLoading && empTotal > 50 && (
                                <div className="px-5 py-3 border-t border-[#E0E0E0] flex items-center justify-between">
                                    <span className="text-xs text-[#666666]">Showing {(empPage-1)*50+1}-{Math.min(empPage*50,empTotal)} of {empTotal}</span>
                                    <div className="flex gap-1">
                                        <button disabled={empPage===1} onClick={()=>fetchEmployees(empPage-1,empFilter)} className="px-3 py-1 border border-[#E0E0E0] rounded text-sm disabled:opacity-50 cursor-pointer">Prev</button>
                                        <button disabled={empPage===empTotalPages} onClick={()=>fetchEmployees(empPage+1,empFilter)} className="px-3 py-1 border border-[#E0E0E0] rounded text-sm disabled:opacity-50 cursor-pointer">Next</button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </>
                )}

                {/* Archived Employees */}
                {subTab === "archived" && (
                    <div className="bg-white border border-[#E0E0E0] rounded-xl overflow-hidden shadow-sm">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-[#F5F5F5] border-b border-[#E0E0E0]">
                                        <th className="px-5 py-3 text-[12px] font-bold text-[#666666] uppercase tracking-wider">Emp Code</th>
                                        <th className="px-5 py-3 text-[12px] font-bold text-[#666666] uppercase tracking-wider">Name</th>
                                        <th className="px-5 py-3 text-[12px] font-bold text-[#666666] uppercase tracking-wider">Department</th>
                                        <th className="px-5 py-3 text-[12px] font-bold text-[#666666] uppercase tracking-wider">Designation</th>
                                        <th className="px-5 py-3 text-[12px] font-bold text-[#666666] uppercase tracking-wider">Removal Date</th>
                                        <th className="px-5 py-3 text-[12px] font-bold text-[#666666] uppercase tracking-wider">Reason</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[#E0E0E0]">
                                    {archivedLoading ? <tr><td colSpan={6} className="px-5 py-8 text-center text-[#666666]">Loading...</td></tr> :
                                    archived.length === 0 ? <tr><td colSpan={6} className="px-5 py-8 text-center text-[#666666]">No removed employees found</td></tr> :
                                    archived.map(a => (
                                        <tr key={a.id} className="hover:bg-[#FAFAFA] transition-colors">
                                            <td className="px-5 py-3 text-sm text-[#333333] font-mono">{a.empCode || "—"}</td>
                                            <td className="px-5 py-3 text-sm font-bold text-[#333333]">{a.name}</td>
                                            <td className="px-5 py-3 text-sm text-[#333333]">{a.department}</td>
                                            <td className="px-5 py-3 text-sm text-[#666666]">{a.designation || "—"}</td>
                                            <td className="px-5 py-3 text-sm text-[#666666]">{new Date(a.removalDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</td>
                                            <td className="px-5 py-3 text-sm text-[#666666]">{a.reasonLeaving}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </DashboardShell>
    );
}
