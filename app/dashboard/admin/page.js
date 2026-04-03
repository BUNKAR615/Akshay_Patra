"use client";

import { useState, useEffect } from "react";
import DashboardShell from "../../../components/DashboardShell";
import ConfirmDialog from "../../../components/ConfirmDialog";
import { PageSpinner, SkeletonCard, SkeletonStats } from "../../../components/Skeleton";
import UserProfileCard from "../../../components/UserProfileCard";
import Papa from "papaparse";

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
    const [user, setUser] = useState(null);
    const [tab, setTab] = useState("summary");
    const [loading, setLoading] = useState(true);

    // Confirm dialog
    const [confirm, setConfirm] = useState({ open: false, type: null });

    // Summary state
    const [report, setReport] = useState(null);
    const [reportLoading, setReportLoading] = useState(false);

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
    const [empLoading, setEmpLoading] = useState(false);
    const [empFilter, setEmpFilter] = useState({ search: "", department: "", role: "" });

    const fetchEmployees = async () => {
        setEmpLoading(true);
        try {
            const d = await api("/api/admin/employees");
            setEmployees(d.employees);
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
            try { const d = await api("/api/auth/me"); setUser(d.user); } catch { }
            setLoading(false);
        })();
    }, []);

    // Org Structure state
    const [orgStructure, setOrgStructure] = useState([]);
    const [orgLoading, setOrgLoading] = useState(false);

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
        } catch { }
        setReportLoading(false);
    };

    const fetchOrg = async () => {
        setOrgLoading(true);
        try {
            const d = await api("/api/admin/departments/all-assignments");
            setOrgStructure(d.departments);
        } catch { }
        setOrgLoading(false);
    };

    const fetchQuestions = async () => {
        try {
            const d = await api("/api/admin/questions");
            setQuestions(d.questions);
        } catch { }
    };

    useEffect(() => {
        if (tab === "summary" && !quarterProgress) {
            fetchProgress();
            fetchReport();
        }
        if (tab === "org" && orgStructure.length === 0) fetchOrg();
        if (tab === "questions" && questions.length === 0) fetchQuestions();
    }, [tab]);

    useEffect(() => {
        // Auto-refresh summary tab every 60s
        let interval;
        if (tab === "summary") {
            interval = setInterval(() => {
                fetchProgress();
            }, 60000);
        }
        return () => clearInterval(interval);
    }, [tab]);

    // ── CSV export ──
    const exportCSV = () => {
        if (!report?.employees?.length) return;
        const stageLabel = { 1: "Self Assessment", 2: "Supervisor", 3: "Branch Manager", 4: "Cluster Manager" };
        const csvData = report.employees.map((e) => ({
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
        link.download = `quarter-report-${report.quarter?.name || "export"}.csv`;
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
            if (tab === "summary") { fetchProgress(); fetchReport(); }
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
            if (tab === "summary") { fetchProgress(); fetchReport(); }
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

    useEffect(() => { if (tab === "employees" && employees.length === 0) fetchEmployees(); }, [tab]);

    useEffect(() => { if (tab === "logs") fetchLogs(); }, [tab]);

    const TABS = [
        { id: "summary", label: "Summary" },
        { id: "org", label: "Org Structure" },
        { id: "quarter", label: "Quarter" },
        { id: "questions", label: "Questions" },
        { id: "employees", label: "All Employees" },
        { id: "logs", label: "Audit Logs" },
    ];
    const CATEGORIES = ["ATTENDANCE", "DISCIPLINE", "PRODUCTIVITY", "TEAMWORK", "INITIATIVE", "COMMUNICATION", "INTEGRITY"];
    const LEVELS = ["SELF", "SUPERVISOR", "BRANCH_MANAGER", "CLUSTER_MANAGER"];

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

            {/* Tabs — scrollable on mobile */}
            <div className="overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0 mb-6 pb-1">
                <div className="flex gap-1 bg-[#F5F5F5] rounded-xl p-1 border border-[#E0E0E0] w-max sm:w-fit">
                    {TABS.map((t) => (
                        <button key={t.id} onClick={() => setTab(t.id)} className={`min-h-[40px] sm:min-h-[44px] px-3 sm:px-4 py-2 rounded-lg text-[13px] sm:text-[14px] font-bold transition-all cursor-pointer whitespace-nowrap ${tab === t.id ? "bg-[#003087] text-white shadow-sm" : "text-[#333333] hover:text-[#003087] hover:bg-white"}`}>{t.label}</button>
                    ))}
                </div>
            </div>

            {/* ═══════ SUMMARY TAB ═══════ */}
            {tab === "summary" && (
                <div className="space-y-6">
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
                                <div className="bg-white border border-[#E0E0E0] rounded-xl p-3 sm:p-5 shadow-sm">
                                    <p className="text-[#333333] tracking-wide text-[10px] sm:text-xs uppercase font-medium">Total Employees</p>
                                    <p className="text-xl sm:text-2xl font-bold text-[#1A1A2E] mt-1">{quarterProgress.overallStats.totalEmployees}</p>
                                </div>
                                <div className="bg-white border border-[#E0E0E0] rounded-xl p-3 sm:p-5 shadow-sm">
                                    <p className="text-[#333333] tracking-wide text-[10px] sm:text-xs uppercase font-medium">Submitted</p>
                                    <p className="text-xl sm:text-2xl font-bold text-[#003087] mt-1">{quarterProgress.overallStats.totalSubmitted}</p>
                                </div>
                                <div className="bg-white border border-[#E0E0E0] rounded-xl p-3 sm:p-5 shadow-sm">
                                    <p className="text-[#333333] tracking-wide text-[10px] sm:text-xs uppercase font-medium">Completion</p>
                                    <p className="text-xl sm:text-2xl font-bold text-[#00843D] mt-1">{quarterProgress.overallStats.overallPercentage}%</p>
                                </div>
                                <div className="bg-white border border-[#E0E0E0] rounded-xl p-3 sm:p-5 shadow-sm">
                                    <p className="text-[#333333] tracking-wide text-[10px] sm:text-xs uppercase font-medium">Winners</p>
                                    {quarterProgress.overallStats.quarterWinners && quarterProgress.overallStats.quarterWinners.length > 0 ? (
                                        <p className="text-xl sm:text-2xl font-bold text-[#F7941D] mt-1">{quarterProgress.overallStats.quarterWinners.length} / {quarterProgress.departments.length}</p>
                                    ) : (
                                        <p className="text-sm sm:text-lg font-bold text-[#666666] mt-1 italic">In Progress</p>
                                    )}
                                </div>
                            </div>

                            {/* SECTION — Department Winners List */}
                            <div className="bg-gradient-to-r from-[#FFF8E1] to-[#FFF3E0] border border-[#FFCC80] rounded-xl p-4 sm:p-6 shadow-sm">
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
                                <button onClick={() => { fetchReport(); setTimeout(exportCSV, 500); }} className="px-3 sm:px-4 py-2 bg-[#003087] hover:bg-[#00843D] text-white font-bold rounded-lg text-xs sm:text-sm transition-colors cursor-pointer shadow-sm flex items-center justify-center gap-1.5 sm:gap-2">
                                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                    Export
                                </button>
                                <button onClick={fetchProgress} className="px-3 sm:px-4 py-2 bg-white border border-[#CCCCCC] hover:bg-[#E3F2FD] hover:text-[#003087] text-[#333333] font-bold rounded-lg text-xs sm:text-sm transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-sm">
                                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                    Refresh
                                </button>
                            </div>

                            {/* SECTION C & D — Per Department Progress Table & Details */}
                            <div className="space-y-4">
                                <h3 className="text-lg font-bold text-[#003087]">Department Progress</h3>

                                <div className="bg-white border border-[#E0E0E0] shadow-sm rounded-xl overflow-hidden">
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm min-w-[700px]">
                                            <thead>
                                                <tr className="border-b border-[#E0E0E0] bg-[#F5F5F5]">
                                                    <th className="text-left font-medium text-[#333333] px-4 py-3 min-w-[150px]">Department</th>
                                                    <th className="text-center font-medium text-[#333333] px-3 py-3 w-[100px]">Employees</th>
                                                    <th className="text-center font-medium text-[#333333] px-3 py-3 w-[120px]">Stage 1 (Self)</th>
                                                    <th className="text-center font-medium text-[#333333] px-3 py-3 w-[120px]">Stage 2 (Sup)</th>
                                                    <th className="text-center font-medium text-[#333333] px-3 py-3 w-[120px]">Stage 3 (BM)</th>
                                                    <th className="text-center font-medium text-[#333333] px-3 py-3 w-[120px]">Stage 4 (CM)</th>
                                                    <th className="text-center font-medium text-[#333333] px-4 py-3 w-[120px]">Current Stage</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-[#E0E0E0]">
                                                {quarterProgress.departments.map((dept) => {
                                                    let currentStage = "S1";
                                                    if (dept.winner) currentStage = "Done";
                                                    else if (dept.stage4.total > 0) currentStage = "S4";
                                                    else if (dept.stage3.total > 0) currentStage = "S3";
                                                    else if (dept.stage2.total > 0) currentStage = "S2";

                                                    return (
                                                        <tr key={dept.departmentId} className="hover:bg-[#F9F9F9] transition-colors group cursor-pointer" onClick={() => {
                                                            const el = document.getElementById(`dept-details-${dept.departmentId}`);
                                                            if (el) el.classList.toggle('hidden');
                                                        }}>
                                                            <td className="px-4 py-4">
                                                                <div className="font-semibold text-[#003087] flex items-center gap-2">
                                                                    <svg className="w-4 h-4 text-[#999999]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                                                    {dept.departmentName}
                                                                </div>
                                                                {dept.smallDeptRule && <p className="text-[10px] text-[#666666] tracking-tight uppercase mt-0.5">{dept.smallDeptRule}</p>}
                                                            </td>
                                                            <td className="text-center px-3 py-4 font-medium text-[#1A1A2E]">{dept.totalEmployees}</td>
                                                            <td className="text-center px-3 py-4 whitespace-nowrap">
                                                                <span className={dept.stage1.submitted === dept.stage1.total && dept.stage1.total > 0 ? "text-[#00843D] font-bold" : "text-[#1A1A2E]"}>
                                                                    {dept.stage1.submitted} / {dept.stage1.total}
                                                                </span>
                                                            </td>
                                                            <td className="text-center px-3 py-4 whitespace-nowrap">
                                                                <span className={dept.stage2.evaluated === dept.stage2.total && dept.stage2.total > 0 ? "text-[#00843D] font-bold" : "text-[#1A1A2E]"}>
                                                                    {dept.stage2.evaluated} / {dept.stage2.total}
                                                                </span>
                                                            </td>
                                                            <td className="text-center px-3 py-4 whitespace-nowrap">
                                                                <span className={dept.stage3.evaluated === dept.stage3.total && dept.stage3.total > 0 ? "text-[#00843D] font-bold" : "text-[#1A1A2E]"}>
                                                                    {dept.stage3.evaluated} / {dept.stage3.total}
                                                                </span>
                                                            </td>
                                                            <td className="text-center px-3 py-4 whitespace-nowrap">
                                                                <span className={dept.stage4.evaluated === dept.stage4.total && dept.stage4.total > 0 ? "text-[#00843D] font-bold" : "text-[#1A1A2E]"}>
                                                                    {dept.stage4.evaluated} / {dept.stage4.total}
                                                                </span>
                                                            </td>
                                                            <td className="text-center px-4 py-4">
                                                                <span className={`px-2 py-1 text-xs rounded-full border font-bold ${currentStage === "Done" ? "bg-[#E8F5E9] text-[#00843D] border-[#A5D6A7]" : "bg-[#FFF3E0] text-[#F7941D] border-[#FFCC80]"}`}>
                                                                    {currentStage}
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    )
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* Expandable Details Rows rendering below the table logically */}
                                <div className="space-y-2 mt-4">
                                    {quarterProgress.departments.map((dept) => (
                                        <div key={`details-${dept.departmentId}`} id={`dept-details-${dept.departmentId}`} className="hidden bg-[#F5F5F5] border border-[#CCCCCC] rounded-lg p-5">
                                            <div className="flex items-center justify-between mb-3 border-b border-[#CCCCCC] pb-2">
                                                <h4 className="font-bold text-[#003087]">{dept.departmentName} — Candidate Backlog</h4>
                                                {dept.winner && (
                                                    <div className="bg-[#FFF3E0] border border-[#FFCC80] text-[#F7941D] px-3 py-1 rounded-md text-xs font-bold flex items-center gap-2">
                                                        🏆 Winner: {dept.winner.name}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                                <div>
                                                    <p className="text-xs font-bold text-[#333333] mb-2 border-b border-[#E0E0E0] pb-1">Stage 1: Self Assessed</p>
                                                    {dept.stage1.submittedNames.length > 0 ? (
                                                        <ul className="text-xs text-[#1A1A2E] space-y-1 list-disc pl-4">
                                                            {dept.stage1.submittedNames.map((n, i) => <li key={i}>{n}</li>)}
                                                        </ul>
                                                    ) : <p className="text-xs text-[#999999] italic">None yet</p>}
                                                </div>
                                                <div>
                                                    <p className="text-xs font-bold text-[#333333] mb-2 border-b border-[#E0E0E0] pb-1">Stage 2: Supervisor Evaluates</p>
                                                    {dept.stage2.shortlistNames.length > 0 ? (
                                                        <ul className="text-xs text-[#1A1A2E] space-y-1 list-disc pl-4">
                                                            {dept.stage2.shortlistNames.map((n, i) => <li key={i}>{n}</li>)}
                                                        </ul>
                                                    ) : <p className="text-xs text-[#999999] italic">Waiting for S1 close</p>}
                                                </div>
                                                <div>
                                                    <p className="text-xs font-bold text-[#333333] mb-2 border-b border-[#E0E0E0] pb-1">Stage 3: BM Evaluates</p>
                                                    {dept.stage3.shortlistNames.length > 0 ? (
                                                        <ul className="text-xs text-[#1A1A2E] space-y-1 list-disc pl-4">
                                                            {dept.stage3.shortlistNames.map((n, i) => <li key={i}>{n}</li>)}
                                                        </ul>
                                                    ) : <p className="text-xs text-[#999999] italic">Waiting for S2 close</p>}
                                                </div>
                                                <div>
                                                    <p className="text-xs font-bold text-[#333333] mb-2 border-b border-[#E0E0E0] pb-1">Stage 4: CM Evaluates</p>
                                                    {dept.stage4.shortlistNames.length > 0 ? (
                                                        <ul className="text-xs text-[#1A1A2E] space-y-1 list-disc pl-4">
                                                            {dept.stage4.shortlistNames.map((n, i) => <li key={i}>{n}</li>)}
                                                        </ul>
                                                    ) : <p className="text-xs text-[#999999] italic">Waiting for S3 close</p>}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
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

            {/* ═══════ ORG STRUCTURE TAB ═══════ */}
            {tab === "org" && (
                <div className="space-y-6">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xl font-bold text-[#003087]">Organization Structure</h2>
                        <button onClick={fetchOrg} className="px-3 py-2 min-h-[44px] min-w-[80px] bg-white border border-[#CCCCCC] rounded-lg text-[#333333] font-bold hover:text-[#003087] hover:bg-[#F5F5F5] text-[14px] flex items-center gap-1.5 cursor-pointer transition-colors">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                            Refresh
                        </button>
                    </div>

                    {orgLoading ? (
                        <div className="flex items-center justify-center h-32"><div className="animate-spin h-8 w-8 border-2 border-[#003087] border-t-transparent rounded-full" /></div>
                    ) : (
                        <div className="grid grid-cols-1 gap-6">
                            {orgStructure.map((dept) => (
                                <div key={dept.id} className="bg-white border border-[#E0E0E0] rounded-xl p-3 sm:p-5 shadow-sm">
                                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center border-b border-[#E0E0E0] pb-3 mb-4 gap-1">
                                        <div>
                                            <h3 className="text-base sm:text-lg font-bold text-[#003087]">{dept.name}</h3>
                                            <p className="text-[10px] sm:text-xs text-[#333333] uppercase tracking-wider">{dept.branch} Branch &middot; {dept.employeeCount} Employees</p>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div className="bg-[#F5F5F5] rounded-lg p-3 border border-[#E0E0E0]">
                                            <p className="text-xs text-[#333333] mb-1 font-medium">Supervisor(s)</p>
                                            {dept.supervisors?.length > 0 ? (
                                                <div className="space-y-2">
                                                    {dept.supervisors.map(sup => (
                                                        <div key={sup.id}><p className="text-sm text-[#1A1A2E] font-medium">{sup.name}</p><p className="text-xs text-[#666666]">{sup.designation || "No Designation"}</p></div>
                                                    ))}
                                                </div>
                                            ) : dept.supervisor ? (
                                                <div><p className="text-sm text-[#1A1A2E] font-medium">{dept.supervisor.name}</p><p className="text-xs text-[#666666]">{dept.supervisor.designation || "No Designation"}</p></div>
                                            ) : (
                                                <p className="text-sm text-[#999999] italic">Not Assigned</p>
                                            )}
                                        </div>
                                        <div className="bg-[#F5F5F5] rounded-lg p-3 border border-[#E0E0E0]">
                                            <p className="text-xs text-[#333333] mb-1 font-medium">Branch Manager(s)</p>
                                            {dept.branchManagers?.length > 0 ? (
                                                <div className="space-y-2">
                                                    {dept.branchManagers.map(bm => (
                                                        <div key={bm.id}><p className="text-sm text-[#1A1A2E] font-medium">{bm.name}</p><p className="text-xs text-[#666666]">{bm.designation || "No Designation"}</p></div>
                                                    ))}
                                                </div>
                                            ) : dept.branchManager ? (
                                                <div><p className="text-sm text-[#1A1A2E] font-medium">{dept.branchManager.name}</p><p className="text-xs text-[#666666]">{dept.branchManager.designation || "No Designation"}</p></div>
                                            ) : (
                                                <p className="text-sm text-[#999999] italic">Not Assigned</p>
                                            )}
                                        </div>
                                        <div className="bg-[#F5F5F5] rounded-lg p-3 border border-[#E0E0E0]">
                                            <p className="text-xs text-[#333333] mb-1 font-medium">Cluster Manager(s)</p>
                                            {dept.clusterManagers?.length > 0 ? (
                                                <div className="space-y-2">
                                                    {dept.clusterManagers.map(cm => (
                                                        <div key={cm.id}><p className="text-sm text-[#1A1A2E] font-medium">{cm.name}</p><p className="text-xs text-[#666666]">{cm.designation || "No Designation"}</p></div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <p className="text-sm text-[#999999] italic">Not Assigned</p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
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
                            <select value={empFilter.department} onChange={(e) => setEmpFilter({ ...empFilter, department: e.target.value })} className="h-10 px-2 sm:px-3 bg-[#F5F5F5] border border-[#CCCCCC] rounded-lg text-xs sm:text-sm text-[#333333] focus:outline-none focus:ring-2 focus:ring-[#003087]/20 focus:border-[#003087] w-full sm:w-40">
                                <option value="">All Depts</option>
                                {[...new Set(employees.map(e => e.department))].sort().map(d => <option key={d} value={d}>{d}</option>)}
                            </select>
                            <select value={empFilter.role} onChange={(e) => setEmpFilter({ ...empFilter, role: e.target.value })} className="h-10 px-2 sm:px-3 bg-[#F5F5F5] border border-[#CCCCCC] rounded-lg text-xs sm:text-sm text-[#333333] focus:outline-none focus:ring-2 focus:ring-[#003087]/20 focus:border-[#003087] w-full sm:w-36">
                                <option value="">All Roles</option>
                                <option value="EMPLOYEE">Employee</option>
                                <option value="SUPERVISOR">Supervisor</option>
                                <option value="BRANCH_MANAGER">Branch Mgr</option>
                                <option value="CLUSTER_MANAGER">Cluster Mgr</option>
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
                                        <th className="px-5 py-3 text-[12px] font-bold text-[#666666] uppercase tracking-wider">Role</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[#E0E0E0]">
                                    {empLoading ? <tr><td colSpan={5} className="px-5 py-8 text-center text-[#666666]">Loading...</td></tr> :
                                    employees.filter(e => {
                                        const searchStr = empFilter.search.toLowerCase();
                                        const matchSearch = e.name.toLowerCase().includes(searchStr) || (e.empCode && e.empCode.includes(searchStr));
                                        const matchDept = empFilter.department ? (e.department === empFilter.department || (e.evaluatorRoles || []).some(er => er.department === empFilter.department)) : true;
                                        const matchRole = empFilter.role ? (e.roles || [e.role]).includes(empFilter.role) : true;
                                        return matchSearch && matchDept && matchRole;
                                    }).map(e => {
                                        const roles = e.roles || [e.role];
                                        return (
                                        <tr key={e.id} className="hover:bg-[#FAFAFA] transition-colors">
                                            <td className="px-5 py-3 text-sm text-[#333333] font-mono">{e.empCode || "—"}</td>
                                            <td className="px-5 py-3 text-sm font-bold text-[#003087]">{e.name}</td>
                                            <td className="px-5 py-3 text-sm text-[#333333]">{e.department}{e.evaluatorRoles?.length > 0 && <span className="block text-[10px] text-[#666666] mt-0.5">{e.evaluatorRoles.map(er => `${er.role.replace("_"," ")} — ${er.department}`).join(", ")}</span>}</td>
                                            <td className="px-5 py-3 text-sm text-[#666666]">{e.designation}</td>
                                            <td className="px-5 py-3"><div className="flex flex-wrap gap-1">{roles.map(r => <span key={r} className={`text-[10px] px-2 py-0.5 rounded-full border font-bold uppercase tracking-wider ${r === "EMPLOYEE" ? "bg-gray-50 text-gray-700 border-gray-200" : r === "SUPERVISOR" ? "bg-blue-50 text-[#003087] border-blue-200" : r === "BRANCH_MANAGER" ? "bg-emerald-50 text-[#00843D] border-emerald-200" : r === "CLUSTER_MANAGER" ? "bg-orange-50 text-[#F7941D] border-orange-200" : "bg-[#003087] text-white border-[#003087]"}`}>{r.replace("_", " ")}</span>)}</div></td>
                                        </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
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
