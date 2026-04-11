"use client";

import { useState, useEffect } from "react";
import DashboardShell from "../../../components/DashboardShell";
import EvaluationForm from "../../../components/EvaluationForm";
import UserProfileCard from "../../../components/UserProfileCard";

async function api(url, opts) {
    const res = await fetch(url, opts);
    const json = await res.json();
    if (!res.ok) {
        if (res.status === 401) {
            window.location.replace("/login");
            return new Promise(() => { }); // never resolves, waits for redirect
        }
        throw new Error(json.message || "Something went wrong. Please try again in a moment.");
    }
    if (!json.success) throw new Error(json.message || "Something went wrong. Please try again in a moment.");
    return json.data;
}

function StatBox({ label, value, color, compact }) {
    return (
        <div className="border border-[#E0E0E0] rounded-lg bg-[#FAFCFF] px-3 py-2.5 text-center">
            <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-[#666666] leading-tight">{label}</p>
            <p className={`${compact ? "text-[18px]" : "text-[22px]"} font-black mt-1`} style={{ color }}>
                {value != null ? value : "—"}
            </p>
        </div>
    );
}

export default function BranchManagerDashboard() {
    const [user, setUser] = useState(null);
    const [currentQuarterName, setCurrentQuarterName] = useState("");
    const [departmentsData, setDepartmentsData] = useState([]);
    const [selectedDeptId, setSelectedDeptId] = useState("");
    const [currentDept, setCurrentDept] = useState(null);

    const [shortlist, setShortlist] = useState([]);
    const [questions, setQuestions] = useState([]);
    const [selectedEmployee, setSelectedEmployee] = useState(null);
    const [progress, setProgress] = useState({ evaluated: 0, total: 0 });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [isMultiDept, setIsMultiDept] = useState(false);

    // HOD assignment state (BIG branches only)
    const [hodAssignments, setHodAssignments] = useState([]);
    const [hodDeptId, setHodDeptId] = useState("");
    const [hodSearchQuery, setHodSearchQuery] = useState("");
    const [hodCandidates, setHodCandidates] = useState([]);
    const [hodSelected, setHodSelected] = useState(null); // { id, name, empCode, departmentName }
    const [hodSearching, setHodSearching] = useState(false);
    const [hodLoading, setHodLoading] = useState(false);
    const [hodSuccess, setHodSuccess] = useState("");
    const [hodError, setHodError] = useState("");

    // Branch-wide stats
    const [bmStats, setBmStats] = useState(null);

    const fetchBmStats = async () => {
        try {
            const data = await api("/api/branch-manager/stats");
            setBmStats(data);
        } catch (e) {
            console.error("Failed to fetch BM stats:", e.message);
        }
    };

    const fetchHodAssignments = async () => {
        try {
            const data = await api("/api/branch-manager/hod/list");
            setHodAssignments(data.assignments || []);
        } catch (e) {
            // Non-critical — don't block the page
            console.error("Failed to fetch HOD assignments:", e.message);
        }
    };

    const fetchData = async () => {
        try {
            const [meData, deptsData, qData] = await Promise.all([
                api("/api/auth/me"),
                api("/api/branch-manager/departments"),
                api("/api/branch-manager/questions")
            ]);
            setUser(meData.user);
            setCurrentQuarterName(meData.currentQuarter || deptsData.quarter?.name);
            setDepartmentsData(deptsData.departments);
            setQuestions(qData.questions);
            setIsMultiDept(deptsData.departments.length > 1);

            // Fetch HOD assignments for BIG branches
            if (meData.user?.branchType === "BIG") {
                fetchHodAssignments();
            }
            fetchBmStats();

            if (deptsData.departments && deptsData.departments.length > 0) {
                // Try to find the first incomplete department
                const incomplete = deptsData.departments.find(d => !d.completed);
                const targetDept = incomplete || deptsData.departments[0];
                handleSelectDept(targetDept.id, deptsData.departments);
            }
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleSelectDept = (deptId, allDepts = departmentsData) => {
        const dept = allDepts.find(d => d.id === deptId);
        if (dept) {
            setSelectedDeptId(deptId);
            setCurrentDept(dept);
            setShortlist(dept.shortlist || []);
            setProgress({ evaluated: dept.evaluated, total: dept.totalToEvaluate });
            setSelectedEmployee(null);
            setError("");
            setSuccess("");
        }
    };

    useEffect(() => { fetchData(); }, []);

    // Debounced HOD search
    useEffect(() => {
        const q = hodSearchQuery.trim();
        if (q.length === 0) { setHodCandidates([]); return; }
        setHodSearching(true);
        const t = setTimeout(async () => {
            try {
                const data = await api(`/api/branch-manager/hod/search?q=${encodeURIComponent(q)}`);
                setHodCandidates(data.candidates || []);
            } catch {
                setHodCandidates([]);
            } finally {
                setHodSearching(false);
            }
        }, 300);
        return () => clearTimeout(t);
    }, [hodSearchQuery]);

    const handleAssignHod = async () => {
        setHodError("");
        setHodSuccess("");
        if (!hodDeptId) { setHodError("Please select a department."); return; }
        if (!hodSelected) { setHodError("Please search and select an employee to assign as HOD."); return; }
        setHodLoading(true);
        try {
            await api("/api/branch-manager/hod/assign", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ hodUserId: hodSelected.id, departmentId: hodDeptId }),
            });
            setHodSuccess(`${hodSelected.name} assigned as HOD successfully.`);
            setHodSearchQuery("");
            setHodSelected(null);
            setHodCandidates([]);
            setHodDeptId("");
            fetchHodAssignments();
        } catch (e) {
            setHodError(e.message);
        } finally {
            setHodLoading(false);
        }
    };

    const handleEvaluate = async (answers) => {
        setError(""); setSuccess("");
        try {
            const data = await api("/api/branch-manager/evaluate", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ employeeId: selectedEmployee.userId, answers }),
            });
            setSuccess(`Evaluation submitted for ${selectedEmployee.name}`);
            setSelectedEmployee(null);
            window.scrollTo({ top: 0, behavior: "smooth" });

            // Refresh department data instead of single shortlist
            const deptsData = await api("/api/branch-manager/departments");
            setDepartmentsData(deptsData.departments);
            fetchBmStats();

            // Update current department view
            const updatedDept = deptsData.departments.find(d => d.id === selectedDeptId);
            if (updatedDept) {
                setCurrentDept(updatedDept);
                setShortlist(updatedDept.shortlist || []);
                setProgress({ evaluated: updatedDept.evaluated, total: updatedDept.totalToEvaluate });
            }

            if (data.stage3Shortlist) setSuccess(`All evaluations complete for ${updatedDept?.name} department! The top employees have been selected for Stage 3.`);
        } catch (e) {
            throw e; // Rethrow so EvaluationForm catches it
        }
    };

    if (loading) {
        return (
            <DashboardShell user={user} currentQuarter={currentQuarterName} title="Branch Manager Dashboard">
                <div className="flex items-center justify-center h-64">
                    <div className="flex flex-col items-center gap-4">
                        <div className="animate-spin h-10 w-10 border-4 border-[#003087] border-t-transparent rounded-full" />
                        <p className="text-[#003087] font-bold text-[16px]">Loading assignments...</p>
                    </div>
                </div>
            </DashboardShell>
        );
    }

    const isBigBranch = user?.branchType === "BIG";

    return (
        <DashboardShell user={user} currentQuarter={currentQuarterName} title="Branch Manager Evaluation">
            {/* Profile Card */}
            {user && (
                <UserProfileCard
                    user={user}
                    extraInfo={{
                        label: user.branchName ? `Branch: ${user.branchName}` : "Evaluating",
                        value: user.branchName
                            ? `${user.branchType || "STANDARD"} branch — ${isMultiDept ? `${departmentsData.length} departments` : (currentDept?.name || "")}`
                            : isMultiDept ? `${departmentsData.length} departments` : (currentDept?.name || ""),
                        color: "text-[#00843D]"
                    }}
                />
            )}

            {/* Branch Stats Panel */}
            {bmStats && (
                <div className="bg-white border border-[#E0E0E0] rounded-xl p-4 sm:p-5 mb-6 shadow-sm">
                    <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                        <div>
                            <h2 className="text-[16px] sm:text-[18px] font-bold text-[#003087]">Branch Overview · {bmStats.branchName}</h2>
                            <p className="text-[12px] text-[#666666] font-medium">{bmStats.branchType} Branch</p>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
                        <StatBox label="Total Employees" value={bmStats.totalEmployees} color="#003087" />
                        <StatBox label="Participated" value={bmStats.totalParticipated} color="#00843D" />
                        <StatBox label="Stage 1 Shortlist" value={bmStats.stage1.shortlisted} color="#F7941D" />
                        <StatBox label="Stage 2 Completed" value={bmStats.stage2.evaluationsCompleted} color="#6A1B9A" />
                        <StatBox label="White Collar" value={bmStats.totalWhiteCollar} color="#003087" />
                        <StatBox label="Blue Collar" value={bmStats.totalBlueCollar} color="#00843D" />
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3 mt-3">
                        <StatBox label="BM Evaluated (WC)" value={bmStats.bmEvaluatedCount} color="#003087" compact />
                        <StatBox label="Total BC Evaluated" value={bmStats.stage2.totalBcEvaluated} color="#00843D" compact />
                        <StatBox label="Stage 2 Shortlist" value={bmStats.stage2.shortlisted} color="#F7941D" compact />
                    </div>
                    {bmStats.hodBreakdown && bmStats.hodBreakdown.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-[#E0E0E0]">
                            <p className="text-[12px] font-bold uppercase tracking-wider text-[#666666] mb-2">HOD Assignments & Evaluations</p>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-[12px]">
                                    <thead>
                                        <tr className="text-[10px] text-[#666666] uppercase tracking-wider">
                                            <th className="py-1.5 pr-4">HOD</th>
                                            <th className="py-1.5 pr-4">Assigned</th>
                                            <th className="py-1.5 pr-4">Evaluated</th>
                                            <th className="py-1.5 pr-4">Progress</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[#F0F0F0]">
                                        {bmStats.hodBreakdown.map(h => {
                                            const pct = h.assigned > 0 ? Math.round((h.evaluated / h.assigned) * 100) : 0;
                                            return (
                                                <tr key={h.hodUserId}>
                                                    <td className="py-2 pr-4 font-bold text-[#1A1A2E]">{h.hodName}{h.hodEmpCode ? <span className="text-[10px] text-[#666666] font-normal ml-1">({h.hodEmpCode})</span> : null}</td>
                                                    <td className="py-2 pr-4 font-bold text-[#003087]">{h.assigned}</td>
                                                    <td className="py-2 pr-4 font-bold text-[#00843D]">{h.evaluated}</td>
                                                    <td className="py-2 pr-4">
                                                        <div className="flex items-center gap-2">
                                                            <div className="flex-1 h-1.5 bg-[#F0F0F0] rounded-full overflow-hidden max-w-[100px]">
                                                                <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: pct === 100 ? "#00843D" : "#F7941D" }} />
                                                            </div>
                                                            <span className="text-[11px] font-bold text-[#666666]">{pct}%</span>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Big Branch Info Banner */}
            {isBigBranch && (
                <div className="bg-[#FFF8E1] border border-[#FFE082] rounded-xl p-5 mb-8 shadow-sm">
                    <div className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-full bg-[#F7941D]/10 flex items-center justify-center shrink-0 border border-[#FFE082]">
                            <svg className="w-5 h-5 text-[#F7941D]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <div>
                            <p className="text-[15px] font-bold text-[#333333] mb-1">Big Branch Evaluation Process</p>
                            <p className="text-[14px] text-[#666666] leading-relaxed">
                                <span className="font-bold text-[#003087]">White-collar</span> employees are evaluated by you (Branch Manager) directly.{" "}
                                <span className="font-bold text-[#00843D]">Blue-collar</span> employees require an HOD to be assigned first
                                — the HOD will handle their evaluations. Use the HOD Assignment panel below to assign HODs to departments.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* HOD Assignment Panel — BIG branches only */}
            {isBigBranch && (
                <div className="bg-white border border-[#E0E0E0] rounded-xl p-6 mb-8 shadow-sm">
                    <div className="flex items-center gap-3 mb-5">
                        <div className="w-10 h-10 rounded-full bg-[#003087]/10 flex items-center justify-center shrink-0">
                            <svg className="w-5 h-5 text-[#003087]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                        </div>
                        <div>
                            <p className="text-[13px] text-[#666666] font-bold uppercase tracking-wider">HOD Assignment</p>
                            <p className="text-[18px] font-bold text-[#333333] leading-tight">Assign Heads of Department</p>
                        </div>
                    </div>

                    {/* Current HOD assignments */}
                    {hodAssignments.length > 0 && (
                        <div className="mb-5">
                            <p className="text-[13px] text-[#666666] font-bold uppercase tracking-wider mb-2">Current Assignments</p>
                            <div className="space-y-2">
                                {hodAssignments.map((a, idx) => (
                                    <div key={idx} className="flex items-center gap-3 bg-[#F5F5F5] rounded-lg px-4 py-3 border border-[#E0E0E0]">
                                        <div className="w-8 h-8 rounded-full bg-[#00843D]/10 flex items-center justify-center text-[#00843D] font-bold text-[13px] shrink-0">
                                            {a.hodUser?.name?.charAt(0) || "H"}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[14px] font-bold text-[#333333] truncate">{a.hodUser?.name || "Unknown"} <span className="text-[#666666] font-medium">({a.hodUser?.empCode})</span></p>
                                            <p className="text-[13px] text-[#666666]">{a.department?.name || "Department"}</p>
                                        </div>
                                        <span className="text-[12px] font-bold text-[#00843D] bg-[#E8F5E9] px-2 py-1 rounded border border-[#A5D6A7] shrink-0">Active</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Assign new HOD form */}
                    <div className="bg-[#FAFAFA] rounded-lg p-4 border border-[#E0E0E0]">
                        <p className="text-[14px] font-bold text-[#333333] mb-3">Assign New HOD</p>
                        <div className="flex flex-col sm:flex-row gap-3">
                            <div className="flex-1">
                                <label className="text-[12px] text-[#666666] font-bold uppercase tracking-wider block mb-1">Department</label>
                                <div className="relative">
                                    <select
                                        value={hodDeptId}
                                        onChange={(e) => setHodDeptId(e.target.value)}
                                        className="w-full px-3 py-2.5 bg-white border border-[#E0E0E0] rounded-lg text-[14px] text-[#333333] font-medium focus:outline-none focus:ring-2 focus:ring-[#003087] appearance-none cursor-pointer"
                                    >
                                        <option value="">Select department...</option>
                                        {departmentsData.map(dept => (
                                            <option key={dept.id} value={dept.id}>{dept.name}</option>
                                        ))}
                                    </select>
                                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-[#666666]">
                                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                                        </svg>
                                    </div>
                                </div>
                            </div>
                            <div className="flex-1">
                                <label className="text-[12px] text-[#666666] font-bold uppercase tracking-wider block mb-1">Search HOD (Emp Code, Name, Department)</label>
                                <input
                                    type="text"
                                    value={hodSearchQuery}
                                    onChange={(e) => { setHodSearchQuery(e.target.value); setHodSelected(null); }}
                                    placeholder="Type employee code, name, or department..."
                                    className="w-full px-3 py-2.5 bg-white border border-[#E0E0E0] rounded-lg text-[14px] text-[#333333] font-medium focus:outline-none focus:ring-2 focus:ring-[#003087] placeholder:text-[#AAAAAA]"
                                />
                            </div>
                            <div className="flex items-end">
                                <button
                                    onClick={handleAssignHod}
                                    disabled={hodLoading || !hodSelected || !hodDeptId}
                                    className="min-h-[44px] px-6 py-2.5 bg-[#003087] text-white rounded-lg hover:bg-[#00843D] transition-colors cursor-pointer font-bold text-[14px] shadow disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                                >
                                    {hodLoading ? "Assigning..." : "Assign HOD"}
                                </button>
                            </div>
                        </div>

                        {/* Search results */}
                        {hodSearchQuery && !hodSelected && (
                            <div className="mt-3 bg-white border border-[#E0E0E0] rounded-lg max-h-64 overflow-y-auto">
                                {hodSearching && <p className="text-[13px] text-[#666666] p-3">Searching...</p>}
                                {!hodSearching && hodCandidates.length === 0 && (
                                    <p className="text-[13px] text-[#666666] p-3">No matching employees in your branch.</p>
                                )}
                                {!hodSearching && hodCandidates.map((c) => (
                                    <button
                                        key={c.id}
                                        type="button"
                                        onClick={() => { setHodSelected(c); setHodSearchQuery(`${c.name} (${c.empCode})`); }}
                                        className="w-full text-left px-4 py-2.5 border-b border-[#F0F0F0] last:border-b-0 hover:bg-[#F5F7FA] cursor-pointer"
                                    >
                                        <p className="text-[14px] font-bold text-[#333333]">{c.name} <span className="text-[#666666] font-medium">({c.empCode})</span></p>
                                        <p className="text-[12px] text-[#666666]">
                                            {c.designation ? `${c.designation} · ` : ""}{c.departmentName}
                                            {c.departmentCollar && <span className="ml-2 text-[11px] font-bold text-[#003087]">[{c.departmentCollar === "WHITE_COLLAR" ? "WC" : "BC"}]</span>}
                                        </p>
                                    </button>
                                ))}
                            </div>
                        )}

                        {hodSelected && (
                            <div className="mt-3 bg-[#E8F5E9] border border-[#A5D6A7] rounded-lg px-4 py-2.5 flex items-center justify-between">
                                <div>
                                    <p className="text-[13px] font-bold text-[#1B5E20]">Selected: {hodSelected.name} ({hodSelected.empCode})</p>
                                    <p className="text-[12px] text-[#2E7D32]">{hodSelected.departmentName}</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => { setHodSelected(null); setHodSearchQuery(""); }}
                                    className="text-[12px] text-[#1B5E20] font-bold underline cursor-pointer"
                                >
                                    Clear
                                </button>
                            </div>
                        )}

                        <p className="text-[12px] text-[#999999] mt-2">
                            Search for any employee in your branch by employee code, name, or department. Blue-collar employees in the selected department will be evaluated by the chosen HOD.
                        </p>
                        {hodError && <p className="text-[13px] text-[#D32F2F] font-bold mt-2">{hodError}</p>}
                        {hodSuccess && <p className="text-[13px] text-[#2E7D32] font-bold mt-2">{hodSuccess}</p>}
                    </div>
                </div>
            )}

            {/* Department Selector — shown only if BM has multiple departments */}
            {isMultiDept && (
                <div className="bg-[#E8F5E9] border border-[#A5D6A7] rounded-xl p-5 mb-8 shadow-sm">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center border border-[#A5D6A7] shrink-0 text-[#00843D] shadow-sm">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                            </div>
                            <div>
                                <p className="text-[13px] text-[#2E7D32] font-bold uppercase tracking-wider mb-0.5">Multi-Department Branch Manager</p>
                                <p className="text-[20px] font-black text-[#1B5E20] leading-tight">Assigned to {departmentsData.length} Departments</p>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-lg p-3 border border-[#A5D6A7] flex flex-col sm:flex-row items-center gap-3">
                        <label className="text-[14px] font-bold text-[#1B5E20] uppercase tracking-wider whitespace-nowrap">Select Department:</label>
                        <div className="relative w-full">
                            <select
                                value={selectedDeptId}
                                onChange={(e) => handleSelectDept(e.target.value)}
                                className="w-full px-4 py-2 bg-[#F1F8E9] border border-[#A5D6A7] rounded-lg text-[#1A1A2E] font-bold focus:outline-none focus:ring-2 focus:ring-[#00843D] appearance-none cursor-pointer"
                            >
                                {departmentsData.map(dept => (
                                    <option key={dept.id} value={dept.id}>
                                        {dept.name} — {dept.completed ? "Completed" : `${dept.evaluated}/${dept.totalToEvaluate} Evaluated`}
                                    </option>
                                ))}
                            </select>
                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-[#1B5E20]">
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                                </svg>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="bg-white border border-[#E0E0E0] rounded-xl p-6 mb-8 shadow-sm">
                <div className="flex justify-between items-end mb-3">
                    <div>
                        <span className="text-[14px] text-[#666666] font-bold uppercase tracking-wider block mb-1">
                            {isMultiDept ? `${currentDept?.name} — ` : ''}Evaluation Progress
                        </span>
                        <span className="text-[15px] font-medium text-[#333333]">{progress.evaluated} of {progress.total} employees evaluated{isMultiDept ? ' in this department' : ''}</span>
                    </div>
                    <span className="text-[24px] font-black text-[#003087] leading-none">{progress.evaluated}/{progress.total}</span>
                </div>
                <div className="w-full bg-[#F5F5F5] rounded-full h-3 border border-[#E0E0E0] overflow-hidden">
                    <div className="bg-[#00843D] h-full rounded-full transition-all duration-700 relative" style={{ width: `${progress.total > 0 ? (progress.evaluated / progress.total) * 100 : 0}%` }}>
                        <div className="absolute inset-0 bg-white/20 w-full" style={{ backgroundImage: 'linear-gradient(45deg, rgba(255,255,255,0.15) 25%, transparent 25%, transparent 50%, rgba(255,255,255,0.15) 50%, rgba(255,255,255,0.15) 75%, transparent 75%, transparent)', backgroundSize: '1rem 1rem' }}></div>
                    </div>
                </div>
            </div>

            {departmentsData.length === 0 && !error && (
                <div className="bg-white border-2 border-[#E0E0E0] border-dashed rounded-2xl p-12 text-center shadow-sm mb-8">
                    <span className="text-5xl block mb-4 opacity-50">🔒</span>
                    <h3 className="text-[20px] font-bold text-[#333333] mb-2">No Departments Assigned</h3>
                    <p className="text-[#666666] text-[16px] max-w-md mx-auto">You are not assigned to any department for evaluation. Please contact the Admin to get department assignments.</p>
                </div>
            )}

            {error && <div className="mb-6 p-4 bg-[#FFEBEE] border-l-4 border-[#D32F2F] rounded-r-lg text-[#D32F2F] text-[15px] font-bold shadow-sm">{error}</div>}
            {success && <div className="mb-6 p-5 bg-[#E8F5E9] border-l-4 border-[#00843D] rounded-r-lg text-[#1B5E20] text-[15px] font-bold shadow-sm flex gap-3 items-center">
                <svg className="w-6 h-6 text-[#00843D] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                {success}
            </div>}

            {selectedEmployee ? (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
                    <button onClick={() => setSelectedEmployee(null)} className="min-h-[44px] min-w-[80px] px-4 py-2 text-[14px] font-bold text-[#003087] bg-white border border-[#003087] rounded-lg hover:bg-[#003087] hover:text-white transition-all mb-6 flex items-center gap-2 cursor-pointer shadow-sm">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                        Back to Employee List
                    </button>

                    <div className="bg-[#E3F2FD] border border-[#90CAF9] rounded-xl p-6 mb-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                            <p className="text-[13px] text-[#003087]/80 font-bold uppercase tracking-wider mb-1">Currently Evaluating{isMultiDept ? ` in ${currentDept?.name}` : ''}</p>
                            <p className="text-[#003087] font-black text-[22px] leading-tight">{selectedEmployee.name}</p>
                        </div>
                    </div>

                    <EvaluationForm
                        questions={questions}
                        onSubmit={handleEvaluate}
                        submitLabel={`Submit Evaluation for ${selectedEmployee.name.split(' ')[0]}`}
                        draftKey={user?.id && selectedDeptId ? `draft_eval_${user.id}_${selectedEmployee.userId}_${selectedDeptId}` : null}
                    />
                </div>
            ) : (
                <div className="space-y-4">
                    <div className="flex items-center justify-between mb-4">
                        <p className="text-[#1A1A2E] font-bold text-[18px]">
                            {isMultiDept ? `Employees to Evaluate (${currentDept?.name})` : 'Shortlisted Employees'}
                        </p>
                        <span className="text-[13px] text-[#666666] font-medium bg-[#F5F5F5] px-3 py-1 rounded-full border border-[#E0E0E0] hidden sm:block">Blind evaluation — previous scores hidden</span>
                    </div>

                    {shortlist.length === 0 ? (
                        <div className="bg-white border-2 border-[#E0E0E0] border-dashed rounded-2xl p-12 text-center shadow-sm">
                            <span className="text-5xl block mb-4 opacity-50">📋</span>
                            <h3 className="text-[20px] font-bold text-[#333333] mb-2">No Evaluations Pending</h3>
                            <p className="text-[#666666] text-[16px] max-w-md mx-auto">There are no employees waiting for your evaluation at this time{isMultiDept ? ` in ${currentDept?.name}` : ''}. This may be because Stage 2 has not concluded yet.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-4">
                            {shortlist.map((entry) => (
                                <div key={entry.userId} className={`bg-white border-2 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all duration-200 ${entry.alreadyEvaluated ? "border-[#A5D6A7] bg-[#F1F8E9] shadow-sm opacity-80 zoom-in-95" : "border-[#E0E0E0] shadow-sm hover:border-[#003087]/50 hover:shadow-md"}`}>
                                    <div className="flex items-center gap-5">
                                        <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-[16px] shrink-0 border-2 ${entry.alreadyEvaluated ? "bg-[#E8F5E9] text-[#2E7D32] border-[#A5D6A7]" : "bg-[#F5F5F5] text-[#333333] border-[#CCCCCC]"}`}>
                                            {entry.name.charAt(0)}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2 mb-1">
                                                <p className="text-[18px] font-bold text-[#003087] leading-tight">{entry.name}</p>
                                                {entry.collarType && (
                                                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${entry.collarType === "WHITE_COLLAR" ? "bg-[#F5F5F5] text-[#666666] border-[#E0E0E0]" : "bg-[#E3F2FD] text-[#003087] border-[#90CAF9]"}`}>
                                                        {entry.collarType === "WHITE_COLLAR" ? "White Collar" : "Blue Collar"}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-[#666666] text-[14px] font-medium">{entry.designation} | {entry.empCode}</p>
                                        </div>
                                    </div>
                                    <div className="mt-3 sm:mt-0">
                                        {entry.alreadyEvaluated ? (
                                            <div className="flex flex-col items-end gap-1">
                                                <span className="min-h-[44px] text-[14px] px-6 py-2.5 rounded-lg bg-white text-[#2E7D32] border border-[#A5D6A7] font-bold shadow-sm flex items-center gap-2 justify-center w-full sm:w-auto">
                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                                    Done
                                                </span>
                                                {entry.mySubmittedScore != null && (
                                                    <span className="text-[12px] font-bold text-[#2E7D32] mt-1">
                                                        Your score: {Number(entry.mySubmittedScore).toFixed(2)}
                                                    </span>
                                                )}
                                            </div>
                                        ) : (
                                            <button onClick={() => setSelectedEmployee(entry)} className="min-h-[44px] min-w-[120px] text-[15px] px-6 py-3 bg-[#003087] text-white rounded-lg hover:bg-[#00843D] transition-colors cursor-pointer font-bold shadow flex items-center gap-2 justify-center w-full sm:w-auto">
                                                Evaluate
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </DashboardShell>
    );
}
