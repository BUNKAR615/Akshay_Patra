"use client";

import { useEffect, useState } from "react";
import { api } from "../../../../lib/clientApi";
import { Modal, useToast } from "../../../../components/ui";

/**
 * Organization structure tab. The departments payload is cached in page.js
 * (fetched once per session, same as before the split). The "Add Employee"
 * button hands off to the Employees tab via onRequestAddEmployee(deptName).
 */
export default function OrgView({ orgStructure, orgLoading, fetchOrg, onRequestAddEmployee }) {
    const toast = useToast();
    const [orgBranchId, setOrgBranchId] = useState("");
    const [expandedDeptId, setExpandedDeptId] = useState(null);
    const [personDetail, setPersonDetail] = useState(null);

    // Reassign role modal
    const [reassignModal, setReassignModal] = useState(null); // { dept: {id, name}, role }
    const [reassignSearch, setReassignSearch] = useState("");
    const [reassignTarget, setReassignTarget] = useState(null);
    const [reassignAllEmps, setReassignAllEmps] = useState([]);
    const [reassignLoading, setReassignLoading] = useState(false);
    const [reassignMsg, setReassignMsg] = useState({ type: "", text: "" });

    // Remove employee (from a department's list)
    const [removeId, setRemoveId] = useState(null);
    const [removeReason, setRemoveReason] = useState("");
    const [removeLoading, setRemoveLoading] = useState(false);

    // Keep the branch filter pointing at a real branch from the payload.
    useEffect(() => {
        const branchesInResp = Array.from(new Set((orgStructure || []).map(x => x.branch))).filter(Boolean);
        setOrgBranchId(prev => (prev && branchesInResp.includes(prev) ? prev : branchesInResp[0] || ""));
    }, [orgStructure]);

    const toggleDept = (deptId) => setExpandedDeptId(prev => prev === deptId ? null : deptId);

    const openReassignModal = async (dept, role) => {
        setReassignModal({ dept, role });
        setReassignSearch("");
        setReassignTarget(null);
        setReassignMsg({ type: "", text: "" });
        if (reassignAllEmps.length === 0) {
            try {
                const d = await api("/api/admin/employees?export=true");
                setReassignAllEmps(d.employees || []);
            } catch (err) { console.error("[Admin] fetchAllEmps failed:", err); }
        }
    };

    const handleReassign = async () => {
        if (!reassignTarget || !reassignModal) return;
        setReassignLoading(true);
        setReassignMsg({ type: "", text: "" });
        try {
            const d = await api("/api/admin/departments/assign-role", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userId: reassignTarget.id,
                    departmentId: reassignModal.dept.id,
                    role: reassignModal.role,
                }),
            });
            setReassignMsg({ type: "success", text: d.message });
            setTimeout(() => {
                setReassignModal(null);
                fetchOrg();
            }, 1200);
        } catch (err) {
            setReassignMsg({ type: "error", text: err.message });
        }
        setReassignLoading(false);
    };

    const handleRemoveEmployee = async () => {
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
            toast.success("Employee removed and archived");
            fetchOrg();
        } catch (err) {
            toast.error(err.message || "Failed to remove employee");
        }
        setRemoveLoading(false);
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <h2 className="text-xl font-bold text-ap-blue">Organization Structure</h2>
                <div className="flex items-center gap-2">
                    <select
                        value={orgBranchId}
                        onChange={(e) => setOrgBranchId(e.target.value)}
                        aria-label="Filter by branch"
                        className="border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 bg-white min-h-[44px]"
                    >
                        {Array.from(new Set(orgStructure.map(d => d.branch))).filter(Boolean).map(name => (
                            <option key={name} value={name}>{name}</option>
                        ))}
                    </select>
                    <button onClick={fetchOrg} className="px-3 py-2 min-h-[44px] min-w-[80px] bg-white border border-gray-300 rounded-lg text-gray-700 font-bold hover:text-ap-blue hover:bg-gray-50 text-[14px] flex items-center gap-1.5 cursor-pointer transition-colors">
                        ↻ Refresh
                    </button>
                </div>
            </div>

            {orgLoading ? (
                <div className="flex items-center justify-center h-32"><div className="animate-spin h-8 w-8 border-2 border-ap-blue border-t-transparent rounded-full" /></div>
            ) : (
                <div className="grid grid-cols-1 gap-4">
                    {orgStructure.filter(dept => !orgBranchId || dept.branch === orgBranchId).map((dept) => {
                        const isExpanded = expandedDeptId === dept.id;
                        return (
                            <div key={dept.id} className={`bg-white border rounded-card shadow-card transition-all ${isExpanded ? "border-ap-blue ring-1 ring-ap-blue/20" : "border-ap-border"}`}>
                                {/* Department Header — clickable */}
                                <button onClick={() => toggleDept(dept.id)} aria-expanded={isExpanded} className="w-full flex items-center justify-between p-3 sm:p-5 cursor-pointer text-left group bg-transparent border-none">
                                    <div className="flex-1">
                                        <h3 className="text-base sm:text-lg font-bold text-ap-blue group-hover:text-ap-green transition-colors m-0">{dept.name}</h3>
                                        <p className="text-[10px] sm:text-xs text-gray-500 uppercase tracking-wider m-0">{dept.branch} Branch &middot; {dept.employeeCount} Employees</p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="hidden sm:flex gap-1.5 items-center">
                                            {dept.branchManagers?.[0] && (
                                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-50 text-gray-700 border border-ap-border font-bold">BM: {dept.branchManagers[0].name.split(" ")[0]}</span>
                                            )}
                                            {dept.hods?.[0] && (
                                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-50 text-gray-700 border border-ap-border font-bold">HOD: {dept.hods[0].name.split(" ")[0]}</span>
                                            )}
                                        </div>
                                        <svg className={`w-5 h-5 text-gray-500 transition-transform ${isExpanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                    </div>
                                </button>

                                {/* Expanded content */}
                                {isExpanded && (
                                    <div className="border-t border-ap-border p-3 sm:p-5 space-y-5">
                                        <div className="bg-blue-50/60 rounded-lg p-4 border border-blue-100">
                                            <div className="flex items-center justify-between mb-2">
                                                <p className="text-xs font-bold text-ap-blue uppercase tracking-wider m-0">Branch Manager (Evaluator)</p>
                                                <button onClick={() => openReassignModal({ id: dept.id, name: dept.name }, "BRANCH_MANAGER")} className="text-[10px] px-2 py-0.5 rounded bg-ap-blue text-white font-bold hover:bg-ap-green transition-colors cursor-pointer">Reassign</button>
                                            </div>
                                            {dept.branchManagers?.length > 0 ? (
                                                <div className="space-y-2">
                                                    {dept.branchManagers.map(bm => (
                                                        <button key={bm.id} onClick={() => setPersonDetail(bm)} className="w-full text-left p-2 rounded-lg hover:bg-white transition-colors cursor-pointer group/person bg-transparent border-none">
                                                            <p className="text-sm text-ap-blue font-semibold group-hover/person:underline m-0">{bm.name}</p>
                                                            <p className="text-xs text-gray-500 m-0">{bm.designation || "—"} {bm.empCode ? `(${bm.empCode})` : ""}</p>
                                                        </button>
                                                    ))}
                                                </div>
                                            ) : <p className="text-sm text-gray-400 italic m-0">Not Assigned</p>}
                                        </div>

                                        <div className="bg-emerald-50/60 rounded-lg p-4 border border-emerald-100">
                                            <div className="flex items-center justify-between mb-2">
                                                <p className="text-xs font-bold text-ap-green uppercase tracking-wider m-0">Head of Department (Evaluator)</p>
                                                <button onClick={() => openReassignModal({ id: dept.id, name: dept.name }, "HOD")} className="text-[10px] px-2 py-0.5 rounded bg-ap-green text-white font-bold hover:bg-ap-blue transition-colors cursor-pointer">Reassign</button>
                                            </div>
                                            {dept.hods?.length > 0 ? (
                                                <div className="space-y-2">
                                                    {dept.hods.map(h => (
                                                        <button key={h.id} onClick={() => setPersonDetail(h)} className="w-full text-left p-2 rounded-lg hover:bg-white transition-colors cursor-pointer group/person bg-transparent border-none">
                                                            <p className="text-sm text-ap-green font-semibold group-hover/person:underline m-0">{h.name}</p>
                                                            <p className="text-xs text-gray-500 m-0">{h.designation || "—"} {h.empCode ? `(${h.empCode})` : ""}</p>
                                                        </button>
                                                    ))}
                                                </div>
                                            ) : <p className="text-sm text-gray-400 italic m-0">Not Assigned</p>}
                                        </div>

                                        {/* Employee List */}
                                        <div>
                                            <div className="flex items-center justify-between mb-2">
                                                <p className="text-xs font-bold text-gray-700 uppercase tracking-wider m-0">All Employees ({dept.employees?.length || 0})</p>
                                                <button onClick={() => onRequestAddEmployee(dept.name)} className="text-[10px] px-2.5 py-1 rounded bg-ap-green text-white font-bold hover:bg-ap-green-700 transition-colors cursor-pointer flex items-center gap-1">
                                                    + Add Employee
                                                </button>
                                            </div>
                                            {dept.employees?.length > 0 ? (
                                                <div className="border border-ap-border rounded-lg overflow-hidden">
                                                    <div className="overflow-x-auto">
                                                        <table className="w-full text-left border-collapse">
                                                            <thead>
                                                                <tr className="bg-gray-50 border-b border-ap-border">
                                                                    <th className="px-3 py-2 text-[10px] font-bold text-gray-500 uppercase">Emp Code</th>
                                                                    <th className="px-3 py-2 text-[10px] font-bold text-gray-500 uppercase">Name</th>
                                                                    <th className="px-3 py-2 text-[10px] font-bold text-gray-500 uppercase">Designation</th>
                                                                    <th className="px-3 py-2 text-[10px] font-bold text-gray-500 uppercase">Mobile</th>
                                                                    <th className="px-3 py-2 text-[10px] font-bold text-gray-500 uppercase">Roles</th>
                                                                    <th className="px-3 py-2 text-[10px] font-bold text-gray-500 uppercase">Action</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-ap-border">
                                                                {dept.employees.map(emp => (
                                                                    <tr key={emp.id} className="hover:bg-gray-50 transition-colors">
                                                                        <td className="px-3 py-2 text-xs text-gray-700 font-mono">{emp.empCode || "—"}</td>
                                                                        <td className="px-3 py-2">
                                                                            <button onClick={() => setPersonDetail(emp)} className="text-xs font-bold text-ap-blue hover:underline cursor-pointer text-left bg-transparent border-none p-0">{emp.name}</button>
                                                                        </td>
                                                                        <td className="px-3 py-2 text-xs text-gray-500">{emp.designation || "—"}</td>
                                                                        <td className="px-3 py-2 text-xs text-gray-500">{emp.mobile || <span className="text-gray-300 italic">—</span>}</td>
                                                                        <td className="px-3 py-2">
                                                                            <div className="flex flex-wrap gap-1">
                                                                                {(emp.roles || [emp.role]).map(r => (
                                                                                    <span key={r} className={`text-[9px] px-1.5 py-0.5 rounded-full border font-bold uppercase ${r === "EMPLOYEE" ? "bg-gray-50 text-gray-600 border-gray-200" : r === "SUPERVISOR" ? "bg-blue-50 text-ap-blue border-blue-200" : r === "BRANCH_MANAGER" ? "bg-emerald-50 text-ap-green border-emerald-200" : r === "CLUSTER_MANAGER" ? "bg-orange-50 text-ap-orange-700 border-orange-200" : "bg-ap-blue text-white border-ap-blue"}`}>{r.replace(/_/g, " ")}</span>
                                                                                ))}
                                                                            </div>
                                                                        </td>
                                                                        <td className="px-3 py-2">
                                                                            {!(emp.roles || [emp.role]).includes("ADMIN") && (
                                                                                <button onClick={() => setRemoveId(emp.id)} className="text-[10px] px-2 py-0.5 bg-red-50 text-red-700 border border-red-200 rounded-full font-bold hover:bg-red-100 cursor-pointer">Remove</button>
                                                                            )}
                                                                        </td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>
                                            ) : <p className="text-sm text-gray-400 italic m-0">No employees in this department</p>}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Reassign role modal */}
            <Modal open={!!reassignModal} onClose={() => setReassignModal(null)} title={reassignModal ? `Reassign ${reassignModal.role.replace(/_/g, " ")} — ${reassignModal.dept.name}` : ""} width={440}>
                {reassignModal && (
                    <div className="space-y-4">
                        {reassignMsg.text && (
                            <div className={`p-3 rounded-lg text-sm border ${reassignMsg.type === "success" ? "bg-[#E8F5E9] border-[#A5D6A7] text-[#1B5E20]" : "bg-[#FFEBEE] border-[#EF9A9A] text-[#D32F2F]"}`}>{reassignMsg.text}</div>
                        )}
                        <div className="relative">
                            <input
                                type="text"
                                placeholder="Search by name or emp code..."
                                value={reassignSearch}
                                onChange={e => setReassignSearch(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-ap-blue"
                                autoFocus
                            />
                        </div>
                        <div className="space-y-1 max-h-64 overflow-y-auto">
                            {reassignAllEmps.length === 0 && (
                                <p className="text-sm text-gray-400 italic text-center py-4">Loading employees…</p>
                            )}
                            {reassignAllEmps
                                .filter(e => {
                                    const q = reassignSearch.toLowerCase();
                                    return !q || e.name.toLowerCase().includes(q) || (e.empCode || "").toLowerCase().includes(q);
                                })
                                .map(e => {
                                    const selected = reassignTarget?.id === e.id;
                                    return (
                                        <button
                                            key={e.id}
                                            onClick={() => setReassignTarget(e)}
                                            className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors cursor-pointer ${selected ? "bg-ap-blue-50 border-ap-blue" : "bg-white border-ap-border hover:bg-gray-50"}`}
                                        >
                                            <p className={`text-sm font-semibold m-0 ${selected ? "text-ap-blue" : "text-gray-900"}`}>{e.name}</p>
                                            <p className="text-xs text-gray-500 m-0">{e.empCode ? `${e.empCode} · ` : ""}{e.department || "No dept"}{e.designation ? ` · ${e.designation}` : ""}</p>
                                        </button>
                                    );
                                })
                            }
                        </div>
                        <div className="flex gap-3 pt-1">
                            <button onClick={() => setReassignModal(null)} className="flex-1 py-2.5 border border-gray-300 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer">Cancel</button>
                            <button
                                onClick={handleReassign}
                                disabled={!reassignTarget || reassignLoading}
                                className="flex-1 py-2.5 bg-ap-blue hover:bg-ap-green text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                            >
                                {reassignLoading ? "Saving…" : reassignTarget ? `Assign ${reassignTarget.name.split(" ")[0]}` : "Select a person"}
                            </button>
                        </div>
                    </div>
                )}
            </Modal>

            {/* Person detail modal */}
            <Modal open={!!personDetail} onClose={() => setPersonDetail(null)} title="Employee Details" width={440}>
                {personDetail && (
                    <div className="space-y-4">
                        <div className="flex items-center gap-4">
                            <div className="h-14 w-14 rounded-full bg-ap-blue-50 flex items-center justify-center text-ap-blue font-bold text-xl border-2 border-[#90CAF9] shrink-0">
                                {personDetail.name?.charAt(0)?.toUpperCase()}
                            </div>
                            <div>
                                <p className="text-lg font-bold text-ap-blue m-0">{personDetail.name}</p>
                                {personDetail.mappedRole && (
                                    <span className="text-[10px] px-2 py-0.5 rounded-full border font-bold uppercase bg-gray-50 text-gray-600 border-gray-200">{personDetail.mappedRole.replace(/_/g, " ")}</span>
                                )}
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                            <div>
                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider m-0">Emp Code</p>
                                <p className="text-sm font-semibold text-gray-700 m-0">{personDetail.empCode || "—"}</p>
                            </div>
                            <div>
                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider m-0">Designation</p>
                                <p className="text-sm font-semibold text-gray-700 m-0">{personDetail.designation || "—"}</p>
                            </div>
                            <div>
                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider m-0">Mobile</p>
                                <p className="text-sm font-semibold text-gray-700 m-0">{personDetail.mobile ? <a href={`tel:${personDetail.mobile}`} className="text-ap-blue hover:underline">{personDetail.mobile}</a> : <span className="text-gray-300 italic">Not provided</span>}</p>
                            </div>
                        </div>
                        {personDetail.roles?.length > 0 && (
                            <div>
                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1.5 m-0">Roles</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {personDetail.roles.map(r => (
                                        <span key={r} className={`text-[10px] px-2 py-0.5 rounded-full border font-bold uppercase ${r === "EMPLOYEE" ? "bg-gray-50 text-gray-600 border-gray-200" : r === "BRANCH_MANAGER" ? "bg-emerald-50 text-ap-green border-emerald-200" : r === "CLUSTER_MANAGER" ? "bg-orange-50 text-ap-orange-700 border-orange-200" : "bg-ap-blue text-white border-ap-blue"}`}>{r.replace(/_/g, " ")}</span>
                                    ))}
                                </div>
                            </div>
                        )}
                        {personDetail.evaluatorRoles?.length > 0 && (
                            <div>
                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1.5 m-0">Evaluator Assignments</p>
                                <div className="space-y-1.5">
                                    {personDetail.evaluatorRoles.map((er, i) => (
                                        <div key={i} className="flex items-center gap-2">
                                            <span className="text-[9px] px-1.5 py-0.5 rounded border font-bold uppercase bg-emerald-50 text-ap-green border-emerald-200">{er.role.replace(/_/g, " ")}</span>
                                            <span className="text-xs text-gray-700">{er.department}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </Modal>

            {/* Remove employee modal */}
            <Modal open={!!removeId} onClose={() => { setRemoveId(null); setRemoveReason(""); }} title="Remove Employee" width={440}>
                <div className="space-y-4">
                    <p className="text-sm text-gray-500 m-0">This will archive the employee and remove them from all active lists, evaluations, and department mappings. This cannot be undone.</p>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">Reason for Leaving *</label>
                        <textarea value={removeReason} onChange={(e) => setRemoveReason(e.target.value)} placeholder="e.g. Resignation, Termination, Transfer" rows={3} className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm resize-none" />
                    </div>
                    <div className="flex gap-3 justify-end">
                        <button onClick={() => { setRemoveId(null); setRemoveReason(""); }} className="px-4 py-2 border border-ap-border rounded-lg text-sm font-bold text-gray-700 cursor-pointer">Cancel</button>
                        <button onClick={handleRemoveEmployee} disabled={removeLoading || !removeReason} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-bold hover:bg-red-700 cursor-pointer disabled:opacity-50">
                            {removeLoading ? "Removing..." : "Confirm Remove"}
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}
