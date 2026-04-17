"use client";

import { useState, useEffect, useRef } from "react";
import DashboardShell from "../../../components/DashboardShell";

async function api(url, opts) {
    const res = await fetch(url, opts);
    const json = await res.json();
    if (!res.ok || !json.success) throw new Error(json.message || "Request failed");
    return json.data;
}

const HR_ALLOWED = ["1800349", "5100029"];

/* ─── tiny helpers ─── */
function formatBytes(bytes) {
    if (bytes < 1024) return bytes + " B";
    return (bytes / 1024).toFixed(1) + " KB";
}

function CheckIcon() {
    return (
        <svg className="w-5 h-5 text-[#00843D]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
    );
}

function UploadIcon() {
    return (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
        </svg>
    );
}

/* ────────────────────────────────────────────────────── */

export default function HRDashboard() {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [authorized, setAuthorized] = useState(false);

    /* ─── Top-level tab ─── */
    const [mainTab, setMainTab] = useState("evaluate"); // "evaluate" | "management"

    /* ══════════════════════════════════════════════════
       EVALUATE TAB STATE
       ══════════════════════════════════════════════════ */
    const [shortlist, setShortlist] = useState([]);
    const [evalLoading, setEvalLoading] = useState(false);
    const [evalError, setEvalError] = useState("");

    // Per-employee UI state keyed by employeeId
    const [attendancePcts, setAttendancePcts] = useState({}); // { [empId]: number }
    const [workingHoursMap, setWorkingHoursMap] = useState({}); // { [empId]: number }
    const [refSheetUrls, setRefSheetUrls] = useState({});     // { [empId]: string }
    const [hrNotes, setHrNotes] = useState({});                // { [empId]: string }
    const [evalSubmitting, setEvalSubmitting] = useState({});  // { [empId]: bool }
    const [evalDone, setEvalDone] = useState({});              // { [empId]: bool }
    const [evalMessages, setEvalMessages] = useState({});      // { [empId]: { type, text } }
    const [refUploading, setRefUploading] = useState({});      // { [empId]: bool }

    const fileRefs = useRef({});

    /* ══════════════════════════════════════════════════
       EMPLOYEE MANAGEMENT TAB STATE (kept from original)
       ══════════════════════════════════════════════════ */
    const [employees, setEmployees] = useState([]);
    const [empDepartments, setEmpDepartments] = useState([]);
    const [empTotal, setEmpTotal] = useState(0);
    const [empTotalPages, setEmpTotalPages] = useState(1);
    const [empPage, setEmpPage] = useState(1);
    const [empLoading, setEmpLoading] = useState(false);
    const [empFilter, setEmpFilter] = useState({ search: "", department: "", role: "" });
    const [subTab, setSubTab] = useState("active");
    const [showAddEmp, setShowAddEmp] = useState(false);
    const [addForm, setAddForm] = useState({ name: "", mobile: "", departmentName: "", joiningDate: "", reason: "", empCode: "", designation: "" });
    const [addMsg, setAddMsg] = useState({ type: "", text: "" });
    const [addLoading, setAddLoading] = useState(false);
    const [removeId, setRemoveId] = useState(null);
    const [removeReason, setRemoveReason] = useState("");
    const [removeLoading, setRemoveLoading] = useState(false);
    const [archived, setArchived] = useState([]);
    const [archivedLoading, setArchivedLoading] = useState(false);

    /* ─── Auth ─── */
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

    /* ══════════════════════════════════════════════════
       EVALUATE TAB LOGIC
       ══════════════════════════════════════════════════ */
    const fetchShortlist = async () => {
        setEvalLoading(true);
        setEvalError("");
        try {
            const d = await api("/api/hr/shortlist");
            setShortlist(d.employees || d || []);
        } catch (err) {
            setEvalError(err.message || "Failed to load shortlist");
        }
        setEvalLoading(false);
    };

    useEffect(() => {
        if (authorized && mainTab === "evaluate") fetchShortlist();
    }, [authorized, mainTab]);

    // Upload a PDF for the employee's reference sheet and write the returned
    // URL into refSheetUrls. The URL text input stays editable in case ops
    // wants to paste a manual URL instead.
    const handleRefUpload = async (employeeId, file) => {
        if (!file) return;
        if (file.type !== "application/pdf") {
            setEvalMessages(prev => ({ ...prev, [employeeId]: { type: "error", text: "Reference sheet must be a PDF" } }));
            return;
        }
        setRefUploading(prev => ({ ...prev, [employeeId]: true }));
        setEvalMessages(prev => ({ ...prev, [employeeId]: null }));
        try {
            const fd = new FormData();
            fd.append("file", file);
            fd.append("kind", "reference");
            const res = await fetch("/api/hr/upload", { method: "POST", body: fd });
            const json = await res.json();
            if (!res.ok || !json.success) {
                throw new Error(json.message || "Upload failed");
            }
            setRefSheetUrls(prev => ({ ...prev, [employeeId]: json.data.url }));
            setEvalMessages(prev => ({ ...prev, [employeeId]: { type: "success", text: "Reference sheet uploaded" } }));
        } catch (err) {
            setEvalMessages(prev => ({ ...prev, [employeeId]: { type: "error", text: err.message || "Upload failed" } }));
        }
        setRefUploading(prev => ({ ...prev, [employeeId]: false }));
    };

    const handleEvalSubmit = async (employeeId) => {
        const att = attendancePcts[employeeId];
        const hrs = workingHoursMap[employeeId];
        if (att === undefined || att === "" || hrs === undefined || hrs === "") {
            setEvalMessages(prev => ({ ...prev, [employeeId]: { type: "error", text: "Please enter attendance % and total working hours" } }));
            return;
        }
        const numAtt = Number(att);
        const numHrs = Number(hrs);
        if (isNaN(numAtt) || numAtt < 0 || numAtt > 100) {
            setEvalMessages(prev => ({ ...prev, [employeeId]: { type: "error", text: "Attendance % must be between 0 and 100" } }));
            return;
        }
        if (isNaN(numHrs) || numHrs < 0) {
            setEvalMessages(prev => ({ ...prev, [employeeId]: { type: "error", text: "Working hours must be a positive number" } }));
            return;
        }
        const ref = (refSheetUrls[employeeId] || "").trim();
        if (ref && !/^https?:\/\//i.test(ref)) {
            setEvalMessages(prev => ({ ...prev, [employeeId]: { type: "error", text: "Reference sheet must be a valid URL (http:// or https://)" } }));
            return;
        }

        setEvalSubmitting(prev => ({ ...prev, [employeeId]: true }));
        setEvalMessages(prev => ({ ...prev, [employeeId]: null }));

        try {
            await api("/api/hr/evaluate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    employeeId,
                    attendancePct: numAtt,
                    workingHours: numHrs,
                    referenceSheetUrl: ref,
                    notes: hrNotes[employeeId] || "",
                }),
            });
            setEvalDone(prev => ({ ...prev, [employeeId]: true }));
            setEvalMessages(prev => ({ ...prev, [employeeId]: { type: "success", text: "Evaluation submitted successfully" } }));
        } catch (err) {
            setEvalMessages(prev => ({ ...prev, [employeeId]: { type: "error", text: err.message || "Failed to submit evaluation" } }));
        }
        setEvalSubmitting(prev => ({ ...prev, [employeeId]: false }));
    };

    const evaluatedCount = shortlist.filter(e => evalDone[e.id] || e.hrEvaluated).length;
    const totalShortlisted = shortlist.length;

    /* ══════════════════════════════════════════════════
       EMPLOYEE MANAGEMENT TAB LOGIC (kept from original)
       ══════════════════════════════════════════════════ */
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

    useEffect(() => { if (authorized && mainTab === "management") fetchEmployees(1); }, [authorized, mainTab]);
    useEffect(() => { if (authorized && mainTab === "management") { const t = setTimeout(() => fetchEmployees(1, empFilter), 300); return () => clearTimeout(t); } }, [empFilter.search, empFilter.department, empFilter.role]);
    useEffect(() => { if (authorized && subTab === "archived") fetchArchived(); }, [subTab]);

    /* ─── Loading / Auth gates ─── */
    if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#003087]" /></div>;

    if (!authorized) {
        return (
            <DashboardShell user={user} title="HR Dashboard">
                <div className="bg-red-50 border border-red-200 rounded-xl p-8 text-center">
                    <p className="text-red-700 font-bold text-lg">Access Denied</p>
                    <p className="text-red-600 text-sm mt-2">You are not authorized to access this dashboard.</p>
                </div>
            </DashboardShell>
        );
    }

    /* ──────────────────────────────────────
       RENDER — EVALUATE TAB
       ────────────────────────────────────── */
    const renderEvaluateTab = () => (
        <div className="space-y-6">
            {/* Progress bar */}
            {totalShortlisted > 0 && (
                <div className="bg-white border border-[#E0E0E0] rounded-xl p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-bold text-[#333333]">
                            Evaluation Progress
                        </span>
                        <span className="text-sm font-bold text-[#F57C00]">
                            {evaluatedCount} / {totalShortlisted} evaluated
                        </span>
                    </div>
                    <div className="w-full bg-[#E0E0E0] rounded-full h-3">
                        <div
                            className="h-3 rounded-full transition-all duration-500"
                            style={{
                                width: `${totalShortlisted > 0 ? (evaluatedCount / totalShortlisted) * 100 : 0}%`,
                                backgroundColor: "#F57C00",
                            }}
                        />
                    </div>
                    {evaluatedCount === totalShortlisted && totalShortlisted > 0 && (
                        <p className="text-[#00843D] text-sm font-bold mt-2">All evaluations complete!</p>
                    )}
                </div>
            )}

            {evalLoading && (
                <div className="text-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#F57C00] mx-auto mb-3" />
                    <p className="text-sm text-[#666666]">Loading Stage 3 shortlisted employees...</p>
                </div>
            )}

            {evalError && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                    <p className="text-red-700 text-sm font-bold">{evalError}</p>
                    <button onClick={fetchShortlist} className="mt-2 text-sm text-[#F57C00] font-bold hover:underline cursor-pointer">Retry</button>
                </div>
            )}

            {!evalLoading && !evalError && totalShortlisted === 0 && (
                <div className="bg-white border border-[#E0E0E0] rounded-xl p-8 text-center shadow-sm">
                    <p className="text-[#666666] text-sm">No Stage 3 shortlisted employees found for evaluation.</p>
                </div>
            )}

            {/* Employee evaluation cards */}
            {shortlist.map((emp) => {
                const isAlreadyDone = emp.hrEvaluated || evalDone[emp.id];
                const msg = evalMessages[emp.id];

                return (
                    <div key={emp.id} className={`bg-white border-2 rounded-xl shadow-sm transition-colors ${isAlreadyDone ? "border-[#00843D]/40 bg-[#F1F8E9]/30" : "border-[#E0E0E0]"}`}>
                        {/* Header row */}
                        <div className="px-5 py-4 border-b border-[#E0E0E0] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                            <div className="flex items-center gap-3">
                                {isAlreadyDone && <CheckIcon />}
                                <div>
                                    <h3 className="text-base font-bold text-[#003087]">{emp.name}</h3>
                                    <p className="text-xs text-[#666666] mt-0.5">
                                        {emp.empCode} &middot;{" "}
                                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${emp.collarType === "BLUE" ? "bg-blue-50 text-blue-700 border border-blue-200" : "bg-amber-50 text-amber-700 border border-amber-200"}`}>
                                            {emp.collarType || "N/A"} collar
                                        </span>
                                        {" "}&middot; {emp.department || emp.departmentName || "—"}
                                    </p>
                                </div>
                            </div>
                            <div className="text-right">
                                <span className="text-xs text-[#666666]">Combined Score</span>
                                <p className="text-lg font-bold text-[#F57C00]">{emp.combinedScore ?? emp.totalScore ?? "—"}</p>
                            </div>
                        </div>

                        {/* Body */}
                        <div className="px-5 py-4 space-y-4">
                            {/* Attendance % + Working Hours */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-[#666666] mb-1.5">Total Attendance % (0 - 100)</label>
                                    <input
                                        type="number"
                                        min={0}
                                        max={100}
                                        step="0.01"
                                        value={attendancePcts[emp.id] ?? (emp.attendancePct ?? "")}
                                        onChange={(e) => setAttendancePcts(prev => ({ ...prev, [emp.id]: e.target.value }))}
                                        disabled={isAlreadyDone}
                                        placeholder="e.g. 92.5"
                                        className="w-full h-10 px-3 bg-[#F5F5F5] border border-[#CCCCCC] rounded-lg text-sm text-[#333333] focus:outline-none focus:ring-2 focus:ring-[#F57C00]/30 focus:border-[#F57C00] disabled:opacity-50"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-[#666666] mb-1.5">Total Working Hours</label>
                                    <input
                                        type="number"
                                        min={0}
                                        step="0.01"
                                        value={workingHoursMap[emp.id] ?? (emp.workingHours ?? "")}
                                        onChange={(e) => setWorkingHoursMap(prev => ({ ...prev, [emp.id]: e.target.value }))}
                                        disabled={isAlreadyDone}
                                        placeholder="e.g. 480"
                                        className="w-full h-10 px-3 bg-[#F5F5F5] border border-[#CCCCCC] rounded-lg text-sm text-[#333333] focus:outline-none focus:ring-2 focus:ring-[#F57C00]/30 focus:border-[#F57C00] disabled:opacity-50"
                                    />
                                </div>
                            </div>

                            {/* Reference Sheet URL + Notes */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-[#666666] mb-1.5">Reference Sheet Link (optional)</label>
                                    <input
                                        type="url"
                                        value={refSheetUrls[emp.id] ?? (emp.referenceSheetUrl ?? "")}
                                        onChange={(e) => setRefSheetUrls(prev => ({ ...prev, [emp.id]: e.target.value }))}
                                        disabled={isAlreadyDone}
                                        placeholder="https://..."
                                        className="w-full h-10 px-3 bg-[#F5F5F5] border border-[#CCCCCC] rounded-lg text-sm text-[#333333] focus:outline-none focus:ring-2 focus:ring-[#F57C00]/30 focus:border-[#F57C00] disabled:opacity-50"
                                    />
                                    <div className="mt-1.5 flex items-center gap-2">
                                        <input
                                            type="file"
                                            accept="application/pdf"
                                            disabled={isAlreadyDone || refUploading[emp.id]}
                                            onChange={(e) => handleRefUpload(emp.id, e.target.files?.[0])}
                                            className="text-xs text-[#666666] file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-[#F57C00]/10 file:text-[#F57C00] hover:file:bg-[#F57C00]/20 disabled:opacity-50"
                                        />
                                        {refUploading[emp.id] && <span className="text-xs text-[#666666]">Uploading…</span>}
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-[#666666] mb-1.5">Notes (optional)</label>
                                    <input
                                        type="text"
                                        value={hrNotes[emp.id] ?? (emp.hrNotes ?? "")}
                                        onChange={(e) => setHrNotes(prev => ({ ...prev, [emp.id]: e.target.value }))}
                                        disabled={isAlreadyDone}
                                        placeholder="Any remarks..."
                                        className="w-full h-10 px-3 bg-[#F5F5F5] border border-[#CCCCCC] rounded-lg text-sm text-[#333333] focus:outline-none focus:ring-2 focus:ring-[#F57C00]/30 focus:border-[#F57C00] disabled:opacity-50"
                                    />
                                </div>
                            </div>

                            {/* Message + Submit */}
                            {msg && (
                                <div className={`p-3 rounded-lg text-sm font-medium ${msg.type === "success" ? "bg-green-50 text-green-800 border border-green-200" : "bg-red-50 text-red-800 border border-red-200"}`}>
                                    {msg.text}
                                </div>
                            )}

                            {!isAlreadyDone && (
                                <div className="flex justify-end">
                                    <button
                                        onClick={() => handleEvalSubmit(emp.id)}
                                        disabled={evalSubmitting[emp.id]}
                                        className="px-6 py-2.5 bg-[#F57C00] text-white rounded-lg text-sm font-bold hover:bg-[#E65100] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                                    >
                                        {evalSubmitting[emp.id] ? "Submitting..." : "Submit Evaluation"}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );

    /* ──────────────────────────────────────
       RENDER — EMPLOYEE MANAGEMENT TAB
       (preserved from original page)
       ────────────────────────────────────── */
    const renderManagementTab = () => (
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
                                <option value="BRANCH_MANAGER">Branch Manager</option>
                                <option value="CLUSTER_MANAGER">Cluster Manager</option>
                                <option value="HOD">HOD</option>
                                <option value="HR">HR</option>
                                <option value="COMMITTEE">Committee</option>
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
                                            <td className="px-5 py-3 text-sm text-[#333333] font-mono">{e.empCode || "\u2014"}</td>
                                            <td className="px-5 py-3 text-sm font-bold text-[#003087]">{e.name}</td>
                                            <td className="px-5 py-3 text-sm text-[#333333]">{e.department}{e.evaluatorRoles?.length > 0 && <span className="block text-[10px] text-[#666666] mt-0.5">{e.evaluatorRoles.map(er => `${er.role.replace("_"," ")} \u2014 ${er.department}`).join(", ")}</span>}</td>
                                            <td className="px-5 py-3 text-sm text-[#666666]">{e.designation}</td>
                                            <td className="px-5 py-3"><div className="flex flex-wrap gap-1">{roles.map(r => <span key={r} className={`text-[10px] px-2 py-0.5 rounded-full border font-bold uppercase tracking-wider ${r === "EMPLOYEE" ? "bg-gray-50 text-gray-700 border-gray-200" : r === "BRANCH_MANAGER" ? "bg-emerald-50 text-[#00843D] border-emerald-200" : r === "CLUSTER_MANAGER" ? "bg-orange-50 text-[#F7941D] border-orange-200" : r === "HOD" ? "bg-purple-50 text-purple-700 border-purple-200" : "bg-[#003087] text-white border-[#003087]"}`}>{r.replace("_", " ")}</span>)}</div></td>
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
                                        <td className="px-5 py-3 text-sm text-[#333333] font-mono">{a.empCode || "\u2014"}</td>
                                        <td className="px-5 py-3 text-sm font-bold text-[#333333]">{a.name}</td>
                                        <td className="px-5 py-3 text-sm text-[#333333]">{a.department}</td>
                                        <td className="px-5 py-3 text-sm text-[#666666]">{a.designation || "\u2014"}</td>
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
    );

    /* ──────────────────────────────────────
       MAIN RENDER
       ────────────────────────────────────── */
    return (
        <DashboardShell user={user} title="HR Dashboard">
            <div className="space-y-6">
                {/* Main tab switcher */}
                <div className="flex gap-1 bg-[#F5F5F5] p-1 rounded-xl border border-[#E0E0E0] w-fit">
                    <button
                        onClick={() => setMainTab("evaluate")}
                        className={`px-5 py-2.5 rounded-lg text-sm font-bold transition-all cursor-pointer ${
                            mainTab === "evaluate"
                                ? "bg-[#F57C00] text-white shadow-sm"
                                : "text-[#666666] hover:text-[#333333] hover:bg-white"
                        }`}
                    >
                        Evaluate
                    </button>
                    <button
                        onClick={() => setMainTab("management")}
                        className={`px-5 py-2.5 rounded-lg text-sm font-bold transition-all cursor-pointer ${
                            mainTab === "management"
                                ? "bg-[#F57C00] text-white shadow-sm"
                                : "text-[#666666] hover:text-[#333333] hover:bg-white"
                        }`}
                    >
                        Employee Management
                    </button>
                </div>

                {/* Tab content */}
                {mainTab === "evaluate" && renderEvaluateTab()}
                {mainTab === "management" && renderManagementTab()}
            </div>
        </DashboardShell>
    );
}
