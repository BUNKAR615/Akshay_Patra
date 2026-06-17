"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "../../../../lib/clientApi";
import DataTable from "../../../../components/ui/DataTable";
import { Modal, Drawer, SearchInput, useToast } from "../../../../components/ui";

const ROLE_BADGE = (r) =>
    r === "EMPLOYEE" ? "bg-gray-50 text-gray-700 border-gray-200"
    : r === "SUPERVISOR" ? "bg-blue-50 text-ap-blue border-blue-200"
    : r === "HOD" ? "bg-purple-50 text-purple-700 border-purple-200"
    : r === "BRANCH_MANAGER" ? "bg-emerald-50 text-ap-green border-emerald-200"
    : r === "CLUSTER_MANAGER" ? "bg-orange-50 text-ap-orange-700 border-orange-200"
    : r === "HR" ? "bg-amber-50 text-amber-700 border-amber-200"
    : r === "COMMITTEE" ? "bg-indigo-50 text-indigo-700 border-indigo-200"
    : "bg-ap-blue text-white border-ap-blue";

/**
 * Employee directory tab. Owns its list/filter/pagination state and the
 * add / edit / remove / bulk-upload flows (same endpoints as before the split).
 *
 * initialSearch: seeds the search filter (command-palette deep link).
 * pendingAddDept: org tab's "Add Employee" hand-off — opens the add form
 * pre-filled with that department.
 */
