"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import * as XLSX from "xlsx";

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

    // Add-employee panel state
    const [showAddEmp, setShowAddEmp] = useState(false);
    const [addForm, setAddForm] = useState({ name: "", mobile: "", departmentName: "", joiningDate: "", reason: "", empCode: "", designation: "" });
    const [addMsg, setAddMsg] = useState({ type: "", text: "" });
    const [addLoading, setAddLoading] = useState(false);

    // Bulk-upload panel state
    const [showBulkUpload, setShowBulkUpload] = useState(false);
    const [bulkFile, setBulkFile] = useState(null);
    const [bulkLoading, setBulkLoading] = useState(false);
    const [bulkResult, setBulkResult] = useState(null);
    const [bulkMsg, setBulkMsg] = useState({ type: "", text: "" });

    // Unique department names seen in the currently loaded employees — used
    // to populate the add-employee dropdown without another request.
    const deptNames = Array.from(new Set(
        employees.map(e => e.department?.name).filter(Boolean)
    )).sort();

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

    const handleAddEmployee = async () => {
        setAddLoading(true);
        setAddMsg({ type: "", text: "" });
        try {
            const d = await api(`/api/admin/branches/${branchId}/employees`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(addForm),
            });
            setAddMsg({ type: "success", text: `${d.employee.name} added. Default password: ${d.defaultPassword}` });
            setAddForm({ name: "", mobile: "", departmentName: "", joiningDate: "", reason: "", empCode: "", designation: "" });
            fetchEmployees();
        } catch (err) {
            setAddMsg({ type: "error", text: err.message || "Failed to add employee" });
        }
        setAddLoading(false);
    };

    const handleBulkUpload = async () => {
        if (!bulkFile) {
            setBulkMsg({ type: "error", text: "Please select an Excel file" });
            return;
        }
        setBulkLoading(true);
        setBulkMsg({ type: "", text: "" });
        setBulkResult(null);
        try {
            const fd = new FormData();
            fd.append("file", bulkFile);
            const data = await api(`/api/admin/branches/${branchId}/employees/bulk-upload`, { method: "POST", body: fd });
            setBulkResult(data);
            setBulkMsg({
                type: data.errors?.length ? "error" : "success",
                text: `Upload complete: ${data.employeesCreated} created, ${data.employeesUpdated} updated, ${data.departmentsCreated?.length || 0} new depts${data.errors?.length ? `, ${data.errors.length} errors` : ""}`,
            });
            setBulkFile(null);
            fetchEmployees();
        } catch (err) {
            setBulkMsg({ type: "error", text: err.message || "Bulk upload failed" });
        }
        setBulkLoading(false);
    };

    const downloadBulkTemplate = () => {
        const sampleRows = [
            { "Emp Code": "5100099", "Name": "Sample Name", "Department": "Production", "Designation": "Operator", "Mobile": "9876543210", "Collar Type": "BLUE_COLLAR" },
        ];
        const ws = XLSX.utils.json_to_sheet(sampleRows);
        ws["!cols"] = [{ wch: 12 }, { wch: 25 }, { wch: 20 }, { wch: 20 }, { wch: 14 }, { wch: 14 }];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Employees");
        XLSX.writeFile(wb, "Employee_Upload_Template.xlsx");
    };

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
            <div className="flex items-center justify-between flex-wrap gap-2">
                <h2 className="text-lg font-bold text-[#003087]">Employees ({filtered.length})</h2>
                <div className="flex flex-wrap gap-2">
                    <button onClick={() => { setShowAddEmp(!showAddEmp); setAddMsg({ type: "", text: "" }); }} className="h-9 px-3 bg-[#00843D] hover:bg-[#006B32] text-white text-xs font-bold rounded-lg cursor-pointer">
                        {showAddEmp ? "Cancel" : "+ Add Employee"}
                    </button>
                    <button onClick={() => { setShowBulkUpload(!showBulkUpload); setBulkMsg({ type: "", text: "" }); setBulkResult(null); }} className="h-9 px-3 bg-[#F7941D] hover:bg-[#D87A0A] text-white text-xs font-bold rounded-lg cursor-pointer">
                        {showBulkUpload ? "Cancel" : "Bulk Upload"}
                    </button>
                    <button onClick={fetchEmployees} className="h-9 px-3 bg-white border border-[#CCCCCC] rounded-lg text-xs font-bold text-[#333] hover:bg-[#F5F5F5] cursor-pointer">
                        Refresh
                    </button>
                </div>
            </div>

            {/* Add Employee Panel */}
            {showAddEmp && (
                <div className="bg-white border border-[#E0E0E0] rounded-xl p-5 shadow-sm space-y-4">
                    <h3 className="text-base font-bold text-[#003087]">Add New Employee{branch?.name ? ` — ${branch.name}` : ""}</h3>
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
                                {deptNames.map(d => <option key={d} value={d}>{d}</option>)}
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
                    <button onClick={handleAddEmployee} disabled={addLoading || !addForm.name || !addForm.departmentName} className="px-6 py-2 bg-[#003087] text-white rounded-lg text-sm font-bold hover:bg-[#002266] transition-colors cursor-pointer disabled:opacity-50">
                        {addLoading ? "Adding..." : "Add Employee"}
                    </button>
                </div>
            )}

            {/* Bulk Upload Panel */}
            {showBulkUpload && (
                <div className="bg-white border border-[#E0E0E0] rounded-xl p-5 shadow-sm space-y-4">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                        <h3 className="text-base font-bold text-[#003087]">Bulk Upload Employees{branch?.name ? ` — ${branch.name}` : ""}</h3>
                        <button onClick={downloadBulkTemplate} className="text-xs px-3 py-1.5 bg-[#F5F5F5] border border-[#CCCCCC] rounded-lg font-bold text-[#333333] hover:bg-white cursor-pointer">
                            Download Template
                        </button>
                    </div>
                    <div className="text-xs text-[#666666] bg-[#F5F5F5] border border-[#E0E0E0] rounded-lg p-3 space-y-1">
                        <p className="font-bold text-[#003087]">Required columns: Emp Code, Name, Department, Collar Type</p>
                        <p>Optional: Designation, Mobile. Collar Type must be WHITE_COLLAR or BLUE_COLLAR.</p>
                        <p>Uploads are scoped to this branch; missing departments are created here.</p>
                        <p>Default password: <code className="bg-white px-1 rounded">empCode</code> (employee can change after first login).</p>
                    </div>
                    {bulkMsg.text && (
                        <div className={`p-3 rounded-lg text-sm font-medium ${bulkMsg.type === "success" ? "bg-green-50 text-green-800 border border-green-200" : "bg-red-50 text-red-800 border border-red-200"}`}>{bulkMsg.text}</div>
                    )}
                    <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                        <input
                            type="file"
                            accept=".xlsx,.xls"
                            onChange={(e) => setBulkFile(e.target.files?.[0] || null)}
                            className="flex-1 text-sm file:mr-3 file:px-4 file:py-2 file:rounded-lg file:border-0 file:bg-[#003087] file:text-white file:font-bold file:cursor-pointer hover:file:bg-[#002266]"
                        />
                        <button
                            onClick={handleBulkUpload}
                            disabled={bulkLoading || !bulkFile}
                            className="px-6 py-2 bg-[#F7941D] text-white rounded-lg text-sm font-bold hover:bg-[#D87A0A] transition-colors cursor-pointer disabled:opacity-50"
                        >
                            {bulkLoading ? "Uploading..." : "Upload & Create"}
                        </button>
                    </div>
                    {bulkResult && (
                        <div className="mt-3 space-y-3">
                            <div className="grid grid-cols-3 gap-2 text-center">
                                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                                    <div className="text-2xl font-bold text-green-700">{bulkResult.employeesCreated}</div>
                                    <div className="text-[11px] text-green-700 font-bold uppercase tracking-wider">Created</div>
                                </div>
                                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                                    <div className="text-2xl font-bold text-amber-700">{bulkResult.employeesUpdated}</div>
                                    <div className="text-[11px] text-amber-700 font-bold uppercase tracking-wider">Updated</div>
                                </div>
                                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                                    <div className="text-2xl font-bold text-red-700">{bulkResult.errors?.length || 0}</div>
                                    <div className="text-[11px] text-red-700 font-bold uppercase tracking-wider">Errors</div>
                                </div>
                            </div>
                            {bulkResult.errors?.length > 0 && (
                                <div className="max-h-40 overflow-y-auto bg-red-50 border border-red-200 rounded-lg p-3">
                                    <p className="text-xs font-bold text-red-800 mb-1">Errors:</p>
                                    <ul className="text-[11px] text-red-700 space-y-0.5">
                                        {bulkResult.errors.slice(0, 50).map((e, i) => <li key={i}>{e}</li>)}
                                    </ul>
                                </div>
                            )}
                            {bulkResult.departmentsCreated?.length > 0 && (
                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                                    <p className="text-xs font-bold text-blue-800 mb-1">New departments created:</p>
                                    <p className="text-[11px] text-blue-700">{bulkResult.departmentsCreated.join(", ")}</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

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
