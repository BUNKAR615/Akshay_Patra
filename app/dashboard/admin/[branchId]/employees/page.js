"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import ConfirmDialog from "../../../../../components/ConfirmDialog";

const ROLE_OPTIONS = ["EMPLOYEE", "SUPERVISOR", "HOD", "BRANCH_MANAGER", "CLUSTER_MANAGER", "HR", "COMMITTEE"];

function fmtDate(d) {
    if (!d) return "—";
    try {
        return new Date(d).toLocaleString();
    } catch { return String(d); }
}

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
    const router = useRouter();
    const searchParams = useSearchParams();
    const departmentIdFilter = searchParams.get("departmentId") || "";
    const departmentNameFilter = searchParams.get("departmentName") || "";

    const tab = searchParams.get("tab") || "active";   // "active" | "removed" | "history"

    const [employees, setEmployees] = useState([]);
    const [branch, setBranch] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [search, setSearch] = useState("");
    const [roleFilter, setRoleFilter] = useState("");

    // Sorting + view-mode + pagination state for the Active tab
    const [sortBy, setSortBy] = useState("name");      // "name" | "empCode"
    const [sortDir, setSortDir] = useState("asc");     // "asc" | "desc"
    const [viewMode, setViewMode] = useState("grid");  // "grid" | "list"
    const [page, setPage] = useState(1);
    const PAGE_SIZE = 100;

    // Edit-employee panel state
    const [editId, setEditId] = useState(null);
    const [editForm, setEditForm] = useState({ name: "", empCode: "", mobile: "", role: "EMPLOYEE", designation: "", departmentId: "", collarType: "" });
    const [editMsg, setEditMsg] = useState({ type: "", text: "" });
    const [editLoading, setEditLoading] = useState(false);
    const [allDepartments, setAllDepartments] = useState([]);

    // Remove-employee dialog state
    const [removeTarget, setRemoveTarget] = useState(null);
    const [removeReason, setRemoveReason] = useState("");
    const [removeLoading, setRemoveLoading] = useState(false);

    // Removed + History tab data
    const [archived, setArchived] = useState([]);
    const [history, setHistory] = useState([]);
    const [tabLoading, setTabLoading] = useState(false);

    const setTab = (next) => {
        const params = new URLSearchParams(searchParams.toString());
        if (next === "active") params.delete("tab"); else params.set("tab", next);
        router.push(`/dashboard/admin/${branchId}/employees${params.toString() ? `?${params}` : ""}`);
    };

    // Add-employee panel state
    const [showAddEmp, setShowAddEmp] = useState(false);
    const [addForm, setAddForm] = useState({ name: "", mobile: "", departmentName: "", joiningDate: "", reason: "", empCode: "", designation: "", collarType: "" });
    const [addMsg, setAddMsg] = useState({ type: "", text: "" });
    const [addLoading, setAddLoading] = useState(false);

    // Bulk-upload panel state
    const [showBulkUpload, setShowBulkUpload] = useState(false);
    const [bulkFile, setBulkFile] = useState(null);
    const [bulkLoading, setBulkLoading] = useState(false);
    const [bulkResult, setBulkResult] = useState(null);
    const [bulkMsg, setBulkMsg] = useState({ type: "", text: "" });
    const [bulkReplaceMode, setBulkReplaceMode] = useState(false);
    const [showReplaceConfirm, setShowReplaceConfirm] = useState(false);

    // Unique department names seen in the currently loaded employees — used
    // to populate the add-employee dropdown without another request.
    const deptNames = Array.from(new Set(
        employees.map(e => e.department?.name).filter(Boolean)
    )).sort();

    const fetchEmployees = async () => {
        try {
            const qs = new URLSearchParams();
            if (roleFilter) qs.set("role", roleFilter);
            if (departmentIdFilter) qs.set("departmentId", departmentIdFilter);
            const url = `/api/admin/branches/${branchId}/employees${qs.toString() ? `?${qs}` : ""}`;
            const data = await api(url);
            setEmployees(data.employees || []);
            setBranch(data.branch);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchEmployees(); }, [branchId, roleFilter, departmentIdFilter]);

    const clearDepartmentFilter = () => {
        router.push(`/dashboard/admin/${branchId}/employees`);
    };

    // Branch departments — fetched once for the Edit form's dept dropdown
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const data = await api(`/api/admin/branches/${branchId}/departments`);
                if (!cancelled) setAllDepartments(data.departments || []);
            } catch { /* non-fatal */ }
        })();
        return () => { cancelled = true; };
    }, [branchId]);

    // Removed + History fetches (per active tab)
    useEffect(() => {
        if (tab === "active") return;
        let cancelled = false;
        (async () => {
            setTabLoading(true);
            try {
                if (tab === "removed") {
                    const data = await api(`/api/admin/employees/archived?branchId=${branchId}`);
                    if (!cancelled) setArchived(data.archived || []);
                } else if (tab === "history") {
                    const data = await api(`/api/admin/employees/history?branchId=${branchId}&limit=200`);
                    if (!cancelled) setHistory(data.history || []);
                }
            } catch (e) {
                if (!cancelled) setError(e.message);
            } finally {
                if (!cancelled) setTabLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [tab, branchId]);

    const openEdit = (emp) => {
        setEditId(emp.id);
        setEditForm({
            name: emp.name || "",
            empCode: emp.empCode || "",
            mobile: emp.mobile || "",
            role: emp.role || "EMPLOYEE",
            designation: emp.designation || "",
            departmentId: emp.departmentId || "",
            collarType: emp.collarType || "",
        });
        setEditMsg({ type: "", text: "" });
    };

    const handleEditSubmit = async () => {
        if (!editId) return;
        setEditLoading(true);
        setEditMsg({ type: "", text: "" });
        try {
            const payload = {
                mobile: editForm.mobile,
                role: editForm.role,
                designation: editForm.designation,
                departmentId: editForm.departmentId || undefined,
                collarType: editForm.collarType || null,
            };
            const data = await api(`/api/admin/employees/${editId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            setEditMsg({ type: "success", text: data.message || "Employee updated" });
            setEditId(null);
            fetchEmployees();
        } catch (err) {
            setEditMsg({ type: "error", text: err.message || "Update failed" });
        }
        setEditLoading(false);
    };

    const handleRemoveConfirm = async () => {
        if (!removeTarget || !removeReason.trim()) return;
        setRemoveLoading(true);
        try {
            await api(`/api/admin/employees/${removeTarget.id}`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ reasonLeaving: removeReason.trim() }),
            });
            setRemoveTarget(null);
            setRemoveReason("");
            fetchEmployees();
        } catch (err) {
            alert(err.message || "Remove failed");
        }
        setRemoveLoading(false);
    };

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
            setAddForm({ name: "", mobile: "", departmentName: "", joiningDate: "", reason: "", empCode: "", designation: "", collarType: "" });
            fetchEmployees();
        } catch (err) {
            setAddMsg({ type: "error", text: err.message || "Failed to add employee" });
        }
        setAddLoading(false);
    };

    const submitBulkUpload = async () => {
        setBulkLoading(true);
        setBulkMsg({ type: "", text: "" });
        setBulkResult(null);
        try {
            const fd = new FormData();
            fd.append("file", bulkFile);
            if (bulkReplaceMode) fd.append("mode", "replace");
            const data = await api(`/api/admin/branches/${branchId}/employees/bulk-upload`, { method: "POST", body: fd });
            setBulkResult(data);
            const archivedCount = data.archivedEmployees?.length || 0;
            const removedDeptCount = data.removedDepartments?.length || 0;
            const replaceSuffix = data.mode === "replace"
                ? `, ${archivedCount} archived, ${removedDeptCount} depts removed`
                : "";
            setBulkMsg({
                type: data.errors?.length ? "error" : "success",
                text: `Upload complete: ${data.employeesCreated} created, ${data.employeesUpdated} updated, ${data.departmentsCreated?.length || 0} new depts${replaceSuffix}${data.errors?.length ? `, ${data.errors.length} errors` : ""}`,
            });
            setBulkFile(null);
            setBulkReplaceMode(false);
            fetchEmployees();
        } catch (err) {
            setBulkMsg({ type: "error", text: err.message || "Bulk upload failed" });
        }
        setBulkLoading(false);
    };

    const handleBulkUpload = () => {
        if (!bulkFile) {
            setBulkMsg({ type: "error", text: "Please select an Excel file" });
            return;
        }
        if (bulkReplaceMode) {
            setShowReplaceConfirm(true);
            return;
        }
        submitBulkUpload();
    };

    const downloadBulkTemplate = async () => {
        const XLSX = await import("xlsx");
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

    // Sort filtered employees by name or empCode, asc or desc. `numeric: true`
    // makes empCodes like 5100001/5100010 sort numerically, not lexically.
    const sorted = [...filtered].sort((a, b) => {
        const av = (sortBy === "empCode" ? a.empCode : a.name) || "";
        const bv = (sortBy === "empCode" ? b.empCode : b.name) || "";
        const cmp = av.localeCompare(bv, undefined, { numeric: true, sensitivity: "base" });
        return sortDir === "asc" ? cmp : -cmp;
    });

    // List view paginates at 100; grid view renders the full sorted set.
    const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
    const safePage = Math.min(Math.max(1, page), totalPages);
    const pageStart = (safePage - 1) * PAGE_SIZE;
    const pageEnd = Math.min(pageStart + PAGE_SIZE, sorted.length);
    const visible = viewMode === "list" ? sorted.slice(pageStart, pageEnd) : sorted;

    // Reset to page 1 whenever a filter/sort/view change reshapes the list.
    useEffect(() => { setPage(1); }, [search, roleFilter, sortBy, sortDir, viewMode, departmentIdFilter]);

    if (loading) return <div className="text-center py-12 text-gray-500">Loading employees...</div>;
    if (error) return <div className="p-4 bg-red-50 text-red-700 rounded-lg font-medium">{error}</div>;

    const TabStrip = (
        <div className="flex gap-1 border-b border-[#E0E0E0]">
            {[
                { id: "active",  label: "Active" },
                { id: "removed", label: "Removed" },
                { id: "history", label: "Change history" },
            ].map(t => (
                <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={`px-4 py-2 text-sm font-bold border-b-2 transition-colors -mb-[2px] cursor-pointer ${
                        tab === t.id
                            ? "border-[#003087] text-[#003087]"
                            : "border-transparent text-[#666] hover:text-[#003087] hover:border-[#003087]/40"
                    }`}
                >
                    {t.label}
                </button>
            ))}
        </div>
    );

    return (
        <div className="space-y-4">
            {departmentIdFilter && tab === "active" && (
                <div className="flex items-center justify-between gap-2 p-3 bg-[#EEF3FB] border border-[#003087]/20 rounded-lg">
                    <div className="text-sm">
                        <span className="text-[#666]">Department:</span>{" "}
                        <span className="font-bold text-[#003087]">{departmentNameFilter || "Selected department"}</span>
                        <span className="text-[#666] ml-2">({filtered.length} employee{filtered.length === 1 ? "" : "s"})</span>
                    </div>
                    <button
                        onClick={clearDepartmentFilter}
                        className="px-3 py-1.5 bg-white border border-[#CCCCCC] rounded-lg text-xs font-bold text-[#333] hover:bg-[#F5F5F5] cursor-pointer"
                    >
                        Show all employees
                    </button>
                </div>
            )}

            {TabStrip}

            {tab === "active" && (<>
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
                            <label className="block text-xs font-bold text-[#666666] mb-1">Category</label>
                            <select value={addForm.collarType} onChange={(e) => setAddForm({ ...addForm, collarType: e.target.value })} className="w-full h-10 px-3 bg-[#F5F5F5] border border-[#CCCCCC] rounded-lg text-sm">
                                <option value="">Use department default</option>
                                <option value="BLUE_COLLAR">Blue-collar</option>
                                <option value="WHITE_COLLAR">White-collar</option>
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
                    <label className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-300 rounded-lg cursor-pointer">
                        <input
                            type="checkbox"
                            checked={bulkReplaceMode}
                            onChange={(e) => setBulkReplaceMode(e.target.checked)}
                            className="mt-0.5"
                        />
                        <span className="text-xs text-amber-900">
                            <span className="font-bold block">Replace branch data (destructive)</span>
                            Archive every active employee not in this file, and delete every department not in this file. Role-holders (BM/CM/HR/Committee/Admin) are preserved. Use this only when the uploaded sheet is the complete source of truth for {branch?.name || "this branch"}.
                        </span>
                    </label>
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
                            {bulkResult.archivedEmployees?.length > 0 && (
                                <div className="bg-amber-50 border border-amber-300 rounded-lg p-3">
                                    <p className="text-xs font-bold text-amber-900 mb-1">Archived ({bulkResult.archivedEmployees.length}) — not in this file:</p>
                                    <p className="text-[11px] text-amber-800 max-h-24 overflow-y-auto">
                                        {bulkResult.archivedEmployees.map(a => `${a.empCode} ${a.name}`).join(", ")}
                                    </p>
                                </div>
                            )}
                            {bulkResult.removedDepartments?.length > 0 && (
                                <div className="bg-red-50 border border-red-300 rounded-lg p-3">
                                    <p className="text-xs font-bold text-red-800 mb-1">Departments removed ({bulkResult.removedDepartments.length}) — not in this file:</p>
                                    <p className="text-[11px] text-red-700">
                                        {bulkResult.removedDepartments.map(d => `${d.name} (${d.collarType})`).join(", ")}
                                    </p>
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
                    <option value="">All Employees</option>
                    <option value="BRANCH_MANAGER">Branch Manager</option>
                    {branch?.branchType !== "SMALL" && <option value="HOD">HODs</option>}
                    <option value="CLUSTER_MANAGER">Cluster Manager</option>
                    <option value="HR">HR Personnel</option>
                    <option value="COMMITTEE">Committee</option>
                </select>
                <select
                    value={`${sortBy}|${sortDir}`}
                    onChange={e => {
                        const [by, dir] = e.target.value.split("|");
                        setSortBy(by);
                        setSortDir(dir);
                    }}
                    className="border rounded-lg px-3 py-2 text-sm"
                    title="Sort employees"
                >
                    <option value="name|asc">Name (A–Z)</option>
                    <option value="name|desc">Name (Z–A)</option>
                    <option value="empCode|asc">Emp code (asc)</option>
                    <option value="empCode|desc">Emp code (desc)</option>
                </select>
                <div className="inline-flex rounded-lg border border-[#CCCCCC] overflow-hidden">
                    <button
                        onClick={() => setViewMode("grid")}
                        className={`px-3 py-2 text-xs font-bold cursor-pointer ${viewMode === "grid" ? "bg-[#003087] text-white" : "bg-white text-[#333] hover:bg-[#F5F5F5]"}`}
                        title="Grid view"
                    >
                        Grid
                    </button>
                    <button
                        onClick={() => setViewMode("list")}
                        className={`px-3 py-2 text-xs font-bold border-l border-[#CCCCCC] cursor-pointer ${viewMode === "list" ? "bg-[#003087] text-white" : "bg-white text-[#333] hover:bg-[#F5F5F5]"}`}
                        title="List view"
                    >
                        List
                    </button>
                </div>
            </div>

            {/* Edit Employee Panel — opens when an Edit button on a card is clicked */}
            {editId && (
                <div className="bg-white border border-[#003087] rounded-xl p-5 shadow-sm space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-base font-bold text-[#003087]">Edit Employee — {editForm.name}</h3>
                        <button onClick={() => setEditId(null)} className="text-xs px-3 py-1.5 bg-gray-100 border border-gray-200 rounded-lg font-bold text-[#333] hover:bg-gray-200 cursor-pointer">
                            Close
                        </button>
                    </div>
                    {editMsg.text && (
                        <div className={`p-3 rounded-lg text-sm font-medium ${editMsg.type === "success" ? "bg-green-50 text-green-800 border border-green-200" : "bg-red-50 text-red-800 border border-red-200"}`}>{editMsg.text}</div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-[#666666] mb-1">Name (locked)</label>
                            <input type="text" value={editForm.name} disabled className="w-full h-10 px-3 bg-[#EEEEEE] border border-[#CCCCCC] rounded-lg text-sm text-[#666] cursor-not-allowed" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-[#666666] mb-1">Employee Code (locked)</label>
                            <input type="text" value={editForm.empCode} disabled className="w-full h-10 px-3 bg-[#EEEEEE] border border-[#CCCCCC] rounded-lg text-sm text-[#666] cursor-not-allowed" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-[#666666] mb-1">Mobile Number</label>
                            <input type="text" value={editForm.mobile} onChange={(e) => setEditForm({ ...editForm, mobile: e.target.value })} placeholder="Phone number" className="w-full h-10 px-3 bg-[#F5F5F5] border border-[#CCCCCC] rounded-lg text-sm" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-[#666666] mb-1">Role <span className="text-[#003087]">(switch role)</span></label>
                            <select value={editForm.role} onChange={(e) => setEditForm({ ...editForm, role: e.target.value })} className="w-full h-10 px-3 bg-[#F5F5F5] border border-[#CCCCCC] rounded-lg text-sm">
                                {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-[#666666] mb-1">Department <span className="text-[#003087]">(switch dept)</span></label>
                            <select value={editForm.departmentId} onChange={(e) => setEditForm({ ...editForm, departmentId: e.target.value })} className="w-full h-10 px-3 bg-[#F5F5F5] border border-[#CCCCCC] rounded-lg text-sm">
                                <option value="">— None —</option>
                                {allDepartments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-[#666666] mb-1">Category</label>
                            <select value={editForm.collarType} onChange={(e) => setEditForm({ ...editForm, collarType: e.target.value })} className="w-full h-10 px-3 bg-[#F5F5F5] border border-[#CCCCCC] rounded-lg text-sm">
                                <option value="">— Not set —</option>
                                <option value="BLUE_COLLAR">Blue-collar</option>
                                <option value="WHITE_COLLAR">White-collar</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-[#666666] mb-1">Designation</label>
                            <input type="text" value={editForm.designation} onChange={(e) => setEditForm({ ...editForm, designation: e.target.value })} placeholder="e.g. Executive" className="w-full h-10 px-3 bg-[#F5F5F5] border border-[#CCCCCC] rounded-lg text-sm" />
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={handleEditSubmit} disabled={editLoading} className="px-6 py-2 bg-[#003087] text-white rounded-lg text-sm font-bold hover:bg-[#002266] transition-colors cursor-pointer disabled:opacity-50">
                            {editLoading ? "Saving…" : "Save changes"}
                        </button>
                        <button onClick={() => setEditId(null)} disabled={editLoading} className="px-6 py-2 bg-white border border-[#CCCCCC] rounded-lg text-sm font-bold text-[#333] hover:bg-[#F5F5F5] cursor-pointer disabled:opacity-50">
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* Employee cards — single-page layout, no horizontal scroll. Stacks
                 1-up on phones, 2-up on tablet, 3-up on desktop. Every field
                 (empCode, name, department, designation, role, collar, mobile)
                 is visible inside the card without overflow. */}
            {sorted.length === 0 ? (
                <div className="bg-white border border-[#E0E0E0] rounded-xl text-center py-8 text-gray-500 text-sm">
                    No employees found.
                </div>
            ) : viewMode === "grid" ? (
                <div className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
                    {visible.map(emp => (
                        <div
                            key={emp.id}
                            className="bg-white border border-[#E0E0E0] rounded-xl p-4 hover:border-[#003087]/40 hover:shadow-sm transition-colors flex flex-col gap-3 min-w-0"
                        >
                            {/* Card header: empCode + name + role/collar badges */}
                            <div className="flex items-start justify-between gap-3 min-w-0">
                                <div className="min-w-0 flex-1">
                                    <div className="font-mono text-[11px] font-bold text-[#003087] mb-0.5">
                                        {emp.empCode || "—"}
                                    </div>
                                    <div className="font-bold text-[#1a1a1a] text-sm break-words">
                                        {emp.name}
                                    </div>
                                </div>
                                <div className="flex flex-col items-end gap-1 shrink-0">
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${ROLE_COLORS[emp.role] || "bg-gray-100 text-gray-700"}`}>
                                        {emp.role}
                                    </span>
                                    {emp.collarType && (
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${emp.collarType === "WHITE_COLLAR" ? "bg-gray-100 text-gray-600" : "bg-blue-50 text-blue-600"}`}>
                                            {emp.collarType === "WHITE_COLLAR" ? "White Collar" : "Blue Collar"}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Card body: labeled fields, all visible inline */}
                            <dl className="grid grid-cols-[88px_1fr] gap-x-3 gap-y-1.5 text-[12px] min-w-0">
                                <dt className="text-[#999] font-bold uppercase tracking-wide text-[10px] self-center">Department</dt>
                                <dd className="text-[#333] break-words min-w-0">{emp.department?.name || "—"}</dd>

                                <dt className="text-[#999] font-bold uppercase tracking-wide text-[10px] self-center">Designation</dt>
                                <dd className="text-[#333] break-words min-w-0">{emp.designation || "—"}</dd>

                                <dt className="text-[#999] font-bold uppercase tracking-wide text-[10px] self-center">Mobile</dt>
                                <dd className="text-[#333] break-all min-w-0">{emp.mobile || "—"}</dd>
                            </dl>

                            {/* Card footer: action buttons */}
                            <div className="pt-1 grid grid-cols-3 gap-1.5">
                                <button
                                    onClick={() => openEdit(emp)}
                                    className="px-2 py-1.5 text-[11px] font-bold rounded bg-[#003087] hover:bg-[#002266] text-white cursor-pointer"
                                >
                                    Edit
                                </button>
                                <button
                                    onClick={() => { setRemoveTarget(emp); setRemoveReason(""); }}
                                    disabled={emp.role === "ADMIN"}
                                    className="px-2 py-1.5 text-[11px] font-bold rounded bg-white border border-[#D32F2F] text-[#D32F2F] hover:bg-[#FDECEC] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                                    title={emp.role === "ADMIN" ? "Admin users cannot be removed" : ""}
                                >
                                    Remove
                                </button>
                                <button
                                    onClick={() => handleResetPassword(emp)}
                                    disabled={resettingId === emp.id}
                                    className="px-2 py-1.5 text-[11px] font-bold rounded bg-white border border-[#CCCCCC] text-[#333] hover:bg-[#F5F5F5] disabled:opacity-50 cursor-pointer"
                                >
                                    {resettingId === emp.id ? "Resetting…" : "Reset pwd"}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="bg-white border border-[#E0E0E0] rounded-xl overflow-hidden">
                    <div className="hidden md:grid grid-cols-[110px_1fr_1fr_1fr_1fr_220px] gap-3 px-4 py-2 bg-[#F8F8F8] border-b border-[#E0E0E0] text-[10px] font-bold uppercase tracking-wide text-[#999]">
                        <div>Emp Code</div>
                        <div>Name</div>
                        <div>Department</div>
                        <div>Designation</div>
                        <div>Mobile</div>
                        <div className="text-right">Actions</div>
                    </div>
                    <div className="divide-y divide-[#F0F0F0]">
                        {visible.map(emp => (
                            <div
                                key={emp.id}
                                className="px-4 py-3 grid grid-cols-1 md:grid-cols-[110px_1fr_1fr_1fr_1fr_220px] gap-3 text-sm items-center hover:bg-[#F9FAFB] min-w-0"
                            >
                                <div className="font-mono text-[12px] font-bold text-[#003087]">{emp.empCode || "—"}</div>
                                <div className="min-w-0">
                                    <div className="font-bold text-[#1a1a1a] break-words">{emp.name}</div>
                                    <div className="flex flex-wrap gap-1 mt-1">
                                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${ROLE_COLORS[emp.role] || "bg-gray-100 text-gray-700"}`}>
                                            {emp.role}
                                        </span>
                                        {emp.collarType && (
                                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${emp.collarType === "WHITE_COLLAR" ? "bg-gray-100 text-gray-600" : "bg-blue-50 text-blue-600"}`}>
                                                {emp.collarType === "WHITE_COLLAR" ? "White Collar" : "Blue Collar"}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="text-[#333] break-words min-w-0">
                                    <span className="md:hidden text-[10px] text-[#999] font-bold uppercase block">Department</span>
                                    {emp.department?.name || "—"}
                                </div>
                                <div className="text-[#333] break-words min-w-0">
                                    <span className="md:hidden text-[10px] text-[#999] font-bold uppercase block">Designation</span>
                                    {emp.designation || "—"}
                                </div>
                                <div className="text-[#333] break-all min-w-0">
                                    <span className="md:hidden text-[10px] text-[#999] font-bold uppercase block">Mobile</span>
                                    {emp.mobile || "—"}
                                </div>
                                <div className="flex flex-wrap gap-1.5 md:justify-end">
                                    <button
                                        onClick={() => openEdit(emp)}
                                        className="px-2 py-1.5 text-[11px] font-bold rounded bg-[#003087] hover:bg-[#002266] text-white cursor-pointer"
                                    >
                                        Edit
                                    </button>
                                    <button
                                        onClick={() => { setRemoveTarget(emp); setRemoveReason(""); }}
                                        disabled={emp.role === "ADMIN"}
                                        className="px-2 py-1.5 text-[11px] font-bold rounded bg-white border border-[#D32F2F] text-[#D32F2F] hover:bg-[#FDECEC] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                                        title={emp.role === "ADMIN" ? "Admin users cannot be removed" : ""}
                                    >
                                        Remove
                                    </button>
                                    <button
                                        onClick={() => handleResetPassword(emp)}
                                        disabled={resettingId === emp.id}
                                        className="px-2 py-1.5 text-[11px] font-bold rounded bg-white border border-[#CCCCCC] text-[#333] hover:bg-[#F5F5F5] disabled:opacity-50 cursor-pointer"
                                    >
                                        {resettingId === emp.id ? "Resetting…" : "Reset pwd"}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {viewMode === "list" && sorted.length > 0 && totalPages > 1 && (
                <div className="flex items-center justify-between flex-wrap gap-2 px-1">
                    <div className="text-xs text-[#666]">
                        Showing <span className="font-bold text-[#333]">{pageStart + 1}</span>–<span className="font-bold text-[#333]">{pageEnd}</span> of <span className="font-bold text-[#333]">{sorted.length}</span>
                        <span className="text-[#999]"> · Page {safePage} of {totalPages}</span>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={safePage <= 1}
                            className="h-9 px-3 bg-white border border-[#CCCCCC] rounded-lg text-xs font-bold text-[#333] hover:bg-[#F5F5F5] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                        >
                            ← Prev
                        </button>
                        <button
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            disabled={safePage >= totalPages}
                            className="h-9 px-3 bg-white border border-[#CCCCCC] rounded-lg text-xs font-bold text-[#333] hover:bg-[#F5F5F5] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                        >
                            Next →
                        </button>
                    </div>
                </div>
            )}
            </>)}

            {/* ── Removed tab ─────────────────────────────────────────────── */}
            {tab === "removed" && (
                <div className="bg-white border border-[#E0E0E0] rounded-xl overflow-hidden">
                    <div className="p-4 border-b border-[#E0E0E0]">
                        <h3 className="text-base font-bold text-[#003087]">Removed Employees ({archived.length})</h3>
                        <p className="text-xs text-[#666]">Employees archived from this branch's departments. Newest first.</p>
                    </div>
                    {tabLoading ? (
                        <div className="text-center py-8 text-gray-500 text-sm">Loading…</div>
                    ) : archived.length === 0 ? (
                        <div className="text-center py-8 text-gray-500 text-sm">No removed employees.</div>
                    ) : (
                        <div className="divide-y divide-[#F0F0F0]">
                            {archived.map(a => (
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
            )}

            {/* ── History tab ─────────────────────────────────────────────── */}
            {tab === "history" && (
                <div className="bg-white border border-[#E0E0E0] rounded-xl overflow-hidden">
                    <div className="p-4 border-b border-[#E0E0E0]">
                        <h3 className="text-base font-bold text-[#003087]">Department / Role Change History ({history.length})</h3>
                        <p className="text-xs text-[#666]">Every recorded change touching this branch (incoming or outgoing). Newest first.</p>
                    </div>
                    {tabLoading ? (
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
            )}

            {/* ── Replace-mode confirmation dialog ─────────────────────────── */}
            <ConfirmDialog
                open={showReplaceConfirm}
                title={`Replace ${branch?.name || "branch"} data?`}
                message={
                    <div className="space-y-2 text-sm text-[#333]">
                        <p>
                            This will treat <span className="font-bold">{bulkFile?.name || "the uploaded file"}</span> as the complete source of truth for <span className="font-bold">{branch?.name || "this branch"}</span>.
                        </p>
                        <ul className="list-disc list-inside text-[13px] space-y-1">
                            <li>Active employees (EMPLOYEE / HOD) not in the file will be archived.</li>
                            <li>Departments not in the file will be deleted.</li>
                            <li>Role-holders (BM, CM, HR, Committee, Admin) are preserved.</li>
                        </ul>
                        <p className="text-[12px] text-[#666]">Archived employees move to the <span className="font-bold">Removed</span> tab and can be reviewed there.</p>
                    </div>
                }
                confirmLabel="Replace branch data"
                cancelLabel="Cancel"
                variant="danger"
                loading={bulkLoading}
                onConfirm={() => { setShowReplaceConfirm(false); submitBulkUpload(); }}
                onCancel={() => { if (!bulkLoading) setShowReplaceConfirm(false); }}
            />

            {/* ── Remove confirmation dialog ──────────────────────────────── */}
            <ConfirmDialog
                open={!!removeTarget}
                title={removeTarget ? `Remove ${removeTarget.name}?` : ""}
                message={
                    <div className="space-y-3">
                        <p className="text-sm text-[#333]">
                            This will archive <span className="font-bold">{removeTarget?.empCode}</span> and remove them from the active employee list. The audit record stays in the Removed tab.
                        </p>
                        <div>
                            <label className="block text-xs font-bold text-[#666] mb-1">Reason for removal *</label>
                            <input
                                value={removeReason}
                                onChange={(e) => setRemoveReason(e.target.value)}
                                placeholder="e.g. Resigned, Transferred, Termination"
                                className="w-full h-10 px-3 bg-[#F5F5F5] border border-[#CCCCCC] rounded-lg text-sm"
                            />
                        </div>
                    </div>
                }
                confirmLabel="Remove employee"
                cancelLabel="Cancel"
                variant="danger"
                loading={removeLoading}
                onConfirm={handleRemoveConfirm}
                onCancel={() => { if (!removeLoading) { setRemoveTarget(null); setRemoveReason(""); } }}
            />
        </div>
    );
}
