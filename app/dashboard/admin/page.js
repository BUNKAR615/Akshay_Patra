"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import DashboardShell from "../../../components/DashboardShell";
import { Stat, Alert } from "../../../components/ui";
import ConfirmDialog from "../../../components/ConfirmDialog";
import { PageSpinner, SkeletonCard, SkeletonStats } from "../../../components/Skeleton";
import UserProfileCard from "../../../components/UserProfileCard";
import Papa from "papaparse";
import * as XLSX from "xlsx";

async function api(url, opts) {
    const res = await fetch(url, opts);
    const json = await res.json();
    if (!res.ok || !json.success) throw new Error(json.message || "Request failed");
    return json.data;
}

// Auto-generate quarter name based on current month / financial year
function getAutoQuarterName() {
    const now = new Date();
    const month = now.getMonth(); // 0-11
    const year = now.getFullYear();
    const qNum = month < 3 ? 4 : month < 6 ? 1 : month < 9 ? 2 : 3;
    const fyYear = qNum >= 1 && qNum <= 3 ? year : year - 1;
    return `Q${qNum}-${fyYear}`;
}

export default function AdminDashboard() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const viewParam = searchParams.get("view");
    const [user, setUser] = useState(null);
    const [tab, setTabState] = useState(viewParam || "dashboard");
    const [loading, setLoading] = useState(true);
    const [dismissedAlerts, setDismissedAlerts] = useState([]);
    const [activity, setActivity] = useState([]);

    // Sidebar drives tab via ?view= query param; keep URL in sync when user triggers setTab.
    const setTab = (id) => {
        setTabState(id);
        const params = new URLSearchParams(Array.from(searchParams.entries()));
        if (id === "dashboard") params.delete("view"); else params.set("view", id);
        const qs = params.toString();
        router.replace(`/dashboard/admin${qs ? `?${qs}` : ""}`, { scroll: false });
    };

    // React to URL changes from sidebar clicks.
    useEffect(() => {
        const next = viewParam || "dashboard";
        if (next !== tab) setTabState(next);
    }, [viewParam]);

    // Confirm dialog
    const [confirm, setConfirm] = useState({ open: false, type: null });

    // Summary state
    const [report, setReport] = useState(null);
    const [reportLoading, setReportLoading] = useState(false);
    const [expandedSummaryDept, setExpandedSummaryDept] = useState(null);

    // Quarter management
    const [quarterName, setQuarterName] = useState("");
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [questionCount, setQuestionCount] = useState(15);
    const [quarterMsg, setQuarterMsg] = useState({ type: "", text: "" });
    const [quarterLoading, setQuarterLoading] = useState(false);

    // Questions
    const [questions, setQuestions] = useState([]);
    const [newQ, setNewQ] = useState({ text: "", textHindi: "", category: "ATTENDANCE", level: "SELF" });
    const [qMsg, setQMsg] = useState({ type: "", text: "" });
    const [qFilter, setQFilter] = useState({ level: "", category: "", search: "" });
    const [editingQ, setEditingQ] = useState(null);
    const [deleteQ, setDeleteQ] = useState(null);
    const [showAddForm, setShowAddForm] = useState(false);

    // Employees
    const [employees, setEmployees] = useState([]);
    const [empDepartments, setEmpDepartments] = useState([]);
    const [empTotal, setEmpTotal] = useState(0);
    const [empTotalPages, setEmpTotalPages] = useState(1);
    const [empPage, setEmpPage] = useState(1);
    const [empLoading, setEmpLoading] = useState(false);
    const [empFilter, setEmpFilter] = useState({ search: "", department: "", role: "", branch: "" });
    const [empBranches, setEmpBranches] = useState([]);

    // Employee management — add / remove (inline in admin dashboard)
    // Add employee state
    const [showAddEmp, setShowAddEmp] = useState(false);
    const [addForm, setAddForm] = useState({ name: "", mobile: "", departmentName: "", joiningDate: "", reason: "", empCode: "", designation: "" });
    const [addMsg, setAddMsg] = useState({ type: "", text: "" });
    const [addLoading, setAddLoading] = useState(false);

    // Remove employee state
    const [removeId, setRemoveId] = useState(null);
    const [removeReason, setRemoveReason] = useState("");
    const [removeLoading, setRemoveLoading] = useState(false);

    // Bulk upload state
    const [showBulkUpload, setShowBulkUpload] = useState(false);
    const [bulkFile, setBulkFile] = useState(null);
    const [bulkLoading, setBulkLoading] = useState(false);
    const [bulkResult, setBulkResult] = useState(null);
    const [bulkMsg, setBulkMsg] = useState({ type: "", text: "" });

    // HOD Assignment state
    const [hodAssignData, setHodAssignData] = useState(null);
    const [hodAssignLoading, setHodAssignLoading] = useState(false);
    const [hodAssignView, setHodAssignView] = useState("BLUE_COLLAR"); // WHITE_COLLAR | BLUE_COLLAR
    const [selectedHodId, setSelectedHodId] = useState(null);
    const [hodAssignFilter, setHodAssignFilter] = useState({ search: "", branchId: "", departmentId: "" });
    const [hodAssignMsg, setHodAssignMsg] = useState({ type: "", text: "" });
    const [pendingAssignments, setPendingAssignments] = useState({}); // { employeeId: hodUserId }

    const fetchHodAssignData = async () => {
        setHodAssignLoading(true);
        try {
            const res = await fetch("/api/admin/employee-hod-assignments");
            const json = await res.json();
            if (!res.ok || !json.success) throw new Error(json.message || "Failed to load");
            setHodAssignData(json.data);
            if (!selectedHodId && json.data.hods?.length > 0) setSelectedHodId(json.data.hods[0].id);
        } catch (err) {
            setHodAssignMsg({ type: "error", text: err.message || "Failed to load HOD assignments" });
        }
        setHodAssignLoading(false);
    };

    const saveHodAssignments = async () => {
        const assignments = Object.entries(pendingAssignments).map(([employeeId, hodUserId]) => ({ employeeId, hodUserId }));
        if (assignments.length === 0) {
            setHodAssignMsg({ type: "error", text: "No changes to save" });
            return;
        }
        try {
            const res = await fetch("/api/admin/employee-hod-assignments", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ assignments }),
            });
            const json = await res.json();
            if (!res.ok || !json.success) throw new Error(json.message || "Save failed");
            setHodAssignMsg({ type: "success", text: `Saved ${assignments.length} assignments.` });
            setPendingAssignments({});
            fetchHodAssignData();
        } catch (err) {
            setHodAssignMsg({ type: "error", text: err.message || "Save failed" });
        }
    };

    const unassignEmployee = async (employeeId) => {
        try {
            const res = await fetch(`/api/admin/employee-hod-assignments?employeeId=${employeeId}`, { method: "DELETE" });
            const json = await res.json();
            if (!res.ok || !json.success) throw new Error(json.message || "Unassign failed");
            setHodAssignMsg({ type: "success", text: "Unassigned." });
            fetchHodAssignData();
        } catch (err) {
            setHodAssignMsg({ type: "error", text: err.message || "Unassign failed" });
        }
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
            if (orgStructure.length > 0) fetchOrg();
        } catch (err) {
            setBulkMsg({ type: "error", text: err.message || "Bulk upload failed" });
        }
        setBulkLoading(false);
    };

    const downloadBulkTemplate = () => {
        const sampleRows = [
            { "Emp Code": "5100099", "Name": "Sample Name", "Department": "Production", "Branch": "Jaipur", "Designation": "Operator", "Mobile": "9876543210", "Collar Type": "BLUE_COLLAR" },
        ];
        const ws = XLSX.utils.json_to_sheet(sampleRows);
        ws["!cols"] = [{ wch: 12 }, { wch: 25 }, { wch: 20 }, { wch: 15 }, { wch: 20 }, { wch: 14 }, { wch: 14 }];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Employees");
        XLSX.writeFile(wb, "Employee_Upload_Template.xlsx");
    };

    // Edit employee modal state (admin only)
    const [editEmp, setEditEmp] = useState(null);           // employee being edited
    const [editForm, setEditForm] = useState({});           // form values
    const [editConfirm, setEditConfirm] = useState(false);  // show confirmation step
    const [editChanges, setEditChanges] = useState([]);     // list of changes to confirm
    const [editLoading, setEditLoading] = useState(false);
    const [editMsg, setEditMsg] = useState({ type: "", text: "" });

    const openEditModal = (emp) => {
        setEditEmp(emp);
        setEditForm({
            department: emp.departmentObj?.name || "",
            role: emp.role || "EMPLOYEE",
            designation: emp.designation === "—" ? "" : emp.designation || "",
            password: "",
        });
        setEditConfirm(false);
        setEditChanges([]);
        setEditMsg({ type: "", text: "" });
    };

    const buildChanges = () => {
        const changes = [];
        if (editForm.department && editForm.department !== (editEmp.departmentObj?.name || ""))
            changes.push(`Department: "${editEmp.departmentObj?.name || "—"}" → "${editForm.department}"`);
        if (editForm.role && editForm.role !== editEmp.role)
            changes.push(`Role: "${editEmp.role}" → "${editForm.role}"`);
        if (editForm.designation !== (editEmp.designation === "—" ? "" : editEmp.designation || ""))
            changes.push(`Designation: "${editEmp.designation === "—" ? "" : editEmp.designation || ""}" → "${editForm.designation}"`);
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
            if (editForm.department && editForm.department !== (editEmp.departmentObj?.name || "")) body.department = editForm.department;
            if (editForm.role && editForm.role !== editEmp.role) body.role = editForm.role;
            const origDesig = editEmp.designation === "—" ? "" : editEmp.designation || "";
            if (editForm.designation !== origDesig) body.designation = editForm.designation;
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

    // Add employee handler
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
            if (orgStructure.length > 0) fetchOrg();
        } catch (err) {
            setAddMsg({ type: "error", text: err.message || "Failed to add employee" });
        }
        setAddLoading(false);
    };

    // Remove employee handler
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
            fetchEmployees(1);
            if (orgStructure.length > 0) fetchOrg();
        } catch (err) {
            alert(err.message || "Failed to remove employee");
        }
        setRemoveLoading(false);
    };

    // Org Structure — expandable departments and person detail modal
    const [expandedDeptId, setExpandedDeptId] = useState(null);
    const [personDetail, setPersonDetail] = useState(null);

    const toggleDept = (deptId) => setExpandedDeptId(prev => prev === deptId ? null : deptId);

    const openPersonDetail = (person) => setPersonDetail(person);
    const closePersonDetail = () => setPersonDetail(null);

    // Excel export — downloads filtered employee list as .xlsx
    const [excelLoading, setExcelLoading] = useState(false);
    const downloadExcel = async () => {
        setExcelLoading(true);
        try {
            const params = new URLSearchParams({ page: "1", export: "true" });
            if (empFilter.search) params.set("search", empFilter.search);
            if (empFilter.department) params.set("department", empFilter.department);
            if (empFilter.role) params.set("role", empFilter.role);
            const d = await api(`/api/admin/employees?${params}`);
            const rows = (d.employees || []).map((e, i) => ({
                "S.No": i + 1,
                "Emp Code": e.empCode || "—",
                "Name": e.name,
                "Department": e.department,
                "Designation": e.designation || "—",
                "Mobile": e.mobile || "",
                "Role": (e.roles || [e.role]).join(", ").replace(/_/g, " "),
                "Evaluator Roles": (e.evaluatorRoles || []).map(er => `${er.role.replace(/_/g, " ")} — ${er.department}`).join("; "),
            }));
            const ws = XLSX.utils.json_to_sheet(rows);
            // Auto-size columns
            const colWidths = Object.keys(rows[0] || {}).map(key => ({
                wch: Math.max(key.length, ...rows.map(r => String(r[key] || "").length)) + 2,
            }));
            ws["!cols"] = colWidths;
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Employees");
            const filterLabel = [empFilter.department, empFilter.role?.replace(/_/g, " "), empFilter.search].filter(Boolean).join("_") || "All";
            XLSX.writeFile(wb, `Employees_${filterLabel}_${new Date().toISOString().slice(0, 10)}.xlsx`);
        } catch (err) {
            console.error("Excel export error:", err);
        }
        setExcelLoading(false);
    };

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
            if (d.branches) setEmpBranches(d.branches);
        } catch { }
        setEmpLoading(false);
    };

    // Logs
    const [logs, setLogs] = useState([]);
    const [logPage, setLogPage] = useState(1);
    const [logTotal, setLogTotal] = useState(0);
    const [logActions, setLogActions] = useState([]);
    const [logFilter, setLogFilter] = useState({ action: "", from: "", to: "" });

    useEffect(() => {
        (async () => {
            try {
                const d = await api("/api/auth/me");
                setUser(d.user);
            } catch { }
            setLoading(false);
        })();
    }, []);

    // Org Structure state
    const [orgStructure, setOrgStructure] = useState([]);
    const [orgLoading, setOrgLoading] = useState(false);
    const [orgBranchId, setOrgBranchId] = useState("");

    // Reassign role modal state (org structure tab)
    const [reassignModal, setReassignModal] = useState(null); // { dept: {id, name}, role }
    const [reassignSearch, setReassignSearch] = useState("");
    const [reassignTarget, setReassignTarget] = useState(null); // selected employee obj
    const [reassignAllEmps, setReassignAllEmps] = useState([]); // flat employee list for picker
    const [reassignLoading, setReassignLoading] = useState(false);
    const [reassignMsg, setReassignMsg] = useState({ type: "", text: "" });

    // Quarter Progress
    const [quarterProgress, setQuarterProgress] = useState(null);
    const [progressLoading, setProgressLoading] = useState(true);

    const fetchProgress = async () => {
        setProgressLoading(true);
        try {
            const d = await api("/api/admin/quarter-progress");
            setQuarterProgress(d);
        } catch {
            setQuarterProgress(null);
        }
        setProgressLoading(false);
    };

    const fetchReport = async () => {
        setReportLoading(true);
        try {
            const d = await api("/api/admin/export/quarter-report");
            setReport(d);
            return d;
        } catch {
            return null;
        } finally {
            setReportLoading(false);
        }
    };

    const fetchOrg = async () => {
        setOrgLoading(true);
        try {
            const d = await api("/api/admin/departments/all-assignments");
            setOrgStructure(d.departments);
            setOrgBranchId(prev => {
                const branchesInResp = Array.from(new Set((d.departments || []).map(x => x.branch))).filter(Boolean);
                if (prev && branchesInResp.includes(prev)) return prev;
                return branchesInResp[0] || "";
            });
        } catch { }
        setOrgLoading(false);
    };

    const openReassignModal = async (dept, role) => {
        setReassignModal({ dept, role });
        setReassignSearch("");
        setReassignTarget(null);
        setReassignMsg({ type: "", text: "" });
        if (reassignAllEmps.length === 0) {
            try {
                const d = await api("/api/admin/employees?export=true");
                setReassignAllEmps(d.employees || []);
            } catch { }
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

    const fetchQuestions = async () => {
        try {
            const d = await api("/api/admin/questions");
            setQuestions(d.questions);
        } catch { }
    };

    useEffect(() => {
        if (tab === "dashboard" && !quarterProgress) {
            fetchProgress();
            fetchReport();
        }
        if (tab === "pipeline" && !quarterProgress) fetchProgress();
        if (tab === "org" && orgStructure.length === 0) fetchOrg();
        if (tab === "questions" && questions.length === 0) fetchQuestions();
    }, [tab]);

    useEffect(() => {
        // Auto-refresh dashboard tab every 60s
        let interval;
        if (tab === "dashboard") {
            interval = setInterval(() => {
                fetchProgress();
            }, 60000);
        }
        return () => clearInterval(interval);
    }, [tab]);

    // Recent activity for the dashboard view.
    useEffect(() => {
        if (tab !== "dashboard") return;
        (async () => {
            try {
                const d = await api("/api/admin/audit-logs?page=1&limit=5");
                setActivity(d.logs || []);
            } catch { }
        })();
    }, [tab]);

    // ── CSV export ──
    const exportCSV = (data) => {
        const source = data || report;
        if (!source?.employees?.length) return;
        const stageLabel = { 1: "Self Assessment", 2: "BM / HOD", 3: "Cluster Manager", 4: "HR", 5: "Committee" };
        const csvData = source.employees.map((e) => ({
            "Employee Name": e.employeeName,
            "Department": e.department,
            "Self (norm)": e.selfNorm?.toFixed(1) || "-",
            "Self Contrib": e.selfContrib?.toFixed(1) || "-",
            "Sup Contrib": e.supContrib?.toFixed(1) || "-",
            "BM Contrib": e.bmContrib?.toFixed(1) || "-",
            "CM Contrib": e.cmContrib?.toFixed(1) || "-",
            "Final Score": e.finalScore?.toFixed(1) || "-",
            "Stage Reached": stageLabel[e.stageReached] || `Stage ${e.stageReached}`,
            "Best Employee": e.isBestEmployee ? "Yes" : "No",
        }));

        const csv = Papa.unparse(csvData);
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `quarter-report-${source.quarter?.name || "export"}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    };

    // Quarter actions — from Quarter tab (manual form)
    const requestStartQuarter = () => {
        if (!quarterName || !startDate || !endDate) return;
        setConfirm({ open: true, type: "start", autoMode: false });
    };

    // Quarter actions — from Summary tab (auto-defaults)
    const requestStartQuarterAuto = () => {
        setConfirm({ open: true, type: "start", autoMode: true });
    };

    const startQuarter = async () => {
        const isAuto = confirm.autoMode;
        setConfirm({ open: false, type: null });
        setQuarterLoading(true); setQuarterMsg({ type: "", text: "" });
        try {
            let body;
            if (isAuto) {
                const now = new Date();
                const month = now.getMonth();
                const year = now.getFullYear();
                const qNum = month < 3 ? 4 : month < 6 ? 1 : month < 9 ? 2 : 3;
                const fyYear = qNum >= 1 && qNum <= 3 ? year : year - 1;
                body = {
                    quarterName: `Q${qNum}-${fyYear}`,
                    dateRange: {
                        startDate: now.toISOString().split('T')[0],
                        endDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
                    },
                    questionCount: 15
                };
            } else {
                body = { 
                    quarterName, 
                    dateRange: { startDate, endDate }, 
                    questionCount: Number(questionCount) || 15 
                };
            }
            const d = await api("/api/admin/quarters/start", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            setQuarterMsg({ type: "success", text: d.message });
            setQuarterName(""); setStartDate(""); setEndDate("");
            setQuarterProgress(null);
            setReport(null);
            if (tab === "dashboard") { fetchProgress(); fetchReport(); }
        } catch (e) { setQuarterMsg({ type: "error", text: e.message }); }
        setQuarterLoading(false);
    };

    const requestCloseQuarter = () => {
        setConfirm({ open: true, type: "close" });
    };

    const closeQuarter = async () => {
        setConfirm({ open: false, type: null });
        setQuarterLoading(true); setQuarterMsg({ type: "", text: "" });
        try {
            const d = await api("/api/admin/quarters/close", { method: "POST" });
            setQuarterMsg({ type: "success", text: d.message });
            setQuarterProgress(null);
            setReport(null);
            if (tab === "dashboard") { fetchProgress(); fetchReport(); }
        } catch (e) { setQuarterMsg({ type: "error", text: e.message }); }
        setQuarterLoading(false);
    };

    // Questions
    const addQuestion = async () => {
        setQMsg({ type: "", text: "" });
        if (!newQ.text.trim()) { setQMsg({ type: "error", text: "Question text is required" }); return; }
        try {
            const d = await api("/api/admin/questions", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify(newQ),
            });
            setQuestions((prev) => [d.question, ...prev]);
            setNewQ({ text: "", textHindi: "", category: "ATTENDANCE", level: "SELF" });
            setShowAddForm(false);
            setQMsg({ type: "success", text: "Question added!" });
        } catch (e) { setQMsg({ type: "error", text: e.message }); }
    };

    const toggleQuestion = async (id) => {
        try {
            const d = await api(`/api/admin/questions/${id}`, { method: "PATCH" });
            setQuestions((prev) => prev.map((q) => (q.id === id ? d.question : q)));
        } catch { }
    };

    const saveEditQuestion = async () => {
        if (!editingQ) return;
        setQMsg({ type: "", text: "" });
        try {
            const d = await api(`/api/admin/questions/${editingQ.id}`, {
                method: "PUT", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: editingQ.text, textHindi: editingQ.textHindi, category: editingQ.category, level: editingQ.level }),
            });
            setQuestions((prev) => prev.map((q) => (q.id === editingQ.id ? d.question : q)));
            setEditingQ(null);
            setQMsg({ type: "success", text: "Question updated!" });
        } catch (e) { setQMsg({ type: "error", text: e.message }); }
    };

    const confirmDeleteQuestion = async () => {
        if (!deleteQ) return;
        setQMsg({ type: "", text: "" });
        try {
            await api(`/api/admin/questions/${deleteQ.id}`, { method: "DELETE" });
            setQuestions((prev) => prev.filter((q) => q.id !== deleteQ.id));
            setDeleteQ(null);
            setQMsg({ type: "success", text: "Question deleted!" });
        } catch (e) { setQMsg({ type: "error", text: e.message }); setDeleteQ(null); }
    };

    // Logs with filters
    const fetchLogs = async (page = 1, filters = logFilter) => {
        try {
            const params = new URLSearchParams({ page, limit: 20 });
            if (filters.action) params.set("action", filters.action);
            if (filters.from) params.set("from", new Date(filters.from).toISOString());
            if (filters.to) params.set("to", new Date(filters.to + "T23:59:59").toISOString());
            const d = await api(`/api/admin/audit-logs?${params}`);
            setLogs(d.logs); setLogTotal(d.pagination.totalPages); setLogPage(page);
            if (d.actions) setLogActions(d.actions);
        } catch { }
    };

    useEffect(() => { if (tab === "employees") fetchEmployees(1); }, [tab]);
    useEffect(() => { if (tab === "employees") { const t = setTimeout(() => fetchEmployees(1, empFilter), 300); return () => clearTimeout(t); } }, [empFilter.search, empFilter.department, empFilter.role, empFilter.branch]);

    useEffect(() => { if (tab === "logs") fetchLogs(); }, [tab]);

    // ── Branch management state ──
    const [branches, setBranches] = useState([]);
    const [branchLoading, setBranchLoading] = useState(false);
    const [branchMsg, setBranchMsg] = useState({ type: "", text: "" });
    const [newBranch, setNewBranch] = useState({ name: "", location: "", branchType: "SMALL" });
    const [editBranch, setEditBranch] = useState(null);

    const fetchBranches = async () => {
        setBranchLoading(true);
        try { const data = await api("/api/admin/branches"); setBranches(data.branches || []); }
        catch (e) { setBranchMsg({ type: "error", text: e.message }); }
        finally { setBranchLoading(false); }
    };

    const handleCreateBranch = async () => {
        setBranchMsg({ type: "", text: "" });
        try {
            await api("/api/admin/branches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newBranch) });
            setBranchMsg({ type: "success", text: "Branch created" });
            setNewBranch({ name: "", location: "", branchType: "SMALL" });
            fetchBranches();
        } catch (e) { setBranchMsg({ type: "error", text: e.message }); }
    };

    const handleUpdateBranch = async (id, updates) => {
        try {
            await api("/api/admin/branches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...updates }) });
            setBranchMsg({ type: "success", text: "Branch updated" });
            setEditBranch(null);
            fetchBranches();
        } catch (e) { setBranchMsg({ type: "error", text: e.message }); }
    };

    const handleCollarType = async (userId, collarType) => {
        try {
            await api("/api/admin/collar-type", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, collarType }) });
            fetchEmployees(empPage, empFilter);
        } catch (e) { alert(e.message); }
    };

    useEffect(() => { if (tab === "branches") fetchBranches(); }, [tab]);
    useEffect(() => { if (tab === "hodassign" && !hodAssignData) fetchHodAssignData(); }, [tab]);

    // Always load branches on mount so the Global/Branch dropdown is populated
    useEffect(() => { fetchBranches(); }, []);

    // Alerts derived from quarter progress: pending-stage warnings + days-left banner.
    const alerts = useMemo(() => {
        if (!quarterProgress) return [];
        const out = [];
        const endDate = quarterProgress.quarter?.endDate ? new Date(quarterProgress.quarter.endDate) : null;
        if (endDate) {
            const daysLeft = Math.ceil((endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            if (daysLeft > 0 && daysLeft <= 14) {
                out.push({ id: `qtr-ending-${daysLeft}`, type: daysLeft < 7 ? "warning" : "info", message: `${quarterProgress.quarter.name} ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"}.` });
            }
        }
        (quarterProgress.branches || []).forEach((b) => {
            const pending2 = (b.stage2.shortlisted || 0) - ((b.stage2.evaluatedByBm || 0) + (b.stage2.evaluatedByHod || 0));
            if (pending2 > 0) out.push({ id: `s2-${b.branchId}`, type: "info", message: `${b.branchName}: ${pending2} Stage-2 evaluation${pending2 === 1 ? "" : "s"} pending.` });
        });
        return out;
    }, [quarterProgress]);
    const visibleAlerts = alerts.filter(a => !dismissedAlerts.includes(a.id));

    const CATEGORIES = ["ATTENDANCE", "DISCIPLINE", "PRODUCTIVITY", "TEAMWORK", "INITIATIVE", "COMMUNICATION", "INTEGRITY"];
    const LEVELS = ["SELF", "BRANCH_MANAGER", "CLUSTER_MANAGER"];

    // Filtered + grouped questions
    const filteredQuestions = questions.filter((q) => {
        if (qFilter.level && q.level !== qFilter.level) return false;
        if (qFilter.category && q.category !== qFilter.category) return false;
        if (qFilter.search && !q.text.toLowerCase().includes(qFilter.search.toLowerCase())) return false;
        return true;
    });
    const activeCount = questions.filter((q) => q.isActive).length;
    const groupedByLevel = LEVELS.reduce((acc, level) => {
        const levelQs = filteredQuestions.filter((q) => q.level === level);
        if (levelQs.length > 0) acc.push({ level, questions: levelQs });
        return acc;
    }, []);

    if (loading) {
        return <DashboardShell user={user} title="Admin Dashboard"><div className="space-y-4"><SkeletonStats count={4} /><SkeletonCard lines={4} /><SkeletonCard lines={3} /></div></DashboardShell>;
    }

    return (
        <DashboardShell user={user} title="Admin Panel">
            {/* Profile Card */}
            <UserProfileCard user={user} roles={user?.departmentRoles?.map(dr => dr.role)} />

            {/* Global vs Branch dashboard selector */}
            <div className="mb-4 flex items-center gap-2 flex-wrap">
                <label className="text-[11px] font-bold uppercase tracking-wider text-[#999999]">Dashboard</label>
                <select
                    value=""
                    onChange={(e) => { if (e.target.value) router.push(`/dashboard/admin/${e.target.value}`); }}
                    className="border border-[#E0E0E0] rounded-lg px-3 py-2 text-sm font-medium text-[#333333] bg-white"
                >
                    <option value="">Global — all branches</option>
                    {branches.map(b => (
                        <option key={b.id} value={b.slug}>{b.name}{b.location ? ` — ${b.location}` : ""}</option>
                    ))}
                </select>
            </div>

            {/* ═══════ DASHBOARD TAB ═══════ */}
            {tab === "dashboard" && (
                <div className="space-y-6">
                    {/* Dismissible alerts */}
                    {visibleAlerts.length > 0 && (
                        <div className="space-y-2">
                            {visibleAlerts.map((a) => (
                                <Alert
                                    key={a.id}
                                    type={a.type}
                                    message={a.message}
                                    onClose={() => setDismissedAlerts((prev) => [...prev, a.id])}
                                />
                            ))}
                        </div>
                    )}
                    {progressLoading && !quarterProgress ? (
                        <div className="flex items-center justify-center h-48">
                            <div className="animate-spin h-8 w-8 border-2 border-[#003087] border-t-transparent rounded-full" />
                        </div>
                    ) : quarterProgress ? (
                        <>
                            {/* SECTION A — Quarter Status Bar */}
                            <div className="bg-white border border-[#E0E0E0] shadow-sm rounded-xl p-3 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
                                <div>
                                    <h2 className="text-lg sm:text-xl font-bold text-[#003087] flex items-center gap-2 sm:gap-3 flex-wrap">
                                        {quarterProgress.quarter.name}
                                        <span className={`text-[10px] sm:text-xs px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full border ${quarterProgress.quarter.status === "ACTIVE" ? "bg-[#E3F2FD] text-[#003087] border-[#90CAF9]" : "bg-[#FFEBEE] text-[#D32F2F] border-[#EF9A9A]"}`}>
                                            {quarterProgress.quarter.status}
                                        </span>
                                    </h2>
                                    <p className="text-[#333333] text-xs sm:text-sm mt-1 font-medium">
                                        Started: {new Date(quarterProgress.quarter.startDate).toLocaleDateString()}
                                    </p>
                                </div>
                                {quarterProgress.quarter.status === "ACTIVE" && (
                                    <button onClick={requestCloseQuarter} disabled={quarterLoading} className="w-full sm:w-auto px-4 py-2 bg-[#D32F2F] hover:bg-[#B71C1C] text-white font-bold rounded-lg text-sm transition-colors cursor-pointer shadow-sm">
                                        Close Quarter
                                    </button>
                                )}
                            </div>

                            {/* SECTION B — Overall Stats */}
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
                                <Stat
                                    label="Total Employees"
                                    value={quarterProgress.overallStats.totalEmployees}
                                    color="#1A1A2E"
                                />
                                <Stat
                                    label="Submitted"
                                    value={quarterProgress.overallStats.totalSubmitted}
                                    color="#003087"
                                    sub={`of ${quarterProgress.overallStats.totalEmployees}`}
                                />
                                <Stat
                                    label="Completion"
                                    value={`${quarterProgress.overallStats.overallPercentage}%`}
                                    color="#00843D"
                                />
                                <Stat
                                    label="Winners"
                                    value={
                                        quarterProgress.overallStats.quarterWinners?.length > 0
                                            ? `${quarterProgress.overallStats.quarterWinners.length} / ${quarterProgress.departments.length}`
                                            : "—"
                                    }
                                    color="#F7941D"
                                    sub={quarterProgress.overallStats.quarterWinners?.length > 0 ? undefined : "In progress"}
                                />
                            </div>

                            {/* SECTION — Branch-wise Stage Progress */}
                            {quarterProgress.branches && quarterProgress.branches.length > 0 && (
                                <div className="bg-white border border-[#E0E0E0] shadow-sm rounded-xl p-4 sm:p-6">
                                    <h3 className="text-lg font-bold text-[#003087] mb-4 flex items-center gap-2">
                                        Branch-wise Stage Progress
                                    </h3>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-[12px] border-collapse min-w-[880px]">
                                            <thead className="bg-[#F5F5F5]">
                                                <tr>
                                                    <th className="text-left px-3 py-2 font-bold text-[#333333]">Branch</th>
                                                    <th className="text-left px-3 py-2 font-bold text-[#333333]">Type</th>
                                                    <th className="text-right px-3 py-2 font-bold text-[#333333]">Employees</th>
                                                    <th className="text-right px-3 py-2 font-bold text-[#003087]">Stage 1<br /><span className="text-[9px] font-medium text-[#666666]">Submitted / Shortlisted</span></th>
                                                    <th className="text-right px-3 py-2 font-bold text-[#003087]">Stage 2<br /><span className="text-[9px] font-medium text-[#666666]">BM / HOD evals</span></th>
                                                    <th className="text-right px-3 py-2 font-bold text-[#003087]">Stage 3<br /><span className="text-[9px] font-medium text-[#666666]">CM evals</span></th>
                                                    <th className="text-right px-3 py-2 font-bold text-[#003087]">Stage 4<br /><span className="text-[9px] font-medium text-[#666666]">HR evals</span></th>
                                                    <th className="text-center px-3 py-2 font-bold text-[#F57C00]">Winners<br /><span className="text-[9px] font-medium text-[#666666]">(of expected)</span></th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {quarterProgress.branches.map((b) => {
                                                    const expected = b.branchType === "BIG" ? 4 : 3;
                                                    return (
                                                        <tr key={b.branchId} className="border-t border-[#E0E0E0] hover:bg-[#FAFCFF]">
                                                            <td className="px-3 py-2 font-bold text-[#1A1A2E]">{b.branchName}</td>
                                                            <td className="px-3 py-2">
                                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${b.branchType === "BIG" ? "bg-[#F3E5F5] text-[#6A1B9A] border-[#CE93D8]" : "bg-[#FFF8E1] text-[#F57F17] border-[#FFE082]"}`}>{b.branchType}</span>
                                                            </td>
                                                            <td className="px-3 py-2 text-right font-bold">{b.totalEmployees}</td>
                                                            <td className="px-3 py-2 text-right">
                                                                <span className="font-bold text-[#003087]">{b.stage1.submitted}</span>
                                                                <span className="text-[#999999]"> / </span>
                                                                <span className="font-bold text-[#00843D]">{b.stage1.shortlisted}</span>
                                                            </td>
                                                            <td className="px-3 py-2 text-right">
                                                                <span className="font-bold text-[#003087]">{b.stage2.evaluatedByBm + b.stage2.evaluatedByHod}</span>
                                                                <span className="text-[#999999]"> / </span>
                                                                <span className="font-bold text-[#00843D]">{b.stage2.shortlisted}</span>
                                                            </td>
                                                            <td className="px-3 py-2 text-right">
                                                                <span className="font-bold text-[#003087]">{b.stage3.evaluatedByCm}</span>
                                                                <span className="text-[#999999]"> / </span>
                                                                <span className="font-bold text-[#00843D]">{b.stage3.shortlisted}</span>
                                                            </td>
                                                            <td className="px-3 py-2 text-right">
                                                                <span className="font-bold text-[#003087]">{b.stage4.evaluatedByHr}</span>
                                                                <span className="text-[#999999]"> / </span>
                                                                <span className="font-bold text-[#00843D]">{b.stage4.shortlisted}</span>
                                                            </td>
                                                            <td className="px-3 py-2 text-center">
                                                                <span className={`font-bold ${b.winners.length >= expected ? "text-[#00843D]" : "text-[#F57C00]"}`}>{b.winners.length} / {expected}</span>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* SECTION — Branch Winners List */}
                            <div className="bg-gradient-to-r from-[#FFF8E1] to-[#FFF3E0] border border-[#FFCC80] rounded-xl p-4 sm:p-6 shadow-sm">
                                <h3 className="text-lg font-bold text-[#F57C00] mb-3 flex items-center gap-2">
                                    <span className="text-xl">🏆</span> Branch Winners
                                </h3>
                                {quarterProgress.branches && quarterProgress.branches.some(b => b.winners.length > 0) ? (
                                    <div className="space-y-3">
                                        {quarterProgress.branches.filter(b => b.winners.length > 0).map(b => (
                                            <div key={b.branchId} className="bg-white/80 border border-[#FFE0B2] rounded-lg p-3">
                                                <p className="text-[13px] font-bold text-[#F57C00] mb-2">{b.branchName} <span className="text-[10px] font-medium text-[#666666]">· {b.branchType === "BIG" ? "4 expected" : "3 expected"}</span></p>
                                                <div className="flex flex-wrap gap-2">
                                                    {b.winners.map((w, i) => (
                                                        <span key={w.id} className="text-[11px] font-bold px-2 py-1 rounded-full border"
                                                              style={{ backgroundColor: w.collarType === "WHITE_COLLAR" ? "#E3F2FD" : "#E8F5E9", color: w.collarType === "WHITE_COLLAR" ? "#003087" : "#00843D", borderColor: w.collarType === "WHITE_COLLAR" ? "#90CAF9" : "#A5D6A7" }}>
                                                            {i + 1}. {w.name} · {w.collarType === "WHITE_COLLAR" ? "WC" : "BC"}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-sm text-[#999999] italic">No winners declared yet. Evaluation in progress.</p>
                                )}
                            </div>

                            {/* SECTION — Legacy Department Winners (hidden placeholder) */}
                            <div className="hidden">
                                <h3 className="text-lg font-bold text-[#F57C00] mb-3 flex items-center gap-2">
                                    <span className="text-xl">🏆</span> Department Winners
                                </h3>
                                {quarterProgress.overallStats.quarterWinners && quarterProgress.overallStats.quarterWinners.length > 0 ? (
                                    <div className="overflow-hidden rounded-lg border border-[#FFE0B2]">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="bg-[#FFF3E0] border-b border-[#FFE0B2]">
                                                    <th className="text-left font-medium text-[#F57C00] px-4 py-2 text-xs">#</th>
                                                    <th className="text-left font-medium text-[#F57C00] px-4 py-2 text-xs">Employee Name</th>
                                                    <th className="text-left font-medium text-[#F57C00] px-4 py-2 text-xs">Department</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-[#FFE0B2]">
                                                {quarterProgress.overallStats.quarterWinners.map((w, i) => (
                                                    <tr key={i} className="bg-white/80 hover:bg-[#FFF8E1] transition-colors">
                                                        <td className="px-4 py-2.5 text-[#F7941D] font-bold">{i + 1}</td>
                                                        <td className="px-4 py-2.5 font-bold text-[#1A1A2E]">{w.name}</td>
                                                        <td className="px-4 py-2.5 text-[#666666]">{w.department}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <p className="text-sm text-[#999999] italic">No winners declared yet. Evaluation in progress.</p>
                                )}
                                {/* Show departments still pending */}
                                {quarterProgress.overallStats.quarterWinners && (() => {
                                    const winnerDepts = new Set(quarterProgress.overallStats.quarterWinners.map(w => w.department));
                                    const pendingDepts = quarterProgress.departments.filter(d => d.totalEmployees > 0 && !winnerDepts.has(d.departmentName));
                                    if (pendingDepts.length === 0) return null;
                                    return (
                                        <p className="text-xs text-[#999999] mt-3 italic">
                                            Pending: {pendingDepts.map(d => d.departmentName).join(", ")}
                                        </p>
                                    );
                                })()}
                            </div>

                            {/* SECTION E — Quick Actions */}
                            <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 sm:gap-3 pb-2">
                                <button onClick={() => setTab("questions")} className="px-3 sm:px-4 py-2 bg-white border border-[#CCCCCC] hover:bg-[#F5F5F5] hover:text-[#003087] text-[#333333] font-bold rounded-lg text-xs sm:text-sm transition-colors cursor-pointer shadow-sm">
                                    Manage Questions
                                </button>
                                <button onClick={() => setTab("logs")} className="px-3 sm:px-4 py-2 bg-white border border-[#CCCCCC] hover:bg-[#F5F5F5] hover:text-[#003087] text-[#333333] font-bold rounded-lg text-xs sm:text-sm transition-colors cursor-pointer shadow-sm">
                                    View Audit Logs
                                </button>
                                <button onClick={async () => { const d = await fetchReport(); if (d) exportCSV(d); }} className="px-3 sm:px-4 py-2 bg-[#003087] hover:bg-[#00843D] text-white font-bold rounded-lg text-xs sm:text-sm transition-colors cursor-pointer shadow-sm flex items-center justify-center gap-1.5 sm:gap-2">
                                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                    Export
                                </button>
                                <button onClick={fetchProgress} className="px-3 sm:px-4 py-2 bg-white border border-[#CCCCCC] hover:bg-[#E3F2FD] hover:text-[#003087] text-[#333333] font-bold rounded-lg text-xs sm:text-sm transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-sm">
                                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                    Refresh
                                </button>
                            </div>

                            {/* SECTION — Recent Activity */}
                            <div className="bg-white border border-[#E0E0E0] shadow-sm rounded-xl p-4 sm:p-6">
                                <h3 className="text-lg font-bold text-[#003087] mb-3">Recent Activity</h3>
                                {activity.length === 0 ? (
                                    <p className="text-sm text-[#999999] italic">No recent activity.</p>
                                ) : (
                                    <ul className="divide-y divide-[#E0E0E0]">
                                        {activity.map((log) => (
                                            <li key={log.id} className="py-2.5 flex items-start gap-3">
                                                <div className="w-2 h-2 mt-1.5 rounded-full bg-[#003087] shrink-0" />
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-[13px] text-[#1A1A2E]">
                                                        <span className="font-bold">{log.user?.name || "System"}</span>
                                                        <span className="text-[#666666]"> · {log.action.replace(/_/g, " ").toLowerCase()}</span>
                                                    </p>
                                                    <p className="text-[11px] text-[#999999] mt-0.5">{new Date(log.createdAt).toLocaleString()}</p>
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>

                            {/* Department-level progress now lives in the per-branch dashboard */}
                            <div className="bg-[#F5F5F5] border border-[#E0E0E0] rounded-xl p-5 text-center">
                                <p className="text-sm text-[#666666]">
                                    Department-level progress has moved into each branch's dashboard. Pick a branch from the dropdown at the top to see its evaluation pipeline.
                                </p>
                            </div>
                        </>
                    ) : (
                        <div className="bg-white border border-[#E0E0E0] rounded-xl p-10 text-center shadow-sm">
                            <div className="w-20 h-20 bg-[#E3F2FD] rounded-full flex items-center justify-center mx-auto mb-5">
                                <span className="text-3xl">📅</span>
                            </div>
                            <h3 className="text-xl font-bold text-[#003087] mb-2">No Active Quarter</h3>
                            <p className="text-[#333333] text-sm mb-6 max-w-md mx-auto">
                                No evaluation quarter is running. Start <span className="font-bold text-[#003087]">{getAutoQuarterName()}</span> to allow all employees to submit their self-assessments.
                            </p>

                            {quarterMsg.text && (
                                <div className={`mb-4 p-3 rounded-lg text-sm border max-w-md mx-auto ${quarterMsg.type === "success" ? "bg-[#E8F5E9] border-[#A5D6A7] text-[#1B5E20]" : "bg-[#FFEBEE] border-[#EF9A9A] text-[#D32F2F]"}`}>{quarterMsg.text}</div>
                            )}

                            <div className="flex gap-3 justify-center">
                                <button
                                    onClick={requestStartQuarterAuto}
                                    disabled={quarterLoading}
                                    className="min-h-[48px] px-8 py-3 bg-[#003087] hover:bg-[#00843D] text-white font-bold rounded-lg text-[15px] cursor-pointer transition-all shadow-md disabled:bg-[#CCCCCC] disabled:cursor-not-allowed flex items-center gap-2"
                                >
                                    {quarterLoading ? (
                                        <><div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" /> Starting...</>
                                    ) : (
                                        <><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> Start {getAutoQuarterName()}</>
                                    )}
                                </button>
                                <button onClick={fetchProgress} className="min-h-[48px] px-6 py-3 bg-white border border-[#CCCCCC] hover:bg-[#F5F5F5] text-[#333333] font-bold rounded-lg text-[14px] cursor-pointer transition-colors">
                                    Check Again
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ═══════ PIPELINE TAB — per-branch drill-down ═══════ */}
            {tab === "pipeline" && (
                <div className="space-y-6">
                    {!quarterProgress ? (
                        <div className="bg-white border border-[#E0E0E0] rounded-xl p-8 text-center text-sm text-[#666666]">
                            {progressLoading ? "Loading pipeline..." : "No active quarter."}
                        </div>
                    ) : (
                        <>
                            <h2 className="text-xl font-bold text-[#003087]">Evaluation Pipeline</h2>
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                {(quarterProgress.branches || []).map((b) => {
                                    const stages = [
                                        { label: "Stage 1 — Self", done: b.stage1.submitted, total: b.totalEmployees, color: "#003087" },
                                        { label: "Stage 2 — BM/HOD", done: (b.stage2.evaluatedByBm || 0) + (b.stage2.evaluatedByHod || 0), total: b.stage2.shortlisted, color: "#00843D" },
                                        { label: "Stage 3 — CM", done: b.stage3.evaluatedByCm, total: b.stage3.shortlisted, color: "#F7941D" },
                                        { label: "Stage 4 — HR", done: b.stage4.evaluatedByHr, total: b.stage4.shortlisted, color: "#D32F2F" },
                                        { label: "Winners", done: b.winners.length, total: b.branchType === "BIG" ? 4 : 3, color: "#6A1B9A" },
                                    ];
                                    return (
                                        <div key={b.branchId} className="bg-white border border-[#E0E0E0] rounded-xl p-4 shadow-sm">
                                            <div className="flex items-center justify-between mb-3">
                                                <h3 className="font-bold text-[#1A1A2E]">{b.branchName}</h3>
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${b.branchType === "BIG" ? "bg-[#F3E5F5] text-[#6A1B9A] border-[#CE93D8]" : "bg-[#FFF8E1] text-[#F57F17] border-[#FFE082]"}`}>{b.branchType}</span>
                                            </div>
                                            <div className="space-y-2.5">
                                                {stages.map((s) => {
                                                    const pct = s.total > 0 ? Math.min(100, Math.round((s.done / s.total) * 100)) : 0;
                                                    return (
                                                        <div key={s.label}>
                                                            <div className="flex items-center justify-between text-[11px] mb-1">
                                                                <span className="font-bold text-[#333333]">{s.label}</span>
                                                                <span className="text-[#666666]"><span className="font-bold" style={{ color: s.color }}>{s.done}</span> / {s.total}</span>
                                                            </div>
                                                            <div className="h-1.5 bg-[#F5F5F5] rounded-full overflow-hidden">
                                                                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: s.color }} />
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* ═══════ BRANCHES TAB ═══════ */}
            {tab === "branches" && (
                <div className="space-y-6">
                    <h2 className="text-xl font-bold text-[#003087]">Branch Management</h2>
                    {branchMsg.text && <div className={`p-3 rounded-lg text-sm font-medium ${branchMsg.type === "error" ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>{branchMsg.text}</div>}

                    {/* Add Branch */}
                    <div className="bg-white border border-[#E0E0E0] rounded-xl p-4 space-y-3">
                        <h3 className="font-bold text-[#003087]">Add New Branch</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                            <input value={newBranch.name} onChange={e => setNewBranch(p => ({ ...p, name: e.target.value }))} placeholder="Branch Name" className="border rounded-lg px-3 py-2 text-sm" />
                            <input value={newBranch.location} onChange={e => setNewBranch(p => ({ ...p, location: e.target.value }))} placeholder="Location" className="border rounded-lg px-3 py-2 text-sm" />
                            <select value={newBranch.branchType} onChange={e => setNewBranch(p => ({ ...p, branchType: e.target.value }))} className="border rounded-lg px-3 py-2 text-sm">
                                <option value="SMALL">Small Branch</option>
                                <option value="BIG">Big Branch</option>
                            </select>
                            <button onClick={handleCreateBranch} className="bg-[#003087] text-white rounded-lg px-4 py-2 text-sm font-bold hover:bg-[#002266] cursor-pointer">Create Branch</button>
                        </div>
                    </div>

                    {/* Branch List */}
                    {branchLoading ? <div className="text-center py-8 text-gray-500">Loading...</div> : (
                        <div className="grid gap-4">
                            {branches.map(branch => (
                                <div
                                    key={branch.id}
                                    onClick={() => router.push(`/dashboard/admin/${branch.slug}`)}
                                    className="bg-white border border-[#E0E0E0] rounded-xl p-4 hover:shadow-md hover:border-[#003087] transition-all cursor-pointer"
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-3 h-3 rounded-full ${branch.branchType === "BIG" ? "bg-orange-500" : "bg-green-500"}`} />
                                            <div>
                                                <h4 className="font-bold text-[#003087]">{branch.name}</h4>
                                                <p className="text-xs text-gray-500">{branch.location} &bull; {branch.branchType} branch &bull; {branch._count?.departments || 0} departments</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                            <span className={`px-2 py-1 rounded text-xs font-bold ${branch.branchType === "BIG" ? "bg-orange-100 text-orange-700" : "bg-green-100 text-green-700"}`}>{branch.branchType}</span>
                                            {editBranch?.id === branch.id ? (
                                                <div className="flex items-center gap-2">
                                                    <select value={editBranch.branchType} onChange={e => setEditBranch(p => ({ ...p, branchType: e.target.value }))} className="border rounded px-2 py-1 text-xs">
                                                        <option value="SMALL">Small</option>
                                                        <option value="BIG">Big</option>
                                                    </select>
                                                    <button onClick={() => handleUpdateBranch(branch.id, { branchType: editBranch.branchType })} className="text-xs px-2 py-1 bg-blue-600 text-white rounded cursor-pointer">Save</button>
                                                    <button onClick={() => setEditBranch(null)} className="text-xs px-2 py-1 bg-gray-300 rounded cursor-pointer">Cancel</button>
                                                </div>
                                            ) : (
                                                <button onClick={() => setEditBranch({ id: branch.id, branchType: branch.branchType })} className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded cursor-pointer">Edit Type</button>
                                            )}
                                        </div>
                                    </div>
                                    {branch.departments?.length > 0 && (
                                        <div className="mt-3 flex flex-wrap gap-1.5">
                                            {branch.departments.map(d => (
                                                <span key={d.id} className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] rounded-full font-medium">{d.name}</span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ═══════ ORG STRUCTURE TAB ═══════ */}
            {tab === "org" && (
                <div className="space-y-6">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                        <h2 className="text-xl font-bold text-[#003087]">Organization Structure</h2>
                        <div className="flex items-center gap-2">
                            <select
                                value={orgBranchId}
                                onChange={(e) => setOrgBranchId(e.target.value)}
                                className="border border-[#CCCCCC] rounded-lg px-3 py-2 text-sm font-medium text-[#333333] bg-white min-h-[44px]"
                            >
                                {Array.from(new Set(orgStructure.map(d => d.branch))).filter(Boolean).map(name => (
                                    <option key={name} value={name}>{name}</option>
                                ))}
                            </select>
                            <button onClick={fetchOrg} className="px-3 py-2 min-h-[44px] min-w-[80px] bg-white border border-[#CCCCCC] rounded-lg text-[#333333] font-bold hover:text-[#003087] hover:bg-[#F5F5F5] text-[14px] flex items-center gap-1.5 cursor-pointer transition-colors">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                Refresh
                            </button>
                        </div>
                    </div>

                    {orgLoading ? (
                        <div className="flex items-center justify-center h-32"><div className="animate-spin h-8 w-8 border-2 border-[#003087] border-t-transparent rounded-full" /></div>
                    ) : (
                        <div className="grid grid-cols-1 gap-4">
                            {orgStructure.filter(dept => !orgBranchId || dept.branch === orgBranchId).map((dept) => {
                                const isExpanded = expandedDeptId === dept.id;
                                return (
                                <div key={dept.id} className={`bg-white border rounded-xl shadow-sm transition-all ${isExpanded ? "border-[#003087] ring-1 ring-[#003087]/20" : "border-[#E0E0E0]"}`}>
                                    {/* Department Header — clickable */}
                                    <button onClick={() => toggleDept(dept.id)} className="w-full flex items-center justify-between p-3 sm:p-5 cursor-pointer text-left group">
                                        <div className="flex-1">
                                            <h3 className="text-base sm:text-lg font-bold text-[#003087] group-hover:text-[#00843D] transition-colors">{dept.name}</h3>
                                            <p className="text-[10px] sm:text-xs text-[#666666] uppercase tracking-wider">{dept.branch} Branch &middot; {dept.employeeCount} Employees</p>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            {/* Collar badge + top evaluator summary */}
                                            <div className="hidden sm:flex gap-1.5 items-center">
                                                {dept.collarType === "WHITE_COLLAR" ? (
                                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-[#003087] border border-blue-200 font-bold">WHITE COLLAR</span>
                                                ) : (
                                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-[#00843D] border border-emerald-200 font-bold">BLUE COLLAR</span>
                                                )}
                                                {dept.collarType === "WHITE_COLLAR" && dept.branchManagers?.[0] && (
                                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#F5F5F5] text-[#333333] border border-[#E0E0E0] font-bold">BM: {dept.branchManagers[0].name.split(" ")[0]}</span>
                                                )}
                                                {dept.collarType !== "WHITE_COLLAR" && dept.hods?.[0] && (
                                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#F5F5F5] text-[#333333] border border-[#E0E0E0] font-bold">HOD: {dept.hods[0].name.split(" ")[0]}</span>
                                                )}
                                            </div>
                                            <svg className={`w-5 h-5 text-[#666666] transition-transform ${isExpanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                        </div>
                                    </button>

                                    {/* Expanded content */}
                                    {isExpanded && (
                                        <div className="border-t border-[#E0E0E0] p-3 sm:p-5 space-y-5">
                                            {/* Single evaluator card: BM (WC) or HOD (BC) */}
                                            {dept.collarType === "WHITE_COLLAR" ? (
                                                <div className="bg-blue-50/60 rounded-lg p-4 border border-blue-100">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <p className="text-xs font-bold text-[#003087] uppercase tracking-wider">Branch Manager (Evaluator)</p>
                                                        <button onClick={() => openReassignModal({ id: dept.id, name: dept.name }, "BRANCH_MANAGER")} className="text-[10px] px-2 py-0.5 rounded bg-[#003087] text-white font-bold hover:bg-[#00843D] transition-colors cursor-pointer">Reassign</button>
                                                    </div>
                                                    {dept.branchManagers?.length > 0 ? (
                                                        <div className="space-y-2">
                                                            {dept.branchManagers.map(bm => (
                                                                <button key={bm.id} onClick={() => openPersonDetail(bm)} className="w-full text-left p-2 rounded-lg hover:bg-white transition-colors cursor-pointer group/person">
                                                                    <p className="text-sm text-[#003087] font-semibold group-hover/person:underline">{bm.name}</p>
                                                                    <p className="text-xs text-[#666666]">{bm.designation || "—"} {bm.empCode ? `(${bm.empCode})` : ""}</p>
                                                                </button>
                                                            ))}
                                                        </div>
                                                    ) : <p className="text-sm text-[#999999] italic">Not Assigned</p>}
                                                </div>
                                            ) : (
                                                <div className="bg-emerald-50/60 rounded-lg p-4 border border-emerald-100">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <p className="text-xs font-bold text-[#00843D] uppercase tracking-wider">Head of Department (Evaluator)</p>
                                                        <button onClick={() => openReassignModal({ id: dept.id, name: dept.name }, "HOD")} className="text-[10px] px-2 py-0.5 rounded bg-[#00843D] text-white font-bold hover:bg-[#003087] transition-colors cursor-pointer">Reassign</button>
                                                    </div>
                                                    {dept.hods?.length > 0 ? (
                                                        <div className="space-y-2">
                                                            {dept.hods.map(h => (
                                                                <button key={h.id} onClick={() => openPersonDetail(h)} className="w-full text-left p-2 rounded-lg hover:bg-white transition-colors cursor-pointer group/person">
                                                                    <p className="text-sm text-[#00843D] font-semibold group-hover/person:underline">{h.name}</p>
                                                                    <p className="text-xs text-[#666666]">{h.designation || "—"} {h.empCode ? `(${h.empCode})` : ""}</p>
                                                                </button>
                                                            ))}
                                                        </div>
                                                    ) : <p className="text-sm text-[#999999] italic">Not Assigned</p>}
                                                </div>
                                            )}

                                            {/* Employee List */}
                                            <div>
                                                <div className="flex items-center justify-between mb-2">
                                                    <p className="text-xs font-bold text-[#333333] uppercase tracking-wider">All Employees ({dept.employees?.length || 0})</p>
                                                    <button onClick={() => { setShowAddEmp(true); setAddForm({ ...addForm, departmentName: dept.name }); setAddMsg({ type: "", text: "" }); setTab("employees"); }} className="text-[10px] px-2.5 py-1 rounded bg-[#00843D] text-white font-bold hover:bg-[#006B32] transition-colors cursor-pointer flex items-center gap-1">
                                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                                                        Add Employee
                                                    </button>
                                                </div>
                                                {dept.employees?.length > 0 ? (
                                                    <div className="border border-[#E0E0E0] rounded-lg overflow-hidden">
                                                        <div className="overflow-x-auto">
                                                            <table className="w-full text-left border-collapse">
                                                                <thead>
                                                                    <tr className="bg-[#F5F5F5] border-b border-[#E0E0E0]">
                                                                        <th className="px-3 py-2 text-[10px] font-bold text-[#666666] uppercase">Emp Code</th>
                                                                        <th className="px-3 py-2 text-[10px] font-bold text-[#666666] uppercase">Name</th>
                                                                        <th className="px-3 py-2 text-[10px] font-bold text-[#666666] uppercase">Designation</th>
                                                                        <th className="px-3 py-2 text-[10px] font-bold text-[#666666] uppercase">Mobile</th>
                                                                        <th className="px-3 py-2 text-[10px] font-bold text-[#666666] uppercase">Roles</th>
                                                                        <th className="px-3 py-2 text-[10px] font-bold text-[#666666] uppercase">Action</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="divide-y divide-[#E0E0E0]">
                                                                    {dept.employees.map(emp => (
                                                                        <tr key={emp.id} className="hover:bg-[#FAFAFA] transition-colors">
                                                                            <td className="px-3 py-2 text-xs text-[#333333] font-mono">{emp.empCode || "—"}</td>
                                                                            <td className="px-3 py-2">
                                                                                <button onClick={() => openPersonDetail(emp)} className="text-xs font-bold text-[#003087] hover:underline cursor-pointer text-left">{emp.name}</button>
                                                                            </td>
                                                                            <td className="px-3 py-2 text-xs text-[#666666]">{emp.designation || "—"}</td>
                                                                            <td className="px-3 py-2 text-xs text-[#666666]">{emp.mobile || <span className="text-[#BBB] italic">—</span>}</td>
                                                                            <td className="px-3 py-2">
                                                                                <div className="flex flex-wrap gap-1">
                                                                                    {(emp.roles || [emp.role]).map(r => (
                                                                                        <span key={r} className={`text-[9px] px-1.5 py-0.5 rounded-full border font-bold uppercase ${r === "EMPLOYEE" ? "bg-gray-50 text-gray-600 border-gray-200" : r === "SUPERVISOR" ? "bg-blue-50 text-[#003087] border-blue-200" : r === "BRANCH_MANAGER" ? "bg-emerald-50 text-[#00843D] border-emerald-200" : r === "CLUSTER_MANAGER" ? "bg-orange-50 text-[#F7941D] border-orange-200" : "bg-[#003087] text-white border-[#003087]"}`}>{r.replace(/_/g, " ")}</span>
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
                                                ) : <p className="text-sm text-[#999999] italic">No employees in this department</p>}
                                            </div>
                                        </div>
                                    )}
                                </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* ═══════ ASSIGN HODs TAB ═══════ */}
            {tab === "hodassign" && (
                <div className="space-y-4">
                    {hodAssignMsg.text && (
                        <div className={`p-3 rounded-lg text-sm border ${hodAssignMsg.type === "success" ? "bg-[#E8F5E9] border-[#A5D6A7] text-[#1B5E20]" : "bg-[#FFEBEE] border-[#EF9A9A] text-[#D32F2F]"}`}>
                            {hodAssignMsg.text}
                        </div>
                    )}

                    {/* WC / BC Split toggle */}
                    <div className="bg-white border border-[#E0E0E0] shadow-sm rounded-xl p-5">
                        <h3 className="text-[16px] font-bold text-[#003087] mb-3">Employee Evaluation Assignment</h3>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setHodAssignView("WHITE_COLLAR")}
                                className={`flex-1 min-h-[48px] px-4 py-3 rounded-lg text-[14px] font-bold border-2 transition-all ${hodAssignView === "WHITE_COLLAR" ? "bg-[#003087] text-white border-[#003087]" : "bg-white text-[#003087] border-[#90CAF9] hover:bg-[#E3F2FD]"}`}
                            >
                                White Collar
                                <span className="block text-[11px] font-medium opacity-90 mt-0.5">Evaluated by Branch Manager</span>
                            </button>
                            <button
                                onClick={() => setHodAssignView("BLUE_COLLAR")}
                                className={`flex-1 min-h-[48px] px-4 py-3 rounded-lg text-[14px] font-bold border-2 transition-all ${hodAssignView === "BLUE_COLLAR" ? "bg-[#00843D] text-white border-[#00843D]" : "bg-white text-[#00843D] border-[#A5D6A7] hover:bg-[#E8F5E9]"}`}
                            >
                                Blue Collar · Assign HODs
                                <span className="block text-[11px] font-medium opacity-90 mt-0.5">Admin assigns employees to HODs</span>
                            </button>
                        </div>
                    </div>

                    {hodAssignLoading && !hodAssignData && (
                        <div className="flex items-center justify-center h-32"><div className="animate-spin h-8 w-8 border-2 border-[#003087] border-t-transparent rounded-full" /></div>
                    )}

                    {hodAssignData && hodAssignView === "WHITE_COLLAR" && (
                        <div className="bg-white border border-[#E0E0E0] shadow-sm rounded-xl p-5">
                            <h3 className="text-[15px] font-bold text-[#003087] mb-3">White Collar Employees</h3>
                            <p className="text-[12px] text-[#666666] mb-3">These employees are evaluated directly by the Branch Manager. HODs with white-collar designation are also listed here.</p>
                            <div className="overflow-x-auto">
                                <table className="w-full text-[12px] border-collapse">
                                    <thead className="bg-[#F5F5F5]">
                                        <tr>
                                            <th className="text-left px-3 py-2 font-bold text-[#333333]">Emp Code</th>
                                            <th className="text-left px-3 py-2 font-bold text-[#333333]">Name</th>
                                            <th className="text-left px-3 py-2 font-bold text-[#333333]">Department</th>
                                            <th className="text-left px-3 py-2 font-bold text-[#333333]">Branch</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {hodAssignData.employees.filter(e => e.collarType === "WHITE_COLLAR").map(e => (
                                            <tr key={e.id} className="border-t border-[#E0E0E0] hover:bg-[#FAFCFF]">
                                                <td className="px-3 py-2 font-medium">{e.empCode}</td>
                                                <td className="px-3 py-2">{e.name}</td>
                                                <td className="px-3 py-2 text-[#666666]">{e.department}</td>
                                                <td className="px-3 py-2 text-[#666666]">{e.branch}</td>
                                            </tr>
                                        ))}
                                        {hodAssignData.employees.filter(e => e.collarType === "WHITE_COLLAR").length === 0 && (
                                            <tr><td colSpan={4} className="px-3 py-6 text-center text-[#999999]">No white collar employees found.</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {hodAssignData && hodAssignView === "BLUE_COLLAR" && (
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                            {/* HOD list sidebar */}
                            <div className="bg-white border border-[#E0E0E0] shadow-sm rounded-xl p-4 lg:col-span-1">
                                <h4 className="text-[13px] font-bold text-[#00843D] mb-3 uppercase tracking-wider">HODs ({hodAssignData.hods.length})</h4>
                                <div className="space-y-2 max-h-[500px] overflow-y-auto">
                                    {hodAssignData.hods.length === 0 && <p className="text-[12px] text-[#999999] italic">No HODs assigned. Assign HOD role to users in Org Structure tab first.</p>}
                                    {hodAssignData.hods.map(h => (
                                        <button
                                            key={h.id}
                                            onClick={() => setSelectedHodId(h.id)}
                                            className={`w-full text-left border rounded-lg p-3 transition-all ${selectedHodId === h.id ? "bg-[#E8F5E9] border-[#00843D] shadow-sm" : "bg-white border-[#E0E0E0] hover:bg-[#FAFCFF]"}`}
                                        >
                                            <p className="text-[13px] font-bold text-[#1A1A2E]">{h.name}</p>
                                            <p className="text-[11px] text-[#666666]">{h.empCode} · {h.branchName || "—"}</p>
                                            <div className="flex items-center gap-2 mt-2">
                                                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#E3F2FD] text-[#003087]">Assigned: {h.assignedCount}</span>
                                                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#E8F5E9] text-[#00843D]">Evaluated: {h.evaluatedCount}</span>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Employee list */}
                            <div className="bg-white border border-[#E0E0E0] shadow-sm rounded-xl p-4 lg:col-span-2">
                                <div className="flex items-center justify-between mb-3">
                                    <h4 className="text-[13px] font-bold text-[#003087] uppercase tracking-wider">Blue Collar Employees</h4>
                                    <button
                                        onClick={saveHodAssignments}
                                        disabled={Object.keys(pendingAssignments).length === 0}
                                        className="min-h-[36px] px-4 py-2 bg-[#00843D] hover:bg-[#006633] text-white text-[12px] font-bold rounded-lg disabled:bg-[#CCCCCC] disabled:cursor-not-allowed"
                                    >
                                        Save {Object.keys(pendingAssignments).length > 0 ? `(${Object.keys(pendingAssignments).length})` : ""}
                                    </button>
                                </div>

                                {/* Filters */}
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
                                    <input
                                        type="text"
                                        placeholder="Search name / code"
                                        value={hodAssignFilter.search}
                                        onChange={e => setHodAssignFilter({ ...hodAssignFilter, search: e.target.value })}
                                        className="px-3 py-2 border border-[#CCCCCC] rounded-lg text-[12px] focus:outline-none focus:ring-2 focus:ring-[#003087]"
                                    />
                                    <select
                                        value={hodAssignFilter.branchId}
                                        onChange={e => setHodAssignFilter({ ...hodAssignFilter, branchId: e.target.value })}
                                        className="px-3 py-2 border border-[#CCCCCC] rounded-lg text-[12px] focus:outline-none focus:ring-2 focus:ring-[#003087]"
                                    >
                                        <option value="">All Branches</option>
                                        {[...new Map(hodAssignData.employees.map(e => [e.branchId, e.branch])).entries()].map(([id, name]) => (
                                            <option key={id} value={id}>{name}</option>
                                        ))}
                                    </select>
                                    <select
                                        value={hodAssignFilter.departmentId}
                                        onChange={e => setHodAssignFilter({ ...hodAssignFilter, departmentId: e.target.value })}
                                        className="px-3 py-2 border border-[#CCCCCC] rounded-lg text-[12px] focus:outline-none focus:ring-2 focus:ring-[#003087]"
                                    >
                                        <option value="">All Departments</option>
                                        {[...new Map(hodAssignData.employees.map(e => [e.departmentId, e.department])).entries()].map(([id, name]) => (
                                            <option key={id} value={id}>{name}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="overflow-x-auto max-h-[500px]">
                                    <table className="w-full text-[12px] border-collapse">
                                        <thead className="bg-[#F5F5F5] sticky top-0">
                                            <tr>
                                                <th className="text-left px-3 py-2 font-bold text-[#333333]">Emp Code</th>
                                                <th className="text-left px-3 py-2 font-bold text-[#333333]">Name</th>
                                                <th className="text-left px-3 py-2 font-bold text-[#333333]">Department</th>
                                                <th className="text-left px-3 py-2 font-bold text-[#333333]">Branch</th>
                                                <th className="text-left px-3 py-2 font-bold text-[#333333]">Current HOD</th>
                                                <th className="text-left px-3 py-2 font-bold text-[#333333]">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {hodAssignData.employees
                                                .filter(e => e.collarType === "BLUE_COLLAR")
                                                .filter(e => {
                                                    if (hodAssignFilter.search) {
                                                        const s = hodAssignFilter.search.toLowerCase();
                                                        if (!e.name.toLowerCase().includes(s) && !e.empCode.toLowerCase().includes(s)) return false;
                                                    }
                                                    if (hodAssignFilter.branchId && e.branchId !== hodAssignFilter.branchId) return false;
                                                    if (hodAssignFilter.departmentId && e.departmentId !== hodAssignFilter.departmentId) return false;
                                                    return true;
                                                })
                                                .map(e => {
                                                    const pendingHod = pendingAssignments[e.id];
                                                    const currentHodId = pendingHod !== undefined ? pendingHod : e.assignedHodId;
                                                    const currentHod = hodAssignData.hods.find(h => h.id === currentHodId);
                                                    const isPending = pendingHod !== undefined;
                                                    return (
                                                        <tr key={e.id} className={`border-t border-[#E0E0E0] ${isPending ? "bg-[#FFF8E1]" : "hover:bg-[#FAFCFF]"}`}>
                                                            <td className="px-3 py-2 font-medium">{e.empCode}</td>
                                                            <td className="px-3 py-2">{e.name}</td>
                                                            <td className="px-3 py-2 text-[#666666]">{e.department}</td>
                                                            <td className="px-3 py-2 text-[#666666]">{e.branch}</td>
                                                            <td className="px-3 py-2">
                                                                {currentHod ? (
                                                                    <span className="text-[11px] font-bold text-[#00843D]">{currentHod.name}</span>
                                                                ) : (
                                                                    <span className="text-[11px] text-[#999999] italic">Unassigned</span>
                                                                )}
                                                            </td>
                                                            <td className="px-3 py-2">
                                                                <div className="flex items-center gap-2">
                                                                    <button
                                                                        onClick={() => {
                                                                            if (!selectedHodId) { setHodAssignMsg({ type: "error", text: "Select an HOD first" }); return; }
                                                                            setPendingAssignments({ ...pendingAssignments, [e.id]: selectedHodId });
                                                                        }}
                                                                        className="px-2 py-1 bg-[#003087] hover:bg-[#00843D] text-white text-[10px] font-bold rounded"
                                                                    >
                                                                        Assign to selected
                                                                    </button>
                                                                    {e.assignedHodId && !isPending && (
                                                                        <button
                                                                            onClick={() => unassignEmployee(e.id)}
                                                                            className="px-2 py-1 bg-[#FFEBEE] hover:bg-[#FFCDD2] text-[#D32F2F] text-[10px] font-bold rounded border border-[#EF9A9A]"
                                                                        >
                                                                            Unassign
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ═══════ QUARTER TAB ═══════ */}
            {tab === "quarter" && (
                <div className="space-y-6">
                    {quarterMsg.text && (
                        <div className={`p-3 rounded-lg text-sm border ${quarterMsg.type === "success" ? "bg-[#E3F2FD] border-[#90CAF9] text-[#003087]" : "bg-[#FFEBEE] border-[#EF9A9A] text-[#D32F2F]"}`}>{quarterMsg.text}</div>
                    )}
                    <div className="bg-white border border-[#E0E0E0] shadow-sm rounded-xl p-6">
                        <h3 className="text-lg font-semibold text-[#003087] mb-4">Start New Quarter</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                            <div><label className="block text-sm text-[#333333] mb-1 font-medium">Quarter Name</label><input type="text" value={quarterName} onChange={(e) => setQuarterName(e.target.value)} placeholder="Q1-2025" className="w-full px-3 py-2 bg-white border border-[#CCCCCC] rounded-lg text-[#1A1A2E] text-sm focus:outline-none focus:ring-2 focus:ring-[#003087]" /></div>
                            <div><label className="block text-sm text-[#333333] mb-1 font-medium">Question Count per Level</label><input type="number" value={questionCount} onChange={(e) => setQuestionCount(parseInt(e.target.value))} min={10} max={25} className="w-full px-3 py-2 bg-white border border-[#CCCCCC] rounded-lg text-[#1A1A2E] text-sm focus:outline-none focus:ring-2 focus:ring-[#003087]" /></div>
                            <div><label className="block text-sm text-[#333333] mb-1 font-medium">Start Date</label><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full px-3 py-2 bg-white border border-[#CCCCCC] rounded-lg text-[#1A1A2E] text-sm focus:outline-none focus:ring-2 focus:ring-[#003087]" /></div>
                            <div><label className="block text-sm text-[#333333] mb-1 font-medium">End Date</label><input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full px-3 py-2 bg-white border border-[#CCCCCC] rounded-lg text-[#1A1A2E] text-sm focus:outline-none focus:ring-2 focus:ring-[#003087]" /></div>
                        </div>
                        <button onClick={requestStartQuarter} disabled={quarterLoading || !quarterName || !startDate || !endDate} className="min-h-[44px] min-w-[120px] px-6 py-2.5 bg-[#003087] hover:bg-[#00843D] text-[14px] text-white font-bold rounded-lg disabled:bg-[#CCCCCC] disabled:text-[#666666] disabled:cursor-not-allowed cursor-pointer transition-all">{quarterLoading ? "Starting..." : "Start Quarter"}</button>
                    </div>
                    <div className="bg-white border border-[#E0E0E0] shadow-sm rounded-xl p-6">
                        <h3 className="text-lg font-semibold text-[#003087] mb-2">Close Active Quarter</h3>
                        <p className="text-[#333333] text-sm mb-4">No scores can be modified after closing.</p>
                        <button onClick={requestCloseQuarter} disabled={quarterLoading} className="min-h-[44px] min-w-[120px] text-[14px] px-6 py-2.5 bg-[#003087] text-white border border-[#003087] hover:bg-[#00843D] rounded-lg font-bold disabled:bg-[#CCCCCC] disabled:text-[#666666] cursor-pointer transition-colors shadow-sm">{quarterLoading ? "Closing..." : "Close Current Quarter"}</button>
                    </div>
                </div>
            )}

            {/* ═══════ QUESTIONS TAB ═══════ */}
            {tab === "questions" && (
                <div className="space-y-6">
                    {qMsg.text && (<div className={`p-3 rounded-lg text-sm border ${qMsg.type === "success" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-red-500/10 border-red-500/20 text-red-400"}`}>{qMsg.text}</div>)}

                    {/* Summary + Add button */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                            <h2 className="text-xl font-bold text-[#003087]">Question Bank</h2>
                            <p className="text-sm text-[#333333]">{questions.length} total questions | {activeCount} active</p>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={fetchQuestions} className="min-h-[44px] min-w-[80px] font-bold px-3 py-2 bg-white border border-[#CCCCCC] rounded-lg text-[#333333] hover:text-[#003087] text-[14px] cursor-pointer hover:bg-[#F5F5F5] transition-colors">↻ Refresh</button>
                            <button onClick={() => setShowAddForm(!showAddForm)} className="px-4 py-2 min-h-[44px] min-w-[80px] bg-[#003087] hover:bg-[#00843D] text-white font-bold text-[14px] rounded-lg cursor-pointer transition-all shadow-sm">+ Add Question</button>
                        </div>
                    </div>

                    {/* Add Question Form (collapsible) */}
                    {showAddForm && (
                        <div className="bg-white border border-[#E0E0E0] shadow-sm rounded-xl p-6">
                            <h3 className="text-lg font-semibold text-[#003087] mb-4">Add New Question</h3>
                            <div className="space-y-4">
                                <div><label className="block text-sm text-[#333333] mb-1 font-medium">Question Text (English)</label><textarea value={newQ.text} onChange={(e) => setNewQ({ ...newQ, text: e.target.value })} rows={2} placeholder="Enter the question text in English..." className="w-full px-3 py-2 bg-white border border-[#CCCCCC] rounded-lg text-[#1A1A2E] text-sm focus:outline-none focus:ring-2 focus:ring-[#003087] resize-none" /></div>
                                <div><label className="block text-sm text-[#333333] mb-1 font-medium">Question Text (Hindi)</label><textarea value={newQ.textHindi} onChange={(e) => setNewQ({ ...newQ, textHindi: e.target.value })} rows={2} placeholder="Enter the question text in Hindi..." className="w-full px-3 py-2 bg-white border border-[#CCCCCC] rounded-lg text-[#1A1A2E] text-sm focus:outline-none focus:ring-2 focus:ring-[#003087] resize-none" /></div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div><label className="block text-sm text-[#333333] mb-1 font-medium">Category</label><select value={newQ.category} onChange={(e) => setNewQ({ ...newQ, category: e.target.value })} className="w-full px-3 py-2 bg-white border border-[#CCCCCC] rounded-lg text-[#1A1A2E] text-sm focus:outline-none focus:ring-2 focus:ring-[#003087]">{CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
                                    <div><label className="block text-sm text-[#333333] mb-1 font-medium">Level</label><select value={newQ.level} onChange={(e) => setNewQ({ ...newQ, level: e.target.value })} className="w-full px-3 py-2 bg-white border border-[#CCCCCC] rounded-lg text-[#1A1A2E] text-sm focus:outline-none focus:ring-2 focus:ring-[#003087]">{LEVELS.map((l) => <option key={l} value={l}>{l.replaceAll("_", " ")}</option>)}</select></div>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={addQuestion} className="px-6 py-2.5 bg-[#003087] hover:bg-[#00843D] text-white font-semibold rounded-lg cursor-pointer transition-all shadow-sm">Save Question</button>
                                    <button onClick={() => setShowAddForm(false)} className="px-4 py-2.5 bg-[#F5F5F5] border border-[#CCCCCC] text-[#333333] hover:text-[#003087] hover:bg-white rounded-lg cursor-pointer transition-colors">Cancel</button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Filter Bar */}
                    <div className="bg-white border border-[#E0E0E0] shadow-sm rounded-xl p-3 sm:p-4 space-y-2 sm:space-y-0 sm:flex sm:flex-wrap sm:items-end sm:gap-3">
                        <div className="w-full sm:flex-1 sm:min-w-[200px]">
                            <label className="block text-xs text-[#333333] mb-1 font-medium">Search</label>
                            <input type="text" value={qFilter.search} onChange={(e) => setQFilter({ ...qFilter, search: e.target.value })} placeholder="Search questions..." className="w-full px-3 py-2 bg-white border border-[#CCCCCC] rounded-lg text-[#1A1A2E] text-sm focus:outline-none focus:ring-2 focus:ring-[#003087]" />
                        </div>
                        <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-3">
                            <div>
                                <label className="block text-xs text-[#333333] mb-1 font-medium">Level</label>
                                <select value={qFilter.level} onChange={(e) => setQFilter({ ...qFilter, level: e.target.value })} className="w-full sm:w-auto px-3 py-2 bg-white border border-[#CCCCCC] rounded-lg text-[#1A1A2E] text-sm focus:outline-none focus:ring-2 focus:ring-[#003087] sm:min-w-[150px]">
                                    <option value="">All Levels</option>
                                    {LEVELS.map((l) => <option key={l} value={l}>{l.replaceAll("_", " ")}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs text-[#333333] mb-1 font-medium">Category</label>
                                <select value={qFilter.category} onChange={(e) => setQFilter({ ...qFilter, category: e.target.value })} className="w-full sm:w-auto px-3 py-2 bg-white border border-[#CCCCCC] rounded-lg text-[#1A1A2E] text-sm focus:outline-none focus:ring-2 focus:ring-[#003087] sm:min-w-[150px]">
                                    <option value="">All Categories</option>
                                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                        </div>
                        {(qFilter.search || qFilter.level || qFilter.category) && (
                            <button onClick={() => setQFilter({ level: "", category: "", search: "" })} className="w-full sm:w-auto px-3 py-2 bg-[#F5F5F5] hover:bg-white border border-[#E0E0E0] text-[#333333] rounded-lg text-sm cursor-pointer transition-colors">Clear</button>
                        )}
                    </div>

                    <p className="text-xs text-[#666666]">{filteredQuestions.length} question{filteredQuestions.length !== 1 ? "s" : ""} shown</p>

                    {/* Grouped Questions */}
                    {groupedByLevel.map(({ level, questions: levelQs }) => {
                        const byCategory = {};
                        levelQs.forEach((q) => { if (!byCategory[q.category]) byCategory[q.category] = []; byCategory[q.category].push(q); });
                        return (
                            <div key={level} className="space-y-3">
                                <h3 className="text-lg font-bold text-[#003087] flex items-center gap-2">
                                    <span className="text-xs px-2.5 py-1 rounded-full bg-[#E8EAF6] text-[#3F51B5] border border-[#C5CAE9] font-semibold">{level.replaceAll("_", " ")}</span>
                                    <span className="text-sm text-[#333333] font-normal">{levelQs.length} question{levelQs.length !== 1 ? "s" : ""}</span>
                                </h3>
                                {Object.entries(byCategory).map(([cat, catQs]) => (
                                    <div key={cat} className="bg-white border border-[#E0E0E0] rounded-xl overflow-hidden shadow-sm">
                                        <div className="px-4 py-2.5 border-b border-[#E0E0E0] flex items-center justify-between bg-[#F5F5F5]">
                                            <span className="text-xs font-semibold text-[#003087] uppercase tracking-wider">{cat}</span>
                                            <span className="text-xs text-[#333333]">{catQs.length}</span>
                                        </div>
                                        <div className="divide-y divide-[#E0E0E0]">
                                            {catQs.map((q) => (
                                                <div key={q.id} className="px-3 sm:px-4 py-3 hover:bg-[#F5F5F5] transition-colors group">
                                                    {editingQ?.id === q.id ? (
                                                        <div className="space-y-2">
                                                            <textarea value={editingQ.text} onChange={(e) => setEditingQ({ ...editingQ, text: e.target.value })} rows={2} placeholder="English text" className="w-full px-3 py-2 bg-white border border-[#CCCCCC] rounded-lg text-[#1A1A2E] text-sm focus:outline-none focus:ring-2 focus:ring-[#003087] resize-none" />
                                                            <textarea value={editingQ.textHindi || ""} onChange={(e) => setEditingQ({ ...editingQ, textHindi: e.target.value })} rows={2} placeholder="Hindi text" className="w-full px-3 py-2 bg-white border border-[#CCCCCC] rounded-lg text-[#1A1A2E] text-sm focus:outline-none focus:ring-2 focus:ring-[#003087] resize-none" />
                                                            <div className="grid grid-cols-2 gap-2">
                                                                <select value={editingQ.category} onChange={(e) => setEditingQ({ ...editingQ, category: e.target.value })} className="px-2 py-1.5 bg-white border border-[#CCCCCC] rounded-lg text-[#1A1A2E] text-xs">{CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select>
                                                                <select value={editingQ.level} onChange={(e) => setEditingQ({ ...editingQ, level: e.target.value })} className="px-2 py-1.5 bg-white border border-[#CCCCCC] rounded-lg text-[#1A1A2E] text-xs">{LEVELS.map((l) => <option key={l} value={l}>{l.replaceAll("_", " ")}</option>)}</select>
                                                            </div>
                                                            <div className="flex gap-2">
                                                                <button onClick={saveEditQuestion} className="min-h-[40px] px-3 py-1.5 bg-[#003087] hover:bg-[#00843D] text-white text-[13px] sm:text-[14px] font-bold rounded-lg cursor-pointer transition-colors shadow-sm">Save</button>
                                                                <button onClick={() => setEditingQ(null)} className="min-h-[40px] px-3 py-1.5 bg-white border border-[#CCCCCC] text-[#333333] font-bold text-[13px] sm:text-[14px] rounded-lg cursor-pointer hover:bg-[#F5F5F5] transition-colors">Cancel</button>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                                                            <div className={`flex-1 ${q.isActive ? "" : "opacity-50"}`}>
                                                                <p className={`text-[13px] sm:text-sm tracking-tight ${q.isActive ? "text-[#1A1A2E]" : "text-[#999999] line-through"}`}>{q.text}</p>
                                                                {q.textHindi && <p className="text-[12px] sm:text-[13px] text-[#666666] italic mt-0.5">{q.textHindi}</p>}
                                                            </div>
                                                            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                                                                <button onClick={() => setEditingQ({ id: q.id, text: q.text, textHindi: q.textHindi || "", category: q.category, level: q.level })} className="min-h-[36px] sm:min-h-[40px] px-2.5 sm:px-3 py-1.5 bg-[#F5F5F5] font-bold border border-[#E0E0E0] text-[#333333] hover:text-[#003087] rounded-md cursor-pointer transition-colors text-[12px] sm:text-[13px]">Edit</button>
                                                                <button onClick={() => setDeleteQ(q)} className="min-h-[36px] sm:min-h-[40px] px-2.5 sm:px-3 py-1.5 bg-[#F5F5F5] font-bold border border-[#E0E0E0] text-[#333333] hover:text-[#D32F2F] rounded-md cursor-pointer transition-colors text-[12px] sm:text-[13px]">Delete</button>
                                                                <button onClick={() => toggleQuestion(q.id)} className={`min-h-[36px] sm:min-h-[40px] text-[12px] sm:text-[13px] font-bold px-2.5 sm:px-3 py-1.5 rounded-lg border transition-colors cursor-pointer shrink-0 shadow-sm ${q.isActive ? "bg-[#00843D] text-[#FFFFFF] border-[#A5D6A7]" : "bg-[#CCCCCC] text-[#333333] border-[#EF9A9A]"}`}>{q.isActive ? "Active" : "Off"}</button>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        );
                    })}
                    {filteredQuestions.length === 0 && <div className="bg-white border border-[#E0E0E0] shadow-sm rounded-xl p-8 text-center text-[#333333]">No questions match your filters.</div>}

                    {/* Delete Confirmation */}
                    <ConfirmDialog
                        open={!!deleteQ}
                        title="Delete Question?"
                        message={deleteQ ? `Are you sure you want to delete: "${deleteQ.text}"? This cannot be undone.` : ""}
                        confirmLabel="Delete"
                        variant="danger"
                        onConfirm={confirmDeleteQuestion}
                        onCancel={() => setDeleteQ(null)}
                    />
                </div>
            )
            }

            {/* ═══════ EMPLOYEES TAB ═══════ */}
            {tab === "employees" && (
                <div className="space-y-6">
                    <div className="bg-white border rounded-xl p-3 sm:p-5 shadow-sm border-[#E0E0E0] space-y-3 sm:space-y-0 sm:flex sm:flex-row sm:gap-4 sm:justify-between sm:items-center">
                        <div className="relative w-full sm:flex-1 sm:max-w-xs">
                            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#999999]"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg></span>
                            <input type="text" placeholder="Search name or code..." value={empFilter.search} onChange={(e) => setEmpFilter({ ...empFilter, search: e.target.value })} className="w-full h-10 pl-10 pr-4 bg-[#F5F5F5] border border-[#CCCCCC] rounded-lg text-sm text-[#333333] focus:outline-none focus:ring-2 focus:ring-[#003087]/20 focus:border-[#003087]" />
                        </div>
                        <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-4 sm:w-auto">
                            <select value={empFilter.branch} onChange={(e) => setEmpFilter({ ...empFilter, branch: e.target.value, department: "" })} className="h-10 px-2 sm:px-3 bg-[#F5F5F5] border border-[#CCCCCC] rounded-lg text-xs sm:text-sm text-[#333333] focus:outline-none focus:ring-2 focus:ring-[#003087]/20 focus:border-[#003087] w-full sm:w-40">
                                <option value="">All Branches</option>
                                {empBranches.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
                            </select>
                            <select value={empFilter.department} onChange={(e) => setEmpFilter({ ...empFilter, department: e.target.value })} className="h-10 px-2 sm:px-3 bg-[#F5F5F5] border border-[#CCCCCC] rounded-lg text-xs sm:text-sm text-[#333333] focus:outline-none focus:ring-2 focus:ring-[#003087]/20 focus:border-[#003087] w-full sm:w-48">
                                <option value="">All Departments</option>
                                {empDepartments.map(d => <option key={d} value={d}>{d}</option>)}
                            </select>
                            <select value={empFilter.role} onChange={(e) => setEmpFilter({ ...empFilter, role: e.target.value })} className="h-10 px-2 sm:px-3 bg-[#F5F5F5] border border-[#CCCCCC] rounded-lg text-xs sm:text-sm text-[#333333] focus:outline-none focus:ring-2 focus:ring-[#003087]/20 focus:border-[#003087] w-full sm:w-40">
                                <option value="">All Roles</option>
                                <option value="EMPLOYEE">Employee</option>
                                <option value="BRANCH_MANAGER">Branch Manager</option>
                                <option value="CLUSTER_MANAGER">Cluster Manager</option>
                                <option value="HOD">HOD</option>
                                <option value="HR">HR</option>
                                <option value="COMMITTEE">Committee</option>
                                <option value="ADMIN">Admin</option>
                            </select>
                            <button onClick={() => { setShowAddEmp(!showAddEmp); setAddMsg({ type: "", text: "" }); }} className="col-span-1 h-10 px-3 sm:px-4 bg-[#00843D] hover:bg-[#006B32] text-white text-xs sm:text-sm font-bold rounded-lg flex items-center justify-center gap-1.5 cursor-pointer transition-colors">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>
                                {showAddEmp ? "Cancel" : "Add / Remove"}
                            </button>
                            <button onClick={() => { setShowBulkUpload(!showBulkUpload); setBulkMsg({ type: "", text: "" }); setBulkResult(null); }} className="col-span-1 h-10 px-3 sm:px-4 bg-[#F7941D] hover:bg-[#D87A0A] text-white text-xs sm:text-sm font-bold rounded-lg flex items-center justify-center gap-1.5 cursor-pointer transition-colors">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                                {showBulkUpload ? "Cancel" : "Bulk Upload"}
                            </button>
                            <button onClick={downloadExcel} disabled={excelLoading} className="col-span-1 h-10 px-3 sm:px-4 bg-[#00843D] hover:bg-[#006B32] text-white text-xs sm:text-sm font-bold rounded-lg flex items-center justify-center gap-1.5 cursor-pointer transition-colors disabled:opacity-60">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                {excelLoading ? "Exporting..." : "Excel"}
                            </button>
                        </div>
                    </div>

                    {/* Add Employee Form (collapsible) */}
                    {showAddEmp && (
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
                            <button onClick={handleAddEmployee} disabled={addLoading || !addForm.name || !addForm.departmentName} className="px-6 py-2 bg-[#003087] text-white rounded-lg text-sm font-bold hover:bg-[#002266] transition-colors cursor-pointer disabled:opacity-50">
                                {addLoading ? "Adding..." : "Add Employee"}
                            </button>
                        </div>
                    )}

                    {/* Bulk Upload Panel */}
                    {showBulkUpload && (
                        <div className="bg-white border border-[#E0E0E0] rounded-xl p-5 shadow-sm space-y-4">
                            <div className="flex items-center justify-between flex-wrap gap-2">
                                <h3 className="text-lg font-bold text-[#003087]">Bulk Upload Employees (Excel)</h3>
                                <button onClick={downloadBulkTemplate} className="text-xs px-3 py-1.5 bg-[#F5F5F5] border border-[#CCCCCC] rounded-lg font-bold text-[#333333] hover:bg-white cursor-pointer">
                                    Download Template
                                </button>
                            </div>
                            <div className="text-xs text-[#666666] bg-[#F5F5F5] border border-[#E0E0E0] rounded-lg p-3 space-y-1">
                                <p className="font-bold text-[#003087]">Required columns: Name, Department</p>
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
                    <div className="bg-white border border-[#E0E0E0] rounded-xl overflow-hidden shadow-sm">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-[#F5F5F5] border-b border-[#E0E0E0]">
                                        <th className="px-5 py-3 text-[12px] font-bold text-[#666666] uppercase tracking-wider">Emp Code</th>
                                        <th className="px-5 py-3 text-[12px] font-bold text-[#666666] uppercase tracking-wider">Name</th>
                                        <th className="px-5 py-3 text-[12px] font-bold text-[#666666] uppercase tracking-wider">Department</th>
                                        <th className="px-5 py-3 text-[12px] font-bold text-[#666666] uppercase tracking-wider">Designation</th>
                                        <th className="px-5 py-3 text-[12px] font-bold text-[#666666] uppercase tracking-wider">Mobile</th>
                                        <th className="px-5 py-3 text-[12px] font-bold text-[#666666] uppercase tracking-wider">Collar</th>
                                        <th className="px-5 py-3 text-[12px] font-bold text-[#666666] uppercase tracking-wider">Roles</th>
                                        {user?.role === "ADMIN" && <th className="px-5 py-3 text-[12px] font-bold text-[#666666] uppercase tracking-wider">Action</th>}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[#E0E0E0]">
                                    {empLoading ? <tr><td colSpan={user?.role === "ADMIN" ? 7 : 6} className="px-5 py-8 text-center text-[#666666]">Loading...</td></tr> :
                                    employees.length === 0 ? <tr><td colSpan={user?.role === "ADMIN" ? 7 : 6} className="px-5 py-8 text-center text-[#666666]">No employees found</td></tr> :
                                    employees.map(e => {
                                        const roles = e.roles || [e.role];
                                        return (
                                        <tr key={e.id} className="hover:bg-[#FAFAFA] transition-colors">
                                            <td className="px-5 py-3 text-sm text-[#333333] font-mono">{e.empCode || "—"}</td>
                                            <td className="px-5 py-3 text-sm font-bold text-[#003087]">{e.name}</td>
                                            <td className="px-5 py-3 text-sm text-[#333333]">{e.department}{e.evaluatorRoles?.length > 0 && <span className="block text-[10px] text-[#666666] mt-0.5">{e.evaluatorRoles.map(er => `${er.role.replace("_"," ")} — ${er.department}`).join(", ")}</span>}</td>
                                            <td className="px-5 py-3 text-sm text-[#666666]">{e.designation}</td>
                                            <td className="px-5 py-3 text-sm text-[#666666]">{e.mobile ? <a href={`tel:${e.mobile}`} className="text-[#003087] hover:underline">{e.mobile}</a> : <span className="text-[#BBBBBB] italic text-xs">Not provided</span>}</td>
                                            <td className="px-5 py-3">
                                                {e.role === "EMPLOYEE" ? (
                                                    <select value={e.collarType || ""} onChange={ev => handleCollarType(e.id, ev.target.value)} className="text-[10px] px-2 py-1 rounded border font-bold cursor-pointer">
                                                        <option value="">Not Set</option>
                                                        <option value="WHITE_COLLAR">White Collar</option>
                                                        <option value="BLUE_COLLAR">Blue Collar</option>
                                                    </select>
                                                ) : <span className="text-xs text-gray-400">—</span>}
                                            </td>
                                            <td className="px-5 py-3"><div className="flex flex-wrap gap-1">{roles.map(r => <span key={r} className={`text-[10px] px-2 py-0.5 rounded-full border font-bold uppercase tracking-wider ${r === "EMPLOYEE" ? "bg-gray-50 text-gray-700 border-gray-200" : r === "SUPERVISOR" ? "bg-blue-50 text-[#003087] border-blue-200" : r === "HOD" ? "bg-purple-50 text-purple-700 border-purple-200" : r === "BRANCH_MANAGER" ? "bg-emerald-50 text-[#00843D] border-emerald-200" : r === "CLUSTER_MANAGER" ? "bg-orange-50 text-[#F7941D] border-orange-200" : r === "HR" ? "bg-amber-50 text-amber-700 border-amber-200" : r === "COMMITTEE" ? "bg-indigo-50 text-indigo-700 border-indigo-200" : "bg-[#003087] text-white border-[#003087]"}`}>{r.replace("_", " ")}</span>)}</div></td>
                                            {user?.role === "ADMIN" && <td className="px-5 py-3"><div className="flex gap-1.5"><button onClick={() => openEditModal(e)} className="text-xs px-3 py-1.5 bg-[#003087] hover:bg-[#00843D] text-white rounded-lg font-semibold transition-colors cursor-pointer">Edit</button>{!roles.includes("ADMIN") && <button onClick={() => setRemoveId(e.id)} className="text-xs px-3 py-1.5 bg-red-50 text-red-700 border border-red-200 rounded-lg font-semibold hover:bg-red-100 cursor-pointer">Remove</button>}</div></td>}
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
                </div>
            )}

            {/* ═══════ REMOVE EMPLOYEE MODAL ═══════ */}
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
                            <button onClick={handleRemoveEmployee} disabled={removeLoading || !removeReason} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-bold hover:bg-red-700 cursor-pointer disabled:opacity-50">
                                {removeLoading ? "Removing..." : "Confirm Remove"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════ LOGS TAB ═══════ */}
            {
                tab === "logs" && (
                    <div className="space-y-4">
                        {/* Filter Bar */}
                        <div className="bg-white border border-[#E0E0E0] shadow-sm rounded-xl p-3 sm:p-4 space-y-2 sm:space-y-0 sm:flex sm:flex-wrap sm:items-end sm:gap-3">
                            <div className="w-full sm:w-auto">
                                <label className="block text-xs text-[#333333] mb-1 font-medium">Action</label>
                                <select value={logFilter.action} onChange={(e) => setLogFilter({ ...logFilter, action: e.target.value })} className="w-full sm:w-auto px-3 py-2 bg-white border border-[#CCCCCC] rounded-lg text-[#1A1A2E] text-sm focus:outline-none focus:ring-2 focus:ring-[#003087] sm:min-w-[160px]">
                                    <option value="">All Actions</option>
                                    {logActions.map((a) => <option key={a} value={a}>{a}</option>)}
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-3">
                                <div>
                                    <label className="block text-xs text-[#333333] mb-1 font-medium">From</label>
                                    <input type="date" value={logFilter.from} onChange={(e) => setLogFilter({ ...logFilter, from: e.target.value })} className="w-full sm:w-auto px-3 py-2 bg-white border border-[#CCCCCC] rounded-lg text-[#1A1A2E] text-sm focus:outline-none focus:ring-2 focus:ring-[#003087]" />
                                </div>
                                <div>
                                    <label className="block text-xs text-[#333333] mb-1 font-medium">To</label>
                                    <input type="date" value={logFilter.to} onChange={(e) => setLogFilter({ ...logFilter, to: e.target.value })} className="w-full sm:w-auto px-3 py-2 bg-white border border-[#CCCCCC] rounded-lg text-[#1A1A2E] text-sm focus:outline-none focus:ring-2 focus:ring-[#003087]" />
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => fetchLogs(1, logFilter)} className="flex-1 sm:flex-none px-4 py-2 bg-[#003087] hover:bg-[#00843D] text-white rounded-lg text-sm font-medium cursor-pointer transition-colors shadow-sm">Apply</button>
                                <button onClick={() => { setLogFilter({ action: "", from: "", to: "" }); fetchLogs(1, { action: "", from: "", to: "" }); }} className="flex-1 sm:flex-none px-4 py-2 bg-[#F5F5F5] hover:bg-white border border-[#E0E0E0] text-[#333333] rounded-lg text-sm cursor-pointer transition-colors">Clear</button>
                            </div>
                        </div>

                        {/* Table */}
                        <div className="bg-white border border-[#E0E0E0] shadow-sm rounded-xl overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm min-w-[700px]">
                                    <thead><tr className="border-b border-[#E0E0E0] bg-[#F5F5F5]">
                                        <th className="text-left text-[#333333] font-medium px-4 py-3">Time</th>
                                        <th className="text-left text-[#333333] font-medium px-4 py-3">User</th>
                                        <th className="text-left text-[#333333] font-medium px-3 py-3">Role</th>
                                        <th className="text-left text-[#333333] font-medium px-3 py-3">Action</th>
                                        <th className="text-left text-[#333333] font-medium px-3 py-3">IP Address</th>
                                        <th className="text-left text-[#333333] font-medium px-3 py-3 hidden lg:table-cell">Details</th>
                                    </tr></thead>
                                    <tbody>
                                        {logs.map((log) => (
                                            <tr key={log.id} className="border-b border-[#E0E0E0] hover:bg-[#F5F5F5]">
                                                <td className="px-4 py-3 text-[#666666] whitespace-nowrap text-xs">{new Date(log.createdAt).toLocaleString()}</td>
                                                <td className="px-4 py-3 text-[#1A1A2E] text-sm font-medium">{log.user?.name || "system"}</td>
                                                <td className="px-3 py-3"><span className="text-xs text-[#666666]">{log.user?.role || "-"}</span></td>
                                                <td className="px-3 py-3"><span className="text-xs px-2.5 py-1 rounded-full bg-[#E3F2FD] text-[#003087] border border-[#90CAF9]">{log.action}</span></td>
                                                <td className="px-3 py-3 text-[#666666] text-xs font-mono">{log.ipAddress || "-"}</td>
                                                <td className="px-3 py-3 text-[#666666] text-xs hidden lg:table-cell max-w-xs truncate">{log.details ? JSON.stringify(log.details) : "-"}</td>
                                            </tr>
                                        ))}
                                        {logs.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-[#666666]">No audit logs found</td></tr>}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        {logTotal > 1 && (
                            <div className="flex gap-2 justify-center">
                                {Array.from({ length: Math.min(logTotal, 10) }, (_, i) => (<button key={i} onClick={() => fetchLogs(i + 1)} className={`w-8 h-8 rounded-lg text-sm cursor-pointer border ${logPage === i + 1 ? "bg-[#003087] text-white border-[#003087]" : "bg-white text-[#333333] border-[#CCCCCC] hover:bg-[#F5F5F5]"}`}>{i + 1}</button>))}
                            </div>
                        )}
                    </div>
                )
            }
            {/* ═══════ REASSIGN ROLE MODAL ═══════ */}
            {reassignModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-[#E0E0E0] flex flex-col max-h-[90vh]">
                        <div className="px-6 py-5 border-b border-[#E0E0E0] flex items-center justify-between shrink-0">
                            <div>
                                <h2 className="text-lg font-bold text-[#003087]">Reassign {reassignModal.role.replace(/_/g, " ")}</h2>
                                <p className="text-xs text-[#666666] mt-0.5">{reassignModal.dept.name}</p>
                            </div>
                            <button onClick={() => setReassignModal(null)} className="text-[#666666] hover:text-[#333333] cursor-pointer">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                        <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1">
                            {reassignMsg.text && (
                                <div className={`p-3 rounded-lg text-sm border ${reassignMsg.type === "success" ? "bg-[#E8F5E9] border-[#A5D6A7] text-[#1B5E20]" : "bg-[#FFEBEE] border-[#EF9A9A] text-[#D32F2F]"}`}>{reassignMsg.text}</div>
                            )}
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#999]">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                                </span>
                                <input
                                    type="text"
                                    placeholder="Search by name or emp code..."
                                    value={reassignSearch}
                                    onChange={e => setReassignSearch(e.target.value)}
                                    className="w-full pl-9 pr-4 py-2 border border-[#CCCCCC] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#003087]/20 focus:border-[#003087]"
                                    autoFocus
                                />
                            </div>
                            <div className="space-y-1 max-h-64 overflow-y-auto">
                                {reassignAllEmps.length === 0 && (
                                    <p className="text-sm text-[#999] italic text-center py-4">Loading employees…</p>
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
                                                className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors cursor-pointer ${selected ? "bg-[#E3F2FD] border-[#003087]" : "bg-white border-[#E0E0E0] hover:bg-[#F5F5F5]"}`}
                                            >
                                                <p className={`text-sm font-semibold ${selected ? "text-[#003087]" : "text-[#1A1A2E]"}`}>{e.name}</p>
                                                <p className="text-xs text-[#666666]">{e.empCode ? `${e.empCode} · ` : ""}{e.department || "No dept"}{e.designation ? ` · ${e.designation}` : ""}</p>
                                            </button>
                                        );
                                    })
                                }
                            </div>
                        </div>
                        <div className="px-6 py-4 border-t border-[#E0E0E0] shrink-0 flex gap-3">
                            <button onClick={() => setReassignModal(null)} className="flex-1 py-2.5 border border-[#CCCCCC] rounded-xl text-sm font-semibold text-[#333333] hover:bg-[#F5F5F5] transition-colors cursor-pointer">Cancel</button>
                            <button
                                onClick={handleReassign}
                                disabled={!reassignTarget || reassignLoading}
                                className="flex-1 py-2.5 bg-[#003087] hover:bg-[#00843D] text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                            >
                                {reassignLoading ? "Saving…" : reassignTarget ? `Assign ${reassignTarget.name.split(" ")[0]}` : "Select a person"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════ PERSON DETAIL MODAL ═══════ */}
            {personDetail && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-[#E0E0E0]">
                        <div className="px-6 py-5 border-b border-[#E0E0E0] flex items-center justify-between">
                            <h2 className="text-lg font-bold text-[#003087]">Employee Details</h2>
                            <button onClick={closePersonDetail} className="text-[#666666] hover:text-[#333333] transition-colors cursor-pointer">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                        <div className="px-6 py-5 space-y-4">
                            {/* Avatar + Name */}
                            <div className="flex items-center gap-4">
                                <div className="h-14 w-14 rounded-full bg-[#E3F2FD] flex items-center justify-center text-[#003087] font-bold text-xl border-2 border-[#90CAF9] shrink-0">
                                    {personDetail.name?.charAt(0)?.toUpperCase()}
                                </div>
                                <div>
                                    <p className="text-lg font-bold text-[#003087]">{personDetail.name}</p>
                                    {personDetail.mappedRole && (
                                        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold uppercase ${personDetail.mappedRole === "SUPERVISOR" ? "bg-blue-50 text-[#003087] border-blue-200" : personDetail.mappedRole === "BRANCH_MANAGER" ? "bg-emerald-50 text-[#00843D] border-emerald-200" : personDetail.mappedRole === "CLUSTER_MANAGER" ? "bg-orange-50 text-[#F7941D] border-orange-200" : "bg-gray-50 text-gray-600 border-gray-200"}`}>{personDetail.mappedRole.replace(/_/g, " ")}</span>
                                    )}
                                </div>
                            </div>
                            {/* Details grid */}
                            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                                <div>
                                    <p className="text-[10px] text-[#999999] font-bold uppercase tracking-wider">Emp Code</p>
                                    <p className="text-sm font-semibold text-[#333333]">{personDetail.empCode || "—"}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] text-[#999999] font-bold uppercase tracking-wider">Designation</p>
                                    <p className="text-sm font-semibold text-[#333333]">{personDetail.designation || "—"}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] text-[#999999] font-bold uppercase tracking-wider">Mobile</p>
                                    <p className="text-sm font-semibold text-[#333333]">{personDetail.mobile ? <a href={`tel:${personDetail.mobile}`} className="text-[#003087] hover:underline">{personDetail.mobile}</a> : <span className="text-[#BBB] italic">Not provided</span>}</p>
                                </div>
                            </div>
                            {/* Roles */}
                            {personDetail.roles?.length > 0 && (
                                <div>
                                    <p className="text-[10px] text-[#999999] font-bold uppercase tracking-wider mb-1.5">Roles</p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {personDetail.roles.map(r => (
                                            <span key={r} className={`text-[10px] px-2 py-0.5 rounded-full border font-bold uppercase ${r === "EMPLOYEE" ? "bg-gray-50 text-gray-600 border-gray-200" : r === "SUPERVISOR" ? "bg-blue-50 text-[#003087] border-blue-200" : r === "BRANCH_MANAGER" ? "bg-emerald-50 text-[#00843D] border-emerald-200" : r === "CLUSTER_MANAGER" ? "bg-orange-50 text-[#F7941D] border-orange-200" : "bg-[#003087] text-white border-[#003087]"}`}>{r.replace(/_/g, " ")}</span>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {/* Evaluator roles */}
                            {personDetail.evaluatorRoles?.length > 0 && (
                                <div>
                                    <p className="text-[10px] text-[#999999] font-bold uppercase tracking-wider mb-1.5">Evaluator Assignments</p>
                                    <div className="space-y-1.5">
                                        {personDetail.evaluatorRoles.map((er, i) => (
                                            <div key={i} className="flex items-center gap-2">
                                                <span className={`text-[9px] px-1.5 py-0.5 rounded border font-bold uppercase ${er.role === "SUPERVISOR" ? "bg-blue-50 text-[#003087] border-blue-200" : er.role === "BRANCH_MANAGER" ? "bg-emerald-50 text-[#00843D] border-emerald-200" : "bg-orange-50 text-[#F7941D] border-orange-200"}`}>{er.role.replace(/_/g, " ")}</span>
                                                <span className="text-xs text-[#333333]">{er.department}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="px-6 py-4 border-t border-[#E0E0E0]">
                            <button onClick={closePersonDetail} className="w-full py-2.5 bg-[#003087] hover:bg-[#00843D] text-white rounded-xl text-sm font-semibold transition-colors cursor-pointer">Close</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════ EDIT EMPLOYEE MODAL ═══════ */}
            {editEmp && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-[#E0E0E0]">
                        <div className="px-6 py-5 border-b border-[#E0E0E0] flex items-center justify-between">
                            <div>
                                <h2 className="text-lg font-bold text-[#003087]">Edit Employee</h2>
                                <p className="text-xs text-[#666666] mt-0.5">{editEmp.name} &middot; {editEmp.empCode || "No Code"}</p>
                            </div>
                            <button onClick={() => setEditEmp(null)} className="text-[#666666] hover:text-[#333333] transition-colors cursor-pointer">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>

                        {editConfirm ? (
                            <div className="px-6 py-5 space-y-4">
                                <div className="bg-[#FFF8E1] border border-[#FFD600] rounded-xl p-4">
                                    <p className="text-sm font-bold text-[#E65100] mb-2">Confirm the following changes:</p>
                                    <ul className="space-y-1">
                                        {editChanges.map((c, i) => (
                                            <li key={i} className="text-sm text-[#333333] flex items-start gap-2">
                                                <span className="text-[#00843D] font-bold mt-0.5">✓</span>
                                                <span>{c}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                                <p className="text-xs text-[#666666]">A notification will be sent to the employee about these changes.</p>
                                {editMsg.text && <p className={`text-sm font-medium ${editMsg.type === "error" ? "text-[#D32F2F]" : "text-[#00843D]"}`}>{editMsg.text}</p>}
                                <div className="flex gap-3">
                                    <button onClick={() => setEditConfirm(false)} className="flex-1 py-2.5 border border-[#CCCCCC] rounded-xl text-sm font-semibold text-[#333333] hover:bg-[#F5F5F5] transition-colors cursor-pointer">Back</button>
                                    <button onClick={handleEditSave} disabled={editLoading} className="flex-1 py-2.5 bg-[#003087] hover:bg-[#00843D] text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-60 cursor-pointer">
                                        {editLoading ? "Saving..." : "Confirm & Save"}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="px-6 py-5 space-y-4">
                                {editMsg.text && <p className={`text-sm font-medium ${editMsg.type === "error" ? "text-[#D32F2F]" : "text-[#00843D]"}`}>{editMsg.text}</p>}

                                <div>
                                    <label className="block text-xs font-semibold text-[#333333] mb-1">Department</label>
                                    <select value={editForm.department} onChange={e => setEditForm({ ...editForm, department: e.target.value })}
                                        className="w-full h-10 px-3 bg-[#F5F5F5] border border-[#CCCCCC] rounded-lg text-sm text-[#333333] focus:outline-none focus:ring-2 focus:ring-[#003087]/20 focus:border-[#003087]">
                                        <option value="">— Select Department —</option>
                                        {empDepartments.map(d => <option key={d} value={d}>{d}</option>)}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-[#333333] mb-1">Role</label>
                                    <select value={editForm.role} onChange={e => setEditForm({ ...editForm, role: e.target.value })}
                                        className="w-full h-10 px-3 bg-[#F5F5F5] border border-[#CCCCCC] rounded-lg text-sm text-[#333333] focus:outline-none focus:ring-2 focus:ring-[#003087]/20 focus:border-[#003087]">
                                        <option value="EMPLOYEE">Employee</option>
                                        <option value="BRANCH_MANAGER">Branch Manager</option>
                                        <option value="CLUSTER_MANAGER">Cluster Manager</option>
                                        <option value="HOD">HOD</option>
                                        <option value="HR">HR</option>
                                        <option value="COMMITTEE">Committee</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-[#333333] mb-1">Designation</label>
                                    <input type="text" value={editForm.designation} onChange={e => setEditForm({ ...editForm, designation: e.target.value })}
                                        placeholder="e.g. Senior Executive - HR"
                                        className="w-full h-10 px-3 bg-[#F5F5F5] border border-[#CCCCCC] rounded-lg text-sm text-[#333333] focus:outline-none focus:ring-2 focus:ring-[#003087]/20 focus:border-[#003087]" />
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-[#333333] mb-1">New Password <span className="text-[#999999] font-normal">(leave blank to keep current)</span></label>
                                    <input type="password" value={editForm.password} onChange={e => setEditForm({ ...editForm, password: e.target.value })}
                                        placeholder="Min 6 characters"
                                        className="w-full h-10 px-3 bg-[#F5F5F5] border border-[#CCCCCC] rounded-lg text-sm text-[#333333] focus:outline-none focus:ring-2 focus:ring-[#003087]/20 focus:border-[#003087]" />
                                </div>

                                <div className="flex gap-3 pt-1">
                                    <button onClick={() => setEditEmp(null)} className="flex-1 py-2.5 border border-[#CCCCCC] rounded-xl text-sm font-semibold text-[#333333] hover:bg-[#F5F5F5] transition-colors cursor-pointer">Cancel</button>
                                    <button onClick={handleEditPreview} className="flex-1 py-2.5 bg-[#003087] hover:bg-[#00843D] text-white rounded-xl text-sm font-semibold transition-colors cursor-pointer">Preview Changes</button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Confirmation Dialogs */}
            <ConfirmDialog
                open={confirm.open && confirm.type === "start"}
                title={`Start ${confirm.autoMode ? getAutoQuarterName() : quarterName} Evaluation?`}
                message={`This will:\n\n✓ Lock 15 random self-assessment questions\n✓ Lock 5 supervisor, 4 branch manager, 3 cluster manager questions\n✓ Allow all employees to submit assessments\n✓ Cannot be undone until quarter is closed\n\nQuarter "${confirm.autoMode ? getAutoQuarterName() : quarterName}" will begin immediately.`}
                confirmLabel="Yes, Start Quarter"
                variant="warning"
                loading={quarterLoading}
                onConfirm={startQuarter}
                onCancel={() => setConfirm({ open: false, type: null })}
            />
            <ConfirmDialog
                open={confirm.open && confirm.type === "close"}
                title="Close Active Quarter?"
                message="This will finalize all scores and cannot be undone. No further evaluations can be submitted after closing."
                confirmLabel="Close Quarter"
                variant="danger"
                loading={quarterLoading}
                onConfirm={closeQuarter}
                onCancel={() => setConfirm({ open: false, type: null })}
            />
        </DashboardShell >
    );
}