export default function EmployeesView({ user, initialSearch = "", pendingAddDept = null, onConsumePendingAdd }) {
    const toast = useToast();
    const [employees, setEmployees] = useState([]);
    const [empDepartments, setEmpDepartments] = useState([]);
    const [empTotal, setEmpTotal] = useState(0);
    const [empTotalPages, setEmpTotalPages] = useState(1);
    const [empPage, setEmpPage] = useState(1);
    const [empLoading, setEmpLoading] = useState(true);
    const [empFilter, setEmpFilter] = useState({ search: initialSearch, department: "", role: "", branch: "" });
    const [empBranches, setEmpBranches] = useState([]);
    const [empDepartmentStats, setEmpDepartmentStats] = useState([]);

    // Add employee
    const [showAddEmp, setShowAddEmp] = useState(!!pendingAddDept);
    const [addForm, setAddForm] = useState({ name: "", mobile: "", departmentName: pendingAddDept || "", joiningDate: "", reason: "", empCode: "", designation: "" });
    const [addMsg, setAddMsg] = useState({ type: "", text: "" });
    const [addLoading, setAddLoading] = useState(false);

    // Remove employee
    const [removeId, setRemoveId] = useState(null);
    const [removeReason, setRemoveReason] = useState("");
    const [removeLoading, setRemoveLoading] = useState(false);

    // Bulk upload
    const [showBulkUpload, setShowBulkUpload] = useState(false);
    const [bulkFile, setBulkFile] = useState(null);
    const [bulkLoading, setBulkLoading] = useState(false);
    const [bulkResult, setBulkResult] = useState(null);
    const [bulkMsg, setBulkMsg] = useState({ type: "", text: "" });

    // Edit employee
    const [editEmp, setEditEmp] = useState(null);
    const [editForm, setEditForm] = useState({});
    const [editConfirm, setEditConfirm] = useState(false);
    const [editChanges, setEditChanges] = useState([]);
    const [editLoading, setEditLoading] = useState(false);
    const [editMsg, setEditMsg] = useState({ type: "", text: "" });

    const [excelLoading, setExcelLoading] = useState(false);

    // Read-only employee details drawer — the "View" in the Employee Hub.
    const [detailEmp, setDetailEmp] = useState(null);

    const fetchEmployees = async (pg = empPage, filters = empFilter) => {
        setEmpLoading(true);
        try {
            const params = new URLSearchParams({ page: pg.toString() });
            if (filters.search) params.set("search", filters.search);
            if (filters.department) params.set("department", filters.department);
            if (filters.role) params.set("role", filters.role);
            if (filters.branch) params.set("branch", filters.branch);
            const d = await api(`/api/admin/employees?${params}`);
            setEmployees(d.employees);
            setEmpTotal(d.total);
            setEmpTotalPages(d.totalPages);
            setEmpPage(pg);
            if (d.departments) setEmpDepartments(d.departments);
            if (d.departmentStats) setEmpDepartmentStats(d.departmentStats);
            if (d.branches) setEmpBranches(d.branches);
        } catch (err) { console.error("[Admin] fetchEmployees failed:", err); }
        setEmpLoading(false);
    };

    useEffect(() => {
        fetchEmployees(1);
        if (pendingAddDept) onConsumePendingAdd?.();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Refetch when filters change (SearchInput already debounces the text).
    const firstFilterRun = useRef(true);
    useEffect(() => {
        if (firstFilterRun.current) { firstFilterRun.current = false; return; }
        fetchEmployees(1, empFilter);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [empFilter.search, empFilter.department, empFilter.role, empFilter.branch]);

    const handleAddEmployee = async () => {
        setAddLoading(true);
        setAddMsg({ type: "", text: "" });
        try {
            const d = await api("/api/admin/employees", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(addForm),
            });
            setAddMsg({ type: "success", text: `${d.employee.name} added successfully. Default password: ${d.defaultPassword}` });
            setAddForm({ name: "", mobile: "", departmentName: "", joiningDate: "", reason: "", empCode: "", designation: "" });
            fetchEmployees(1);
        } catch (err) {
            setAddMsg({ type: "error", text: err.message || "Failed to add employee" });
        }
        setAddLoading(false);
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
            fetchEmployees(1);
        } catch (err) {
            toast.error(err.message || "Failed to remove employee");
        }
        setRemoveLoading(false);
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
            const res = await fetch("/api/admin/employees/bulk-upload", { method: "POST", body: fd });
            const json = await res.json();
            if (!res.ok || !json.success) throw new Error(json.message || "Upload failed");
            setBulkResult(json.data);
            setBulkMsg({ type: "success", text: `Processed ${json.data.totalRows} rows: ${json.data.createdCount} created, ${json.data.skippedCount} skipped, ${json.data.failedCount} failed.` });
            setBulkFile(null);
            fetchEmployees(1);
        } catch (err) {
            setBulkMsg({ type: "error", text: err.message || "Bulk upload failed" });
        }
        setBulkLoading(false);
    };

    const downloadBulkTemplate = async () => {
        const XLSX = await import("xlsx");
        const sampleRows = [
            { "Emp Code": "5100099", "Name": "Sample Name", "Department": "Production", "Branch": "Jaipur", "Designation": "Operator", "Mobile": "9876543210", "Collar Type": "BLUE_COLLAR" },
        ];
        const ws = XLSX.utils.json_to_sheet(sampleRows);
        ws["!cols"] = [{ wch: 12 }, { wch: 25 }, { wch: 20 }, { wch: 15 }, { wch: 20 }, { wch: 14 }, { wch: 14 }];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Employees");
        XLSX.writeFile(wb, "Employee_Upload_Template.xlsx");
    };

    const downloadExcel = async () => {
        setExcelLoading(true);
        try {
            const XLSX = await import("xlsx");
            const params = new URLSearchParams({ page: "1", export: "true" });
            if (empFilter.search) params.set("search", empFilter.search);
            if (empFilter.department) params.set("department", empFilter.department);
            if (empFilter.role) params.set("role", empFilter.role);
            if (empFilter.branch) params.set("branch", empFilter.branch);
            const d = await api(`/api/admin/employees?${params}`);
            const all = d.employees || [];

            const collarLabel = (ct) =>
                ct === "WHITE_COLLAR" ? "White Collar" : ct === "BLUE_COLLAR" ? "Blue Collar" : "—";

            // Branch Manager leads the list (S.No 1), Cluster Manager second
            // (S.No 2), then everyone else.
            const hasRole = (e, roleKey) =>
                e.role === roleKey ||
                (e.roles || []).includes(roleKey) ||
                (e.evaluatorRoles || []).some(er => er.role === roleKey);
            const bm = all.find(e => hasRole(e, "BRANCH_MANAGER"));
            const cm = all.find(e => hasRole(e, "CLUSTER_MANAGER"));
            const leaders = [];
            if (bm) leaders.push(bm);
            if (cm && cm !== bm) leaders.push(cm);
            const leaderIds = new Set(leaders.map(e => e.id));
            const ordered = [...leaders, ...all.filter(e => !leaderIds.has(e.id))];

            const rows = ordered.map((e, i) => ({
                "S.No": i + 1,
                "Emp Code": e.empCode || "—",
                "Name": e.name,
                "Department": e.department,
                "Branch": e.departmentObj?.branch?.name || "—",
                "Designation": e.designation || "—",
                "Mobile": e.mobile || "",
                "Role": (e.roles || [e.role]).join(", ").replace(/_/g, " "),
                "Collar / Category": collarLabel(e.collarType),
            }));
            const ws = XLSX.utils.json_to_sheet(rows);
            const colWidths = Object.keys(rows[0] || {}).map(key => ({
                wch: Math.max(key.length, ...rows.map(r => String(r[key] || "").length)) + 2,
            }));
            ws["!cols"] = colWidths;
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Employees");
            const filterLabel = [empFilter.branch, empFilter.department, empFilter.role?.replace(/_/g, " "), empFilter.search].filter(Boolean).join("_") || "All";
            XLSX.writeFile(wb, `Employees_${filterLabel}_${new Date().toISOString().slice(0, 10)}.xlsx`);
        } catch (err) {
            console.error("Excel export error:", err);
            toast.error("Excel export failed");
        }
        setExcelLoading(false);
    };

    // Edit flow — preview changes, confirm, save (PATCH).
    const openEditModal = (emp) => {
        setEditEmp(emp);
        setEditForm({
            branchId: emp.departmentObj?.branchId || "",
            departmentId: emp.departmentObj?.id || "",
            role: emp.role || "EMPLOYEE",
            designation: emp.designation === "—" ? "" : emp.designation || "",
            mobile: emp.mobile || "",
            collarType: emp.collarType || "",
            password: "",
        });
        setEditConfirm(false);
        setEditChanges([]);
        setEditMsg({ type: "", text: "" });
    };

    const collarLbl = (c) => c === "WHITE_COLLAR" ? "White Collar" : c === "BLUE_COLLAR" ? "Blue Collar" : "—";

    const buildChanges = () => {
        const changes = [];
        const origDeptId = editEmp.departmentObj?.id || "";
        const origDeptName = editEmp.departmentObj?.name || "—";
        const origBranchId = editEmp.departmentObj?.branchId || "";
        const origBranchName = editEmp.departmentObj?.branch?.name || "—";
        const selDept = empDepartmentStats.find((d) => d.id === editForm.departmentId);
        const selBranchName = empBranches.find((b) => b.id === editForm.branchId)?.name;

        if (editForm.departmentId && editForm.departmentId !== origDeptId) {
            changes.push(`Department: "${origDeptName}" → "${selDept?.name || "—"}"`);
            const newBranch = selDept?.branch || selBranchName;
            if (newBranch && newBranch !== origBranchName)
                changes.push(`Branch: "${origBranchName}" → "${newBranch}"`);
        } else if (!editEmp.departmentObj && editForm.branchId && editForm.branchId !== origBranchId) {
            changes.push(`Branch: "${origBranchName}" → "${selBranchName || "—"}"`);
        }
        if (editForm.role && editForm.role !== editEmp.role)
            changes.push(`Role: "${editEmp.role}" → "${editForm.role}"`);
        const origDesig = editEmp.designation === "—" ? "" : editEmp.designation || "";
        if (editForm.designation !== origDesig)
            changes.push(`Designation: "${origDesig || "—"}" → "${editForm.designation || "—"}"`);
        if ((editForm.mobile || "") !== (editEmp.mobile || ""))
            changes.push(`Mobile: "${editEmp.mobile || "—"}" → "${editForm.mobile || "—"}"`);
        if ((editForm.collarType || "") !== (editEmp.collarType || ""))
            changes.push(`Category: "${collarLbl(editEmp.collarType)}" → "${collarLbl(editForm.collarType)}"`);
        if (editForm.password && editForm.password.trim().length >= 6)
            changes.push("Password will be updated");
        return changes;
    };

    const handleEditPreview = () => {
        const changes = buildChanges();
        if (changes.length === 0) { setEditMsg({ type: "error", text: "No changes made." }); return; }
        if (editForm.password && editForm.password.trim().length > 0 && editForm.password.trim().length < 6) {
            setEditMsg({ type: "error", text: "Password must be at least 6 characters." }); return;
        }
        setEditChanges(changes);
        setEditConfirm(true);
        setEditMsg({ type: "", text: "" });
    };

    const handleEditSave = async () => {
        setEditLoading(true);
        setEditMsg({ type: "", text: "" });
        try {
            const body = {};
            const origDeptId = editEmp.departmentObj?.id || "";
            const origBranchId = editEmp.departmentObj?.branchId || "";
            // Branch follows the department: moving to a department in another
            // branch carries the branch with it. For branch-scoped role holders
            // who have no department, set the scoped branch directly instead.
            if (editForm.departmentId && editForm.departmentId !== origDeptId) {
                body.departmentId = editForm.departmentId;
            } else if (!editEmp.departmentObj && editForm.branchId && editForm.branchId !== origBranchId) {
                body.branchId = editForm.branchId;
            }
            if (editForm.role && editForm.role !== editEmp.role) body.role = editForm.role;
            const origDesig = editEmp.designation === "—" ? "" : editEmp.designation || "";
            if (editForm.designation !== origDesig) body.designation = editForm.designation;
            if ((editForm.mobile || "") !== (editEmp.mobile || "")) body.mobile = editForm.mobile;
            if ((editForm.collarType || "") !== (editEmp.collarType || "")) body.collarType = editForm.collarType;
            if (editForm.password && editForm.password.trim().length >= 6) body.password = editForm.password.trim();

            const res = await fetch(`/api/admin/employees/${editEmp.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const json = await res.json();
            if (!res.ok || !json.success) throw new Error(json.message || "Update failed");
            setEditMsg({ type: "success", text: "Employee updated successfully!" });
            setEditConfirm(false);
            await fetchEmployees(empPage, empFilter);
            setTimeout(() => setEditEmp(null), 1200);
        } catch (err) {
            setEditMsg({ type: "error", text: err.message });
            setEditConfirm(false);
        }
        setEditLoading(false);
    };

    // Department filter options — scoped to the selected branch.
    const empDepartmentOptions = (empDepartmentStats.length > 0
        ? (empFilter.branch ? empDepartmentStats.filter((d) => d.branch === empFilter.branch) : empDepartmentStats).map((d) => d.name)
        : empDepartments
    ).filter((n, i, a) => a.indexOf(n) === i);

    const isAdmin = user?.role === "ADMIN";

    // Edit modal: branch → department linkage. Picking a branch narrows the
    // department list to that branch (department names repeat across branches,
    // so we key off the id to move the employee unambiguously).
    const editBranchName = empBranches.find((b) => b.id === editForm.branchId)?.name || "";
    const editDeptOptions = empDepartmentStats.filter((d) => d.id && (!editBranchName || d.branch === editBranchName));

    const columns = [
        { key: "empCode", header: "Emp Code", sortable: true, render: (e) => <span className="font-mono text-gray-700">{e.empCode || "—"}</span> },
        { key: "name", header: "Name", sortable: true, render: (e) => <span className="font-bold text-ap-blue">{e.name}</span> },
        {
            key: "email", header: "Email", sortable: true, hideBelow: "lg",
            sortAccessor: (e) => e.email || "",
            // Emails aren't captured yet — show a placeholder until they're
            // uploaded. The column is toggleable via the "Columns" menu.
            render: (e) => e.email
                ? <a href={`mailto:${e.email}`} onClick={(ev) => ev.stopPropagation()} className="text-ap-blue hover:underline">{e.email}</a>
                : <span className="text-gray-300 italic text-xs">Not provided</span>,
        },
        {
            key: "branch", header: "Branch", sortable: true,
            sortAccessor: (e) => e.departmentObj?.branch?.name || "",
            render: (e) => <span className="text-gray-700">{e.departmentObj?.branch?.name || "—"}</span>,
        },
        {
            key: "department", header: "Department", sortable: true,
            render: (e) => (
                <>
                    {e.department}
                    {e.evaluatorRoles?.length > 0 && <span className="block text-[10px] text-gray-500 mt-0.5">{e.evaluatorRoles.map(er => `${er.role.replace("_", " ")} — ${er.department}`).join(", ")}</span>}
                </>
            ),
        },
        { key: "designation", header: "Designation", hideBelow: "lg", render: (e) => <span className="text-gray-500">{e.designation}</span> },
        {
            key: "mobile", header: "Mobile", hideBelow: "lg",
            render: (e) => e.mobile ? <a href={`tel:${e.mobile}`} onClick={(ev) => ev.stopPropagation()} className="text-ap-blue hover:underline">{e.mobile}</a> : <span className="text-gray-300 italic text-xs">Not provided</span>,
        },
        {
            key: "collar", header: "Collar", hideBelow: "md",
            render: (e) => e.role === "EMPLOYEE" && e.collarType ? (
                <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${e.collarType === "WHITE_COLLAR" ? "bg-gray-100 text-gray-600" : "bg-blue-50 text-blue-600"}`}>
                    {e.collarType === "WHITE_COLLAR" ? "White Collar" : "Blue Collar"}
                </span>
            ) : <span className="text-xs text-gray-400">—</span>,
        },
        {
            key: "roles", header: "Roles",
            render: (e) => (
                <div className="flex flex-wrap gap-1">
                    {(e.roles || [e.role]).map(r => (
                        <span key={r} className={`text-[10px] px-2 py-0.5 rounded-full border font-bold uppercase tracking-wider ${ROLE_BADGE(r)}`}>{r.replace("_", " ")}</span>
                    ))}
                </div>
            ),
        },
        ...(isAdmin ? [{
            key: "actions", header: "Action",
            render: (e) => {
                const roles = e.roles || [e.role];
                return (
                    <div className="flex gap-1.5">
                        <button onClick={(ev) => { ev.stopPropagation(); openEditModal(e); }} className="text-xs px-3 py-1.5 bg-ap-blue hover:bg-ap-green text-white rounded-lg font-semibold transition-colors cursor-pointer">Edit</button>
                        {!roles.includes("ADMIN") && <button onClick={(ev) => { ev.stopPropagation(); setRemoveId(e.id); }} className="text-xs px-3 py-1.5 bg-red-50 text-red-700 border border-red-200 rounded-lg font-semibold hover:bg-red-100 cursor-pointer">Remove</button>}
                    </div>
                );
            },
        }] : []),
    ];

    return (
        <div className="space-y-4 sm:space-y-6">
            {/* Header — title, live count + primary actions */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h2 className="text-xl font-bold text-ap-blue">Employees</h2>
                    <p className="text-sm text-gray-500">
                        {empLoading
                            ? "Loading…"
                            : `${empTotal} employee${empTotal === 1 ? "" : "s"}${(empFilter.search || empFilter.branch || empFilter.department || empFilter.role) ? " matching filters" : ""}`}
                    </p>
                </div>
                <div className="grid grid-cols-3 sm:flex gap-2">
                    <button onClick={() => { setShowAddEmp(!showAddEmp); setAddMsg({ type: "", text: "" }); }} className="h-10 px-2.5 sm:px-3.5 bg-ap-green hover:bg-ap-green-700 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap shadow-sm">
                        {showAddEmp ? "Cancel" : "Add Employee"}
                    </button>
                    <button onClick={() => { setShowBulkUpload(!showBulkUpload); setBulkMsg({ type: "", text: "" }); setBulkResult(null); }} className="h-10 px-2.5 sm:px-3.5 bg-ap-orange hover:bg-ap-orange-600 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap shadow-sm">
                        {showBulkUpload ? "Cancel" : "Bulk Upload"}
                    </button>
                    <button onClick={downloadExcel} disabled={excelLoading} className="h-10 px-2.5 sm:px-3.5 bg-white border border-gray-300 hover:bg-gray-50 text-ap-green text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 cursor-pointer transition-colors disabled:opacity-60 whitespace-nowrap shadow-sm">
                        {excelLoading ? "Exporting..." : "Export Excel"}
                    </button>
                </div>
            </div>

            {/* Add Employee Form (collapsible) */}
            {showAddEmp && (
                <div className="bg-white border border-ap-border rounded-card p-5 shadow-card space-y-4">
                    <h3 className="text-lg font-bold text-ap-blue">Add New Employee</h3>
                    {addMsg.text && (
                        <div className={`p-3 rounded-lg text-sm font-medium ${addMsg.type === "success" ? "bg-green-50 text-green-800 border border-green-200" : "bg-red-50 text-red-800 border border-red-200"}`}>{addMsg.text}</div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">Name *</label>
                            <input type="text" value={addForm.name} onChange={(e) => setAddForm({ ...addForm, name: e.target.value })} placeholder="Full name" className="w-full h-10 px-3 bg-gray-50 border border-gray-300 rounded-lg text-sm" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">Employee Code</label>
                            <input type="text" value={addForm.empCode} onChange={(e) => setAddForm({ ...addForm, empCode: e.target.value })} placeholder="e.g. 5100030" className="w-full h-10 px-3 bg-gray-50 border border-gray-300 rounded-lg text-sm" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">Mobile Number</label>
                            <input type="text" value={addForm.mobile} onChange={(e) => setAddForm({ ...addForm, mobile: e.target.value })} placeholder="Phone number" className="w-full h-10 px-3 bg-gray-50 border border-gray-300 rounded-lg text-sm" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">Department *</label>
                            <select value={addForm.departmentName} onChange={(e) => setAddForm({ ...addForm, departmentName: e.target.value })} className="w-full h-10 px-3 bg-gray-50 border border-gray-300 rounded-lg text-sm">
                                <option value="">Select Department</option>
                                {empDepartments.map(d => <option key={d} value={d}>{d}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">Designation</label>
                            <input type="text" value={addForm.designation} onChange={(e) => setAddForm({ ...addForm, designation: e.target.value })} placeholder="e.g. Executive" className="w-full h-10 px-3 bg-gray-50 border border-gray-300 rounded-lg text-sm" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">Joining Date</label>
                            <input type="date" value={addForm.joiningDate} onChange={(e) => setAddForm({ ...addForm, joiningDate: e.target.value })} className="w-full h-10 px-3 bg-gray-50 border border-gray-300 rounded-lg text-sm" />
                        </div>
                        <div className="sm:col-span-2 lg:col-span-3">
                            <label className="block text-xs font-bold text-gray-500 mb-1">Reason for Joining</label>
                            <input type="text" value={addForm.reason} onChange={(e) => setAddForm({ ...addForm, reason: e.target.value })} placeholder="e.g. New hire, Transfer from another branch" className="w-full h-10 px-3 bg-gray-50 border border-gray-300 rounded-lg text-sm" />
                        </div>
                    </div>
                    <button onClick={handleAddEmployee} disabled={addLoading || !addForm.name || !addForm.departmentName} className="px-6 py-2 bg-ap-blue text-white rounded-lg text-sm font-bold hover:bg-ap-blue-700 transition-colors cursor-pointer disabled:opacity-50">
                        {addLoading ? "Adding..." : "Add Employee"}
                    </button>
                </div>
            )}

            {/* Bulk Upload Panel */}
            {showBulkUpload && (
                <div className="bg-white border border-ap-border rounded-card p-5 shadow-card space-y-4">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                        <h3 className="text-lg font-bold text-ap-blue">Bulk Upload Employees (Excel)</h3>
                        <button onClick={downloadBulkTemplate} className="text-xs px-3 py-1.5 bg-gray-50 border border-gray-300 rounded-lg font-bold text-gray-700 hover:bg-white cursor-pointer">
                            Download Template
                        </button>
                    </div>
                    <div className="text-xs text-gray-500 bg-gray-50 border border-ap-border rounded-lg p-3 space-y-1">
                        <p className="font-bold text-ap-blue">Required columns: Name, Department</p>
                        <p>Optional columns: Emp Code, Branch, Designation, Mobile, Collar Type (WHITE_COLLAR | BLUE_COLLAR)</p>
                        <p>If a department name exists in multiple branches, the Branch column is required to disambiguate.</p>
                        <p>Default password format: <code className="bg-white px-1 rounded">FirstName_lastTwoDigitsOfEmpCode</code></p>
                    </div>
                    {bulkMsg.text && (
                        <div className={`p-3 rounded-lg text-sm font-medium ${bulkMsg.type === "success" ? "bg-green-50 text-green-800 border border-green-200" : "bg-red-50 text-red-800 border border-red-200"}`}>{bulkMsg.text}</div>
                    )}
                    <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                        <input
                            type="file"
                            accept=".xlsx,.xls"
                            onChange={(e) => setBulkFile(e.target.files?.[0] || null)}
                            className="flex-1 text-sm file:mr-3 file:px-4 file:py-2 file:rounded-lg file:border-0 file:bg-ap-blue file:text-white file:font-bold file:cursor-pointer hover:file:bg-ap-blue-700"
                        />
                        <button
                            onClick={handleBulkUpload}
                            disabled={bulkLoading || !bulkFile}
                            className="px-6 py-2 bg-ap-orange text-white rounded-lg text-sm font-bold hover:bg-ap-orange-600 transition-colors cursor-pointer disabled:opacity-50"
                        >
                            {bulkLoading ? "Uploading..." : "Upload & Create"}
                        </button>
                    </div>
                    {bulkResult && (
                        <div className="mt-3 space-y-3">
                            <div className="grid grid-cols-3 gap-2 text-center">
                                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                                    <div className="text-2xl font-bold text-green-700">{bulkResult.createdCount}</div>
                                    <div className="text-[11px] text-green-700 font-bold uppercase tracking-wider">Created</div>
                                </div>
                                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                                    <div className="text-2xl font-bold text-amber-700">{bulkResult.skippedCount}</div>
                                    <div className="text-[11px] text-amber-700 font-bold uppercase tracking-wider">Skipped</div>
                                </div>
                                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                                    <div className="text-2xl font-bold text-red-700">{bulkResult.failedCount}</div>
                                    <div className="text-[11px] text-red-700 font-bold uppercase tracking-wider">Failed</div>
                                </div>
                            </div>
                            {bulkResult.failed?.length > 0 && (
                                <div className="max-h-40 overflow-y-auto bg-red-50 border border-red-200 rounded-lg p-3">
                                    <p className="text-xs font-bold text-red-800 mb-1">Failed rows:</p>
                                    <ul className="text-[11px] text-red-700 space-y-0.5">
                                        {bulkResult.failed.slice(0, 50).map((f, i) => <li key={i}>Row {f.row}: {f.reason}</li>)}
                                    </ul>
                                </div>
                            )}
                            {bulkResult.skipped?.length > 0 && (
                                <div className="max-h-32 overflow-y-auto bg-amber-50 border border-amber-200 rounded-lg p-3">
                                    <p className="text-xs font-bold text-amber-800 mb-1">Skipped rows:</p>
                                    <ul className="text-[11px] text-amber-700 space-y-0.5">
                                        {bulkResult.skipped.slice(0, 50).map((s, i) => <li key={i}>Row {s.row}: {s.reason}</li>)}
                                    </ul>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Directory table with filter toolbar */}
            <DataTable
                id="admin-employees"
                columns={columns}
                rows={employees}
                rowKey={(e) => e.id}
                onRowClick={(e) => setDetailEmp(e)}
                loading={empLoading}
                emptyIcon="🧑‍💼"
                emptyTitle="No employees found"
                emptySub="Try adjusting your search or filters"
                columnVisibility
                pagination={empTotal > 50 ? { page: empPage, totalPages: empTotalPages, total: empTotal, onPageChange: (p) => fetchEmployees(p, empFilter) } : null}
                toolbar={
                    <>
                        <SearchInput
                            value={empFilter.search}
                            onChange={(v) => setEmpFilter((p) => ({ ...p, search: v }))}
                            placeholder="Name or employee code…"
                            className="w-full sm:w-64"
                        />
                        <select value={empFilter.branch} onChange={(e) => setEmpFilter({ ...empFilter, branch: e.target.value, department: "" })} aria-label="Filter by branch" className="h-9 px-2 bg-gray-50 border border-gray-300 rounded-lg text-xs sm:text-sm text-gray-700 focus:outline-none focus:border-ap-blue">
                            <option value="">All Branches</option>
                            {empBranches.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
                        </select>
                        <select value={empFilter.department} onChange={(e) => setEmpFilter({ ...empFilter, department: e.target.value })} aria-label="Filter by department" className="h-9 px-2 bg-gray-50 border border-gray-300 rounded-lg text-xs sm:text-sm text-gray-700 focus:outline-none focus:border-ap-blue">
                            <option value="">All Departments</option>
                            {empDepartmentOptions.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                        <select value={empFilter.role} onChange={(e) => setEmpFilter({ ...empFilter, role: e.target.value })} aria-label="Filter by role" className="h-9 px-2 bg-gray-50 border border-gray-300 rounded-lg text-xs sm:text-sm text-gray-700 focus:outline-none focus:border-ap-blue">
                            <option value="">All Roles</option>
                            <option value="EMPLOYEE">Employee</option>
                            <option value="BRANCH_MANAGER">Branch Manager</option>
                            <option value="CLUSTER_MANAGER">Cluster Manager</option>
                            <option value="HOD">HOD</option>
                            <option value="HR">HR</option>
                            <option value="COMMITTEE">Committee</option>
                            <option value="ADMIN">Admin</option>
                        </select>
                        {(empFilter.search || empFilter.branch || empFilter.department || empFilter.role) && (
                            <button onClick={() => setEmpFilter({ search: "", department: "", role: "", branch: "" })} className="h-9 px-3 bg-white border border-ap-border hover:bg-gray-50 text-gray-500 hover:text-red-600 text-xs font-bold rounded-lg cursor-pointer transition-colors whitespace-nowrap">
                                ✕ Clear
                            </button>
                        )}
                    </>
                }
                mobileCard={(e) => (
                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-bold text-ap-blue">{e.name}</span>
                            <span className="font-mono text-xs text-gray-500">{e.empCode || "—"}</span>
                        </div>
                        <p className="text-xs text-gray-500 m-0">{e.departmentObj?.branch?.name ? `${e.departmentObj.branch.name} · ` : ""}{e.department}{e.designation ? ` · ${e.designation}` : ""}</p>
                        <div className="flex flex-wrap gap-1">
                            {(e.roles || [e.role]).map(r => (
                                <span key={r} className={`text-[9px] px-1.5 py-0.5 rounded-full border font-bold uppercase ${ROLE_BADGE(r)}`}>{r.replace("_", " ")}</span>
                            ))}
                        </div>
                        {isAdmin && (
                            <div className="flex gap-1.5 pt-1">
                                <button onClick={(ev) => { ev.stopPropagation(); openEditModal(e); }} className="text-xs px-3 py-1.5 bg-ap-blue text-white rounded-lg font-semibold cursor-pointer">Edit</button>
                                {!(e.roles || [e.role]).includes("ADMIN") && <button onClick={(ev) => { ev.stopPropagation(); setRemoveId(e.id); }} className="text-xs px-3 py-1.5 bg-red-50 text-red-700 border border-red-200 rounded-lg font-semibold cursor-pointer">Remove</button>}
                            </div>
                        )}
                    </div>
                )}
            />

            {/* Remove Employee modal */}
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

            {/* Edit Employee modal — preview-then-confirm flow preserved */}
            <Modal open={!!editEmp} onClose={() => setEditEmp(null)} title={editEmp ? `Edit ${editEmp.name}` : "Edit Employee"} width={440}>
                {editEmp && (editConfirm ? (
                    <div className="space-y-4">
                        <div className="bg-[#FFF8E1] border border-[#FFD600] rounded-xl p-4">
                            <p className="text-sm font-bold text-[#E65100] mb-2">Confirm the following changes:</p>
                            <ul className="space-y-1">
                                {editChanges.map((c, i) => (
                                    <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                                        <span className="text-ap-green font-bold mt-0.5">✓</span>
                                        <span>{c}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <p className="text-xs text-gray-500 m-0">A notification will be sent to the employee about these changes.</p>
                        {editMsg.text && <p className={`text-sm font-medium m-0 ${editMsg.type === "error" ? "text-[#D32F2F]" : "text-ap-green"}`}>{editMsg.text}</p>}
                        <div className="flex gap-3">
                            <button onClick={() => setEditConfirm(false)} className="flex-1 py-2.5 border border-gray-300 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer">Back</button>
                            <button onClick={handleEditSave} disabled={editLoading} className="flex-1 py-2.5 bg-ap-blue hover:bg-ap-green text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-60 cursor-pointer">
                                {editLoading ? "Saving..." : "Confirm & Save"}
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {editMsg.text && <p className={`text-sm font-medium m-0 ${editMsg.type === "error" ? "text-[#D32F2F]" : "text-ap-green"}`}>{editMsg.text}</p>}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">Branch</label>
                                <select value={editForm.branchId} onChange={e => setEditForm({ ...editForm, branchId: e.target.value, departmentId: "" })}
                                    className="w-full h-10 px-3 bg-gray-50 border border-gray-300 rounded-lg text-sm text-gray-700 focus:outline-none focus:border-ap-blue">
                                    <option value="">— Select Branch —</option>
                                    {empBranches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">Department</label>
                                <select value={editForm.departmentId} onChange={e => setEditForm({ ...editForm, departmentId: e.target.value })}
                                    className="w-full h-10 px-3 bg-gray-50 border border-gray-300 rounded-lg text-sm text-gray-700 focus:outline-none focus:border-ap-blue">
                                    <option value="">— Select Department —</option>
                                    {editDeptOptions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                </select>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">Mobile Number</label>
                                <input type="tel" value={editForm.mobile} onChange={e => setEditForm({ ...editForm, mobile: e.target.value })}
                                    placeholder="e.g. 9876543210"
                                    className="w-full h-10 px-3 bg-gray-50 border border-gray-300 rounded-lg text-sm text-gray-700 focus:outline-none focus:border-ap-blue" />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">Collar / Category</label>
                                <select value={editForm.collarType} onChange={e => setEditForm({ ...editForm, collarType: e.target.value })}
                                    className="w-full h-10 px-3 bg-gray-50 border border-gray-300 rounded-lg text-sm text-gray-700 focus:outline-none focus:border-ap-blue">
                                    <option value="">— Not set —</option>
                                    <option value="BLUE_COLLAR">Blue Collar</option>
                                    <option value="WHITE_COLLAR">White Collar</option>
                                </select>
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1">Role</label>
                            <select value={editForm.role} onChange={e => setEditForm({ ...editForm, role: e.target.value })}
                                className="w-full h-10 px-3 bg-gray-50 border border-gray-300 rounded-lg text-sm text-gray-700 focus:outline-none focus:border-ap-blue">
                                <option value="EMPLOYEE">Employee</option>
                                <option value="BRANCH_MANAGER">Branch Manager</option>
                                <option value="CLUSTER_MANAGER">Cluster Manager</option>
                                <option value="HOD">HOD</option>
                                <option value="HR">HR</option>
                                <option value="COMMITTEE">Committee</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1">Designation</label>
                            <input type="text" value={editForm.designation} onChange={e => setEditForm({ ...editForm, designation: e.target.value })}
                                placeholder="e.g. Senior Executive - HR"
                                className="w-full h-10 px-3 bg-gray-50 border border-gray-300 rounded-lg text-sm text-gray-700 focus:outline-none focus:border-ap-blue" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1">New Password <span className="text-gray-400 font-normal">(leave blank to keep current)</span></label>
                            <input type="password" value={editForm.password} onChange={e => setEditForm({ ...editForm, password: e.target.value })}
                                placeholder="Min 6 characters"
                                className="w-full h-10 px-3 bg-gray-50 border border-gray-300 rounded-lg text-sm text-gray-700 focus:outline-none focus:border-ap-blue" />
                        </div>
                        <div className="flex gap-3 pt-1">
                            <button onClick={() => setEditEmp(null)} className="flex-1 py-2.5 border border-gray-300 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer">Cancel</button>
                            <button onClick={handleEditPreview} className="flex-1 py-2.5 bg-ap-blue hover:bg-ap-green text-white rounded-xl text-sm font-semibold transition-colors cursor-pointer">Preview Changes</button>
                        </div>
                    </div>
                ))}
            </Modal>

            {/* Read-only Employee Details — the "View" of the Employee Hub.
                Opens on row click; profile + roles in a side drawer instead of a
                full page change. Admin actions live in the footer. */}
            <Drawer
                open={!!detailEmp}
                onClose={() => setDetailEmp(null)}
                title="Employee Details"
                width={460}
                footer={isAdmin && detailEmp ? (
                    <div className="flex gap-2">
                        <button
                            onClick={() => { const emp = detailEmp; setDetailEmp(null); openEditModal(emp); }}
                            className="flex-1 py-2.5 bg-ap-blue hover:bg-ap-green text-white rounded-lg text-sm font-bold transition-colors cursor-pointer"
                        >
                            Edit
                        </button>
                        {!(detailEmp.roles || [detailEmp.role]).includes("ADMIN") && (
                            <button
                                onClick={() => { const id = detailEmp.id; setDetailEmp(null); setRemoveId(id); }}
                                className="flex-1 py-2.5 bg-danger-50 text-danger-700 border border-danger-100 rounded-lg text-sm font-bold hover:bg-danger-100 transition-colors cursor-pointer"
                            >
                                Remove
                            </button>
                        )}
                    </div>
                ) : null}
            >
                {detailEmp && (
                    <div className="space-y-5">
                        <div className="flex items-center gap-3">
                            <div className="h-12 w-12 rounded-full bg-ap-blue-50 border border-ap-blue-100 flex items-center justify-center text-ap-blue font-bold text-lg shrink-0">
                                {detailEmp.name?.charAt(0)?.toUpperCase()}
                            </div>
                            <div className="min-w-0">
                                <h3 className="text-base font-extrabold text-gray-900 m-0 truncate">{detailEmp.name}</h3>
                                <p className="text-xs text-gray-500 m-0 font-mono">{detailEmp.empCode || "No employee code"}</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                            <DetailField label="Department" value={detailEmp.department} />
                            <DetailField label="Branch" value={detailEmp.departmentObj?.branch?.name} />
                            <DetailField label="Designation" value={detailEmp.designation && detailEmp.designation !== "—" ? detailEmp.designation : null} />
                            <DetailField label="Mobile" value={detailEmp.mobile} />
                            <DetailField label="Email" value={detailEmp.email} />
                            <DetailField label="Collar / Category" value={detailEmp.collarType === "WHITE_COLLAR" ? "White Collar" : detailEmp.collarType === "BLUE_COLLAR" ? "Blue Collar" : null} />
                        </div>

                        <div>
                            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5 m-0">Roles</p>
                            <div className="flex flex-wrap gap-1.5">
                                {(detailEmp.roles || [detailEmp.role]).map((r) => (
                                    <span key={r} className={`text-[10px] px-2 py-0.5 rounded-full border font-bold uppercase tracking-wider ${ROLE_BADGE(r)}`}>{r.replace(/_/g, " ")}</span>
                                ))}
                            </div>
                        </div>

                        {detailEmp.evaluatorRoles?.length > 0 && (
                            <div>
                                <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5 m-0">Evaluator assignments</p>
                                <ul className="space-y-1 m-0 p-0 list-none">
                                    {detailEmp.evaluatorRoles.map((er, i) => (
                                        <li key={i} className="text-[13px] text-gray-700">
                                            <span className="font-semibold">{er.role.replace(/_/g, " ")}</span> — {er.department}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                )}
            </Drawer>
        </div>
    );
}

function DetailField({ label, value }) {
    return (
        <div>
            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-0.5 m-0">{label}</p>
            <p className="text-[13px] font-semibold text-gray-900 m-0">{value || <span className="text-gray-300 font-normal">—</span>}</p>
        </div>
    );
}
