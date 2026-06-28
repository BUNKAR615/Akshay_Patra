"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import DashboardShell from "../../../components/DashboardShell";
import EvaluationForm from "../../../components/EvaluationForm";
import UserProfileCard from "../../../components/UserProfileCard";
import { Tabs, Badge, Btn, Drawer, SearchInput, EmptyState, Avatar, ProgressBar, useToast } from "../../../components/ui";
import { filterQuestionsByCollar, effectiveCollar } from "../../../lib/questionCollar";

async function api(url, opts) {
    const res = await fetch(url, opts);
    const json = await res.json();
    if (!res.ok) {
        if (res.status === 401) {
            window.location.replace("/login");
            return new Promise(() => { });
        }
        throw new Error(json.message || "Something went wrong. Please try again in a moment.");
    }
    if (!json.success) throw new Error(json.message || "Something went wrong. Please try again in a moment.");
    return json.data;
}

// Fisher-Yates shuffle — returns a new array. Used to give each evaluated
// employee a different question order without persisting the sequence.
function shuffle(arr) {
    const a = [...(arr || [])];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

// ── Shared status vocabulary (spec §7 — keep it to four elegant colors) ──
//   Assigned → green · Pending → orange · HOD → blue · Not eligible → grey
function CollarBadge({ collar }) {
    if (!collar) return null;
    return collar === "WHITE_COLLAR"
        ? <Badge label="White Collar" color="blue" />
        : <Badge label="Blue Collar" color="sky" />;
}

/** Compact KPI tile used across the overview + delegation summary rows. */
function SummaryTile({ label, value, color, accent }) {
    return (
        <div
            className="relative overflow-hidden bg-white border border-ap-border rounded-card px-4 py-3 shadow-card"
            style={accent ? { borderColor: `${color}40`, background: `${color}0A` } : undefined}
        >
            {accent && <div className="absolute left-0 top-0 bottom-0 w-1" style={{ background: color }} />}
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 leading-tight">{label}</p>
            <p className="text-[24px] sm:text-[27px] font-black mt-1 leading-none tabular-nums" style={{ color }}>
                {value != null ? value : "—"}
            </p>
        </div>
    );
}

function StatBox({ label, value, color, compact }) {
    return (
        <div className="border border-ap-border rounded-lg bg-[#FAFCFF] px-3 py-2.5 text-center">
            <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-gray-500 leading-tight">{label}</p>
            <p className={`${compact ? "text-[18px]" : "text-[22px]"} font-black mt-1`} style={{ color }}>
                {value != null ? value : "—"}
            </p>
        </div>
    );
}

const drawerApi = async (url, opts) => {
    const res = await fetch(url, opts);
    const json = await res.json();
    if (!res.ok || !json.success) throw new Error(json.message || "Request failed");
    return json.data;
};

/**
 * ManageEmployeesDrawer — assign blue-collar employees to an HOD.
 * Workflow (spec §5): pick a department → see its Stage-1-cleared blue-collar
 * employees → multi-select with checkboxes → Assign. A compact search filters
 * the loaded department list by name/code. Employees already under another HOD
 * show that, and the API enforces the "one HOD per BC at a time" rule.
 * All network calls are identical to the previous inline panel.
 */
function ManageEmployeesDrawer({ open, hodUserId, hodName, onClose, onChanged }) {
    const toast = useToast();
    const [bcDepts, setBcDepts] = useState([]);
    const [bcDeptsLoading, setBcDeptsLoading] = useState(false);
    const [openDeptId, setOpenDeptId] = useState("");
    const [deptEmployees, setDeptEmployees] = useState([]);
    const [deptEmployeesLoading, setDeptEmployeesLoading] = useState(false);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [currentEmployees, setCurrentEmployees] = useState([]);
    const [currentLoading, setCurrentLoading] = useState(false);
    const [search, setSearch] = useState("");
    const [busy, setBusy] = useState(false);

    const loadBcDepts = useCallback(async () => {
        setBcDeptsLoading(true);
        try {
            const data = await drawerApi("/api/branch-manager/hod/blue-collar-pool");
            setBcDepts(data.departments || []);
        } catch (e) {
            toast.error(e.message);
        } finally {
            setBcDeptsLoading(false);
        }
    }, [toast]);

    const loadCurrentEmployees = useCallback(async () => {
        setCurrentLoading(true);
        try {
            const data = await drawerApi(`/api/branch-manager/hod/employees?hodUserId=${encodeURIComponent(hodUserId)}`);
            setCurrentEmployees(data.employees || []);
        } catch (e) {
            toast.error(e.message);
        } finally {
            setCurrentLoading(false);
        }
    }, [hodUserId, toast]);

    const loadDeptEmployees = useCallback(async (deptId) => {
        setDeptEmployeesLoading(true);
        setSelectedIds(new Set());
        try {
            const data = await drawerApi(`/api/branch-manager/hod/blue-collar-pool?departmentId=${encodeURIComponent(deptId)}`);
            setDeptEmployees(data.employees || []);
        } catch (e) {
            toast.error(e.message);
            setDeptEmployees([]);
        } finally {
            setDeptEmployeesLoading(false);
        }
    }, [toast]);

    // Lazy load — only when the drawer opens (avoids duplicate queries while closed).
    useEffect(() => {
        if (!open) return;
        setOpenDeptId("");
        setDeptEmployees([]);
        setSearch("");
        loadBcDepts();
        loadCurrentEmployees();
    }, [open, loadBcDepts, loadCurrentEmployees]);

    const handleToggle = (id) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const handleAssignSelected = async () => {
        const ids = Array.from(selectedIds);
        if (ids.length === 0) return;
        const collisions = deptEmployees.filter(e =>
            ids.includes(e.id) && e.currentHod && e.currentHod.id !== hodUserId
        );
        if (collisions.length > 0) {
            const names = collisions.map(e => `${e.name} (currently under ${e.currentHod.name})`).join("\n");
            if (!window.confirm(`Reassign these employees to ${hodName}?\n\n${names}`)) return;
        }
        setBusy(true);
        try {
            const data = await drawerApi("/api/branch-manager/hod/employees", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ hodUserId, employeeIds: ids }),
            });
            toast.success(data?.message || "Assigned.");
            setSelectedIds(new Set());
            await Promise.all([
                openDeptId ? loadDeptEmployees(openDeptId) : Promise.resolve(),
                loadCurrentEmployees(),
            ]);
            if (typeof onChanged === "function") onChanged();
        } catch (e) {
            toast.error(e.message);
        } finally {
            setBusy(false);
        }
    };

    const handleUnassign = async (employeeId, employeeName) => {
        if (!window.confirm(`Return ${employeeName} to the Branch Manager's evaluation queue?`)) return;
        setBusy(true);
        try {
            const data = await drawerApi("/api/branch-manager/hod/employees", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ employeeId }),
            });
            toast.success(data?.message || "Removed.");
            await Promise.all([
                openDeptId ? loadDeptEmployees(openDeptId) : Promise.resolve(),
                loadCurrentEmployees(),
            ]);
            if (typeof onChanged === "function") onChanged();
        } catch (e) {
            toast.error(e.message);
        } finally {
            setBusy(false);
        }
    };

    const visibleDeptEmployees = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return deptEmployees;
        return deptEmployees.filter(e =>
            e.name.toLowerCase().includes(q) || (e.empCode || "").toLowerCase().includes(q)
        );
    }, [deptEmployees, search]);

    return (
        <Drawer
            open={open}
            onClose={onClose}
            title={`Manage Employees · ${hodName}`}
            width={520}
            footer={openDeptId ? (
                <div className="flex items-center gap-2">
                    <Btn variant="primary" full disabled={busy || selectedIds.size === 0} loading={busy} onClick={handleAssignSelected}>
                        {selectedIds.size === 0 ? "Select employees to assign" : `Assign ${selectedIds.size} to ${hodName.split(" ")[0]}`}
                    </Btn>
                    {selectedIds.size > 0 && (
                        <Btn variant="ghost" disabled={busy} onClick={() => setSelectedIds(new Set())}>Clear</Btn>
                    )}
                </div>
            ) : null}
        >
            {/* Currently-under-this-HOD list */}
            <section className="mb-5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">
                    Assigned to {hodName.split(" ")[0]} ({currentEmployees.length})
                </p>
                {currentLoading ? (
                    <p className="text-[12px] text-gray-500">Loading…</p>
                ) : currentEmployees.length === 0 ? (
                    <p className="text-[12px] text-gray-400 italic">None yet — pick a department below to attach blue-collar employees.</p>
                ) : (
                    <div className="flex flex-wrap gap-2">
                        {currentEmployees.map(e => (
                            <span key={e.id} className="inline-flex items-center gap-2 bg-ap-green-50 border border-ap-green/30 rounded-full pl-3 pr-1.5 py-1 text-[12px]">
                                <span className="font-bold text-ap-green-700">{e.name}</span>
                                <span className="text-ap-green-700/70">({e.empCode})</span>
                                <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => handleUnassign(e.id, e.name)}
                                    className="ml-0.5 w-5 h-5 rounded-full bg-white border border-ap-green/30 text-ap-green-700 hover:bg-red-600 hover:text-white hover:border-red-600 cursor-pointer flex items-center justify-center disabled:opacity-50"
                                    title="Remove from this HOD"
                                >
                                    ×
                                </button>
                            </span>
                        ))}
                    </div>
                )}
            </section>

            {/* Department picker */}
            <section className="mb-4">
                <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">Add from a department</p>
                {bcDeptsLoading ? (
                    <p className="text-[12px] text-gray-500">Loading departments…</p>
                ) : bcDepts.length === 0 ? (
                    <p className="text-[12px] text-gray-400 italic">No departments found in your branch.</p>
                ) : (
                    <div className="flex flex-wrap gap-2">
                        {bcDepts.map(d => (
                            <button
                                key={d.id}
                                type="button"
                                onClick={() => { setOpenDeptId(d.id); setSearch(""); loadDeptEmployees(d.id); }}
                                className={`min-h-[34px] px-3 py-1.5 text-[12px] font-bold rounded-lg border transition-colors cursor-pointer ${
                                    openDeptId === d.id
                                        ? "bg-ap-blue text-white border-ap-blue"
                                        : "bg-white text-ap-blue border-ap-blue/30 hover:bg-ap-blue hover:text-white"
                                }`}
                            >
                                {d.name} <span className="font-normal opacity-80">({d.employeeCount})</span>
                            </button>
                        ))}
                    </div>
                )}
            </section>

            {/* Per-dept employee picker */}
            {openDeptId && (
                <section className="border border-ap-border rounded-xl bg-[#FAFAFA] p-3">
                    <div className="mb-3">
                        <SearchInput value={search} onChange={setSearch} delay={150} placeholder="Filter by name or code…" />
                    </div>
                    {deptEmployeesLoading ? (
                        <p className="text-[12px] text-gray-500">Loading employees…</p>
                    ) : visibleDeptEmployees.length === 0 ? (
                        <p className="text-[12px] text-gray-400 italic">
                            {deptEmployees.length === 0
                                ? "No blue-collar employees in this department have cleared Stage 1 yet."
                                : "No employees match your search."}
                        </p>
                    ) : (
                        <div className="space-y-1.5 max-h-[40vh] overflow-y-auto">
                            {visibleDeptEmployees.map(e => {
                                const checked = selectedIds.has(e.id);
                                const underThis = e.currentHod && e.currentHod.id === hodUserId;
                                const underOther = e.currentHod && e.currentHod.id !== hodUserId;
                                return (
                                    <label
                                        key={e.id}
                                        className={`flex items-center gap-3 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                                            checked ? "bg-ap-blue-50 border-ap-blue/40" : "bg-white border-ap-border hover:border-ap-blue/40"
                                        } ${underThis ? "opacity-70" : ""}`}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={() => handleToggle(e.id)}
                                            disabled={underThis}
                                            className="w-4 h-4 accent-ap-blue"
                                        />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[13px] font-bold text-gray-800 truncate">{e.name} <span className="text-gray-500 font-medium">({e.empCode})</span></p>
                                            {e.designation && <p className="text-[11px] text-gray-500 truncate">{e.designation}</p>}
                                        </div>
                                        {underThis && <Badge label="Already assigned" color="green" />}
                                        {underOther && (
                                            <span title={`Currently under ${e.currentHod.name}`}>
                                                <Badge label={`Under ${e.currentHod.name.split(" ")[0]}`} color="orange" />
                                            </span>
                                        )}
                                    </label>
                                );
                            })}
                        </div>
                    )}
                </section>
            )}
        </Drawer>
    );
}

/**
 * AssignedEmployeesDrawer — review the blue-collar employees under one HOD
 * (spec §6). Each row supports Remove (back to the BM queue) and Move to
 * another HOD. Both reuse the existing /hod/employees endpoint — a move is a
 * POST to the target HOD, which the unique constraint resolves as a reassign.
 */
function AssignedEmployeesDrawer({ open, hod, otherHods, onClose, onChanged }) {
    const toast = useToast();
    const [employees, setEmployees] = useState([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState("");
    const [busyId, setBusyId] = useState("");
    const [movingId, setMovingId] = useState("");

    const hodUserId = hod?.hodUserId;
    const hodName = hod?.hod?.name || "";

    const load = useCallback(async () => {
        if (!hodUserId) return;
        setLoading(true);
        try {
            const data = await drawerApi(`/api/branch-manager/hod/employees?hodUserId=${encodeURIComponent(hodUserId)}`);
            setEmployees(data.employees || []);
        } catch (e) {
            toast.error(e.message);
        } finally {
            setLoading(false);
        }
    }, [hodUserId, toast]);

    useEffect(() => {
        if (!open) return;
        setSearch("");
        setMovingId("");
        load();
    }, [open, load]);

    const handleRemove = async (employeeId, employeeName) => {
        if (!window.confirm(`Return ${employeeName} to the Branch Manager's evaluation queue?`)) return;
        setBusyId(employeeId);
        try {
            const data = await drawerApi("/api/branch-manager/hod/employees", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ employeeId }),
            });
            toast.success(data?.message || "Removed.");
            await load();
            if (typeof onChanged === "function") onChanged();
        } catch (e) {
            toast.error(e.message);
        } finally {
            setBusyId("");
        }
    };

    const handleMove = async (employeeId, employeeName, targetHodUserId) => {
        if (!targetHodUserId) return;
        const target = otherHods.find(h => h.hodUserId === targetHodUserId);
        const targetName = target?.hod?.name || "the selected HOD";
        if (!window.confirm(`Move ${employeeName} from ${hodName} to ${targetName}?`)) return;
        setBusyId(employeeId);
        try {
            const data = await drawerApi("/api/branch-manager/hod/employees", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ hodUserId: targetHodUserId, employeeIds: [employeeId] }),
            });
            toast.success(data?.message || `${employeeName} moved to ${targetName}.`);
            setMovingId("");
            await load();
            if (typeof onChanged === "function") onChanged();
        } catch (e) {
            toast.error(e.message);
        } finally {
            setBusyId("");
        }
    };

    const visible = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return employees;
        return employees.filter(e =>
            e.name.toLowerCase().includes(q) ||
            (e.empCode || "").toLowerCase().includes(q) ||
            (e.departmentName || "").toLowerCase().includes(q)
        );
    }, [employees, search]);

    return (
        <Drawer open={open} onClose={onClose} title={`Assigned to ${hodName}`} width={520}>
            <div className="mb-3">
                <SearchInput value={search} onChange={setSearch} placeholder="Search by name, code or department…" />
            </div>
            {loading ? (
                <p className="text-[12px] text-gray-500">Loading…</p>
            ) : visible.length === 0 ? (
                <EmptyState
                    icon="👥"
                    title={employees.length === 0 ? "No employees assigned yet" : "No matches"}
                    sub={employees.length === 0 ? "Use “Manage Employees” to attach blue-collar staff to this HOD." : "Try a different search."}
                />
            ) : (
                <div className="space-y-2">
                    {visible.map(e => (
                        <div key={e.id} className="border border-ap-border rounded-xl p-3 bg-white">
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex items-center gap-3 min-w-0">
                                    <Avatar name={e.name} size={36} color="#00843D" />
                                    <div className="min-w-0">
                                        <p className="text-[13px] font-bold text-gray-800 truncate">{e.name} <span className="text-gray-500 font-medium">({e.empCode})</span></p>
                                        <p className="text-[11px] text-gray-500 truncate">{e.departmentName || "—"}</p>
                                    </div>
                                </div>
                                <Badge label="Assigned" color="green" />
                            </div>
                            <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                                {movingId === e.id ? (
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <select
                                            defaultValue=""
                                            disabled={busyId === e.id}
                                            onChange={(ev) => handleMove(e.id, e.name, ev.target.value)}
                                            className="border-[1.5px] border-gray-300 focus:border-ap-blue rounded-lg px-2.5 py-1.5 text-[12px] bg-white text-gray-900 outline-none"
                                        >
                                            <option value="">Move to…</option>
                                            {otherHods.filter(h => h.hodUserId !== hodUserId).map(h => (
                                                <option key={h.hodUserId} value={h.hodUserId}>{h.hod?.name}</option>
                                            ))}
                                        </select>
                                        <Btn variant="ghost" size="sm" onClick={() => setMovingId("")}>Cancel</Btn>
                                    </div>
                                ) : (
                                    <>
                                        <Btn
                                            variant="ghost"
                                            size="sm"
                                            disabled={busyId === e.id || otherHods.filter(h => h.hodUserId !== hodUserId).length === 0}
                                            onClick={() => setMovingId(e.id)}
                                            title={otherHods.filter(h => h.hodUserId !== hodUserId).length === 0 ? "No other HODs to move to" : undefined}
                                        >
                                            Move to another HOD
                                        </Btn>
                                        <Btn variant="danger" size="sm" disabled={busyId === e.id} loading={busyId === e.id} onClick={() => handleRemove(e.id, e.name)}>
                                            Remove
                                        </Btn>
                                    </>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </Drawer>
    );
}

export default function BranchManagerDashboard() {
    // Which sidebar view is active. The role sidebar (lib/dashboardNav) routes
    // to the same page with a ?view= param; "Evaluation" carries no param so the
    // bare /dashboard/branch-manager landing defaults here.
    const router = useRouter();
    const searchParams = useSearchParams();
    const toast = useToast();
    const activeView = searchParams.get("view") || "evaluate";

    // In-page tab strip mirrors the sidebar's ?view= URLs (same shapes the
    // nav config uses) so views are reachable without opening the sidebar.
    const switchView = (id) => {
        router.replace(`/dashboard/branch-manager${id === "evaluate" ? "" : `?view=${id}`}`, { scroll: false });
    };

    const [user, setUser] = useState(null);
    const [currentQuarterName, setCurrentQuarterName] = useState("");
    const [branch, setBranch] = useState(null);
    const [departments, setDepartments] = useState([]);

    // Branch-wide Stage 2 queue
    const [shortlist, setShortlist] = useState([]);
    const [shortlistMeta, setShortlistMeta] = useState({ totalShortlisted: 0, evaluatedCount: 0, remainingCount: 0 });
    const [questions, setQuestions] = useState([]);
    const [selectedEmployee, setSelectedEmployee] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // Evaluate-view filters (client-side over the already-fetched shortlist).
    const [evalSearch, setEvalSearch] = useState("");
    const [evalStatus, setEvalStatus] = useState("all"); // all | pending | done
    const [evalCollar, setEvalCollar] = useState("all"); // all | WHITE_COLLAR | BLUE_COLLAR

    // Show only the questions applicable to the selected employee's category
    // (shared + own-collar), then re-shuffle whenever the evaluator opens a
    // different employee — so the sequence is random per employee, not fixed
    // for all. The evaluate route re-applies the same collar filter.
    const shuffledQuestions = useMemo(
        () => shuffle(filterQuestionsByCollar(questions, effectiveCollar(selectedEmployee?.collarType))),
        [questions, selectedEmployee?.userId, selectedEmployee?.collarType]
    );
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    // HOD assignment state (BIG branches only)
    const [hodAssignments, setHodAssignments] = useState([]);
    const [hodDeptId, setHodDeptId] = useState("");
    const [hodSearchQuery, setHodSearchQuery] = useState("");
    const [hodCandidates, setHodCandidates] = useState([]);
    const [hodSelected, setHodSelected] = useState(null);
    const [hodSearching, setHodSearching] = useState(false);
    const [hodLoading, setHodLoading] = useState(false);
    const [removingHodId, setRemovingHodId] = useState("");
    // Drawer state — which HOD (assignment object) each drawer is showing.
    const [manageHod, setManageHod] = useState(null);
    const [viewHod, setViewHod] = useState(null);

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
            console.error("Failed to fetch HOD assignments:", e.message);
        }
    };

    const fetchShortlist = async () => {
        try {
            const data = await api("/api/branch-manager/shortlist");
            setShortlist(data.employees || []);
            setShortlistMeta({
                totalShortlisted: data.totalShortlisted || 0,
                evaluatedCount: data.evaluatedCount || 0,
                remainingCount: data.remainingCount || 0,
            });
            if (data.branch) setBranch(data.branch);
        } catch (e) {
            setError(e.message);
        }
    };

    const fetchData = async () => {
        try {
            const [meData, deptsData, qData] = await Promise.all([
                api("/api/auth/me"),
                api("/api/branch-manager/departments"),
                api("/api/branch-manager/questions"),
            ]);
            setUser(meData.user);
            setCurrentQuarterName(meData.currentQuarter || deptsData.quarter?.name || "");
            setBranch(deptsData.branch);
            setDepartments(deptsData.departments || []);
            setQuestions(qData.questions);

            if (deptsData.branch?.branchType === "BIG") {
                fetchHodAssignments();
            }
            await Promise.all([fetchShortlist(), fetchBmStats()]);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, []);

    // Live refresh — reruns the aggregator queries without touching the initial
    // one-time fetches (auth/me, questions, departments). Triggered by the
    // Refresh button + when the tab regains focus.
    const refreshLive = useCallback(async () => {
        setRefreshing(true);
        try {
            const tasks = [fetchShortlist(), fetchBmStats()];
            if ((branch?.branchType || user?.branchType) === "BIG") {
                tasks.push(fetchHodAssignments());
            }
            await Promise.all(tasks);
        } finally {
            setRefreshing(false);
        }
    }, [branch?.branchType, user?.branchType]);

    useEffect(() => {
        const onFocus = () => refreshLive();
        const onVisible = () => {
            if (document.visibilityState === "visible") refreshLive();
        };
        window.addEventListener("focus", onFocus);
        document.addEventListener("visibilitychange", onVisible);
        return () => {
            window.removeEventListener("focus", onFocus);
            document.removeEventListener("visibilitychange", onVisible);
        };
    }, [refreshLive]);

    // HOD candidate lookup. Two modes that work together:
    //   - a department is picked  → browse/filter white-collar employees in it
    //   - a search query is typed → find white-collar employees by emp code or
    //     name across the WHOLE branch, even before a department is picked
    //     (selecting a result auto-fills that employee's department below).
    // The server enforces WHITE_COLLAR from the employee's own stored category;
    // we still client-filter defensively.
    useEffect(() => {
        const q = hodSearchQuery.trim();
        if (!hodDeptId && !q) { setHodCandidates([]); return; }

        setHodSearching(true);
        const t = setTimeout(async () => {
            try {
                const params = new URLSearchParams();
                if (q) params.set("q", q);
                if (hodDeptId) params.set("departmentId", hodDeptId);
                const data = await api(`/api/branch-manager/hod/search?${params.toString()}`);
                const wcOnly = (data.candidates || []).filter(c => c.effectiveCollar === "WHITE_COLLAR");
                setHodCandidates(wcOnly);
            } catch {
                setHodCandidates([]);
            } finally {
                setHodSearching(false);
            }
        }, q ? 300 : 0);
        return () => clearTimeout(t);
    }, [hodSearchQuery, hodDeptId]);

    const handleRemoveHod = async (assignment) => {
        const hodName = assignment.hod?.name || "this HOD";
        if (!window.confirm(`Remove ${hodName} as HOD? All blue-collar employees assigned to them will return to your evaluation queue.`)) return;
        setRemovingHodId(assignment.hodUserId);
        try {
            const data = await api("/api/branch-manager/hod/remove", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ hodUserId: assignment.hodUserId }),
            });
            toast.success(data?.message || `${hodName} removed.`);
            if (manageHod?.hodUserId === assignment.hodUserId) setManageHod(null);
            if (viewHod?.hodUserId === assignment.hodUserId) setViewHod(null);
            await Promise.all([fetchHodAssignments(), fetchShortlist(), fetchBmStats()]);
        } catch (e) {
            toast.error(e.message);
        } finally {
            setRemovingHodId("");
        }
    };

    const handleAssignHod = async () => {
        if (!hodDeptId) { toast.error("Please select a department."); return; }
        if (!hodSelected) { toast.error("Please search and select an employee to assign as HOD."); return; }
        setHodLoading(true);
        try {
            await api("/api/branch-manager/hod/assign", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ hodUserId: hodSelected.id, departmentId: hodDeptId }),
            });
            toast.success(`${hodSelected.name} assigned as HOD successfully.`);
            setHodSearchQuery("");
            setHodSelected(null);
            setHodCandidates([]);
            setHodDeptId("");
            await Promise.all([fetchHodAssignments(), fetchBmStats()]);
        } catch (e) {
            toast.error(e.message);
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
            const name = selectedEmployee.name;
            setSelectedEmployee(null);
            window.scrollTo({ top: 0, behavior: "smooth" });

            await Promise.all([fetchShortlist(), fetchBmStats()]);

            if (data.stage2Generated) {
                setSuccess("All Stage 2 evaluations complete for your branch. The top-ranked employees have been shortlisted — Cluster Manager will evaluate next.");
            } else {
                setSuccess(`Evaluation submitted for ${name}`);
            }
        } catch (e) {
            throw e; // Rethrow so EvaluationForm catches it
        }
    };

    // HOD nomination shows ALL departments (departments are not collar-tagged).
    const hodDepartments = departments || [];

    // Unique HOD assignments keyed by hodUserId, with the departments each HOD
    // leads collapsed into one row. Derived once for both the cards and the
    // "move to another HOD" picker.
    const uniqueHods = useMemo(() => {
        const map = new Map();
        for (const a of hodAssignments) {
            if (!map.has(a.hodUserId)) {
                map.set(a.hodUserId, { ...a, departments: [] });
            }
            if (a.department?.name) map.get(a.hodUserId).departments.push(a.department.name);
        }
        return Array.from(map.values());
    }, [hodAssignments]);

    // Per-HOD assigned/evaluated counts from the stats breakdown.
    const hodStatsById = useMemo(() => {
        const m = new Map();
        for (const h of (bmStats?.hodBreakdown || [])) m.set(h.hodUserId, h);
        return m;
    }, [bmStats]);

    // Group the branch-wide shortlist by department for the Evaluate tab render,
    // applying the compact search/status/collar filters first.
    const filteredShortlist = useMemo(() => {
        const q = evalSearch.trim().toLowerCase();
        return shortlist.filter((row) => {
            if (evalStatus === "pending" && row.alreadyEvaluated) return false;
            if (evalStatus === "done" && !row.alreadyEvaluated) return false;
            if (evalCollar !== "all" && row.collarType !== evalCollar) return false;
            if (q) {
                const hay = `${row.name} ${row.empCode || ""} ${row.designation || ""} ${row.department?.name || ""}`.toLowerCase();
                if (!hay.includes(q)) return false;
            }
            return true;
        });
    }, [shortlist, evalSearch, evalStatus, evalCollar]);

    const groupedShortlist = useMemo(() => {
        const groups = new Map();
        for (const row of filteredShortlist) {
            const key = row.department?.id || "__no_dept__";
            if (!groups.has(key)) {
                groups.set(key, { id: key, name: row.department?.name || "Unassigned", rows: [] });
            }
            groups.get(key).rows.push(row);
        }
        return Array.from(groups.values()).sort((a, b) => a.name.localeCompare(b.name));
    }, [filteredShortlist]);

    // History view — the Stage 2 employees this BM has already evaluated this
    // quarter, grouped by department. Derived entirely from the shortlist data.
    const groupedHistory = useMemo(() => {
        const groups = new Map();
        for (const row of shortlist) {
            if (!row.alreadyEvaluated) continue;
            const key = row.department?.id || "__no_dept__";
            if (!groups.has(key)) {
                groups.set(key, { id: key, name: row.department?.name || "Unassigned", rows: [] });
            }
            groups.get(key).rows.push(row);
        }
        return Array.from(groups.values()).sort((a, b) => a.name.localeCompare(b.name));
    }, [shortlist]);

    if (loading) {
        return (
            <DashboardShell user={user} currentQuarter={currentQuarterName} title="Branch Manager Dashboard">
                <div className="flex items-center justify-center h-64">
                    <div className="flex flex-col items-center gap-4">
                        <div className="animate-spin h-10 w-10 border-4 border-ap-blue border-t-transparent rounded-full" />
                        <p className="text-ap-blue font-bold text-[16px]">Loading assignments...</p>
                    </div>
                </div>
            </DashboardShell>
        );
    }

    const isBigBranch = (branch?.branchType || user?.branchType) === "BIG";
    const progress = { evaluated: shortlistMeta.evaluatedCount, total: shortlistMeta.totalShortlisted };

    // Per-view page title (the sidebar routes here with ?view=).
    const pageTitle = {
        evaluate: "Stage 2 Evaluation",
        shortlist: "Branch Overview",
        departments: isBigBranch ? "Delegate to HODs" : "Departments",
        history: "Evaluation History",
    }[activeView] || "Branch Manager Evaluation";

    // Delegation summary (spec §2) — derived from stats + HOD assignments.
    const bcQualified = bmStats?.stage1?.shortlistedBlue ?? 0;
    const bcAssigned = (bmStats?.hodBreakdown || []).reduce((sum, h) => sum + (h.assigned || 0), 0);
    const bcPending = Math.max(0, bcQualified - bcAssigned);
    const hodCount = uniqueHods.length;

    // Always-visible "Command Center" ribbon — key counts from data in state.
    const ribbonTiles = bmStats ? [
        { label: "Stage 1 Cleared", value: bmStats.stage1?.shortlisted, color: "#003087" },
        { label: "Awaiting Your Action", value: shortlistMeta.remainingCount, color: "#F7941D", accent: true },
        { label: isBigBranch ? "You Evaluated (WC)" : "You Evaluated", value: bmStats.bmEvaluatedCount, color: "#00843D" },
        { label: "HODs Evaluated (BC)", value: bmStats.stage2?.totalBcEvaluated, color: "#6A1B9A" },
    ] : [];

    return (
        <DashboardShell user={user} currentQuarter={currentQuarterName} title={pageTitle}>
            {/* Profile Card */}
            {user && (
                <UserProfileCard
                    user={user}
                    extraInfo={{
                        label: branch?.name ? `Branch: ${branch.name}` : (user.branchName ? `Branch: ${user.branchName}` : "Evaluating"),
                        value: `${branch?.branchType || user.branchType || "STANDARD"} branch — ${departments.length} department${departments.length === 1 ? "" : "s"}`,
                        color: "text-ap-green"
                    }}
                />
            )}

            {/* ═══════ COMMAND CENTER RIBBON ═══════ */}
            {ribbonTiles.length > 0 && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 mb-6">
                    {ribbonTiles.map((t) => (
                        <SummaryTile key={t.label} label={t.label} value={t.value} color={t.color} accent={t.accent} />
                    ))}
                </div>
            )}

            {/* In-page view switcher (mirrors sidebar ?view= links) */}
            <Tabs
                ariaLabel="Branch manager views"
                tabs={[
                    { id: "evaluate", label: "Evaluation", count: shortlistMeta.remainingCount ?? undefined },
                    { id: "shortlist", label: "Branch Overview" },
                    { id: "departments", label: isBigBranch ? "Delegate to HODs" : "Departments" },
                    { id: "history", label: "History" },
                ]}
                active={activeView}
                onChange={switchView}
            />

            {/* ═══════ BRANCH OVERVIEW (Shortlist view) ═══════ */}
            {activeView === "shortlist" && bmStats && (
                <div className="bg-white border border-ap-border rounded-card p-4 sm:p-5 mb-6 shadow-card">
                    <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                        <div>
                            <h2 className="text-[16px] sm:text-[18px] font-bold text-ap-blue">Branch Overview · {bmStats.branchName}</h2>
                            <p className="text-[12px] text-gray-500 font-medium">{bmStats.branchType} Branch</p>
                        </div>
                        <Btn variant="ghost" size="sm" onClick={refreshLive} disabled={refreshing} loading={refreshing}
                            icon={!refreshing && (
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                            )}>
                            {refreshing ? "Refreshing…" : "Refresh"}
                        </Btn>
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
                        <StatBox label={isBigBranch ? "BM Evaluated (WC)" : "BM Evaluated"} value={bmStats.bmEvaluatedCount} color="#003087" compact />
                        <StatBox label="HOD Evaluated (BC)" value={bmStats.stage2.totalBcEvaluated} color="#00843D" compact />
                        <StatBox label="Stage 2 Shortlist" value={bmStats.stage2.shortlisted} color="#F7941D" compact />
                    </div>
                    {bmStats.hodBreakdown && bmStats.hodBreakdown.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-ap-border">
                            <p className="text-[12px] font-bold uppercase tracking-wider text-gray-500 mb-2">HOD Assignments & Evaluations</p>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-[12px]">
                                    <thead>
                                        <tr className="text-[10px] text-gray-500 uppercase tracking-wider">
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
                                                    <td className="py-2 pr-4 font-bold text-gray-800">{h.hodName}{h.hodEmpCode ? <span className="text-[10px] text-gray-500 font-normal ml-1">({h.hodEmpCode})</span> : null}</td>
                                                    <td className="py-2 pr-4 font-bold text-ap-blue">{h.assigned}</td>
                                                    <td className="py-2 pr-4 font-bold text-ap-green">{h.evaluated}</td>
                                                    <td className="py-2 pr-4">
                                                        <div className="flex items-center gap-2">
                                                            <div className="flex-1 max-w-[100px]"><ProgressBar value={pct} color={pct === 100 ? "#00843D" : "#F7941D"} /></div>
                                                            <span className="text-[11px] font-bold text-gray-500">{pct}%</span>
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

            {/* ═══════ DELEGATE TO HODs (BIG branches) ═══════ */}
            {activeView === "departments" && isBigBranch && (
                <div className="space-y-6 mb-8">
                    {/* Delegation summary cards */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
                        <SummaryTile label="White-collar Qualified" value={bmStats?.stage1?.shortlistedWhite} color="#003087" />
                        <SummaryTile label="Current HODs" value={hodCount} color="#0369A1" />
                        <SummaryTile label="Blue-collar Assigned" value={bcAssigned} color="#00843D" />
                        <SummaryTile label="Blue-collar Pending" value={bcPending} color="#F7941D" accent={bcPending > 0} />
                    </div>

                    {/* How it works callout */}
                    <div className="bg-[#FFF8E1] border border-[#FFE082] rounded-card p-4 sm:p-5 shadow-card flex items-start gap-3">
                        <div className="w-9 h-9 rounded-full bg-ap-orange/10 flex items-center justify-center shrink-0 border border-[#FFE082]">
                            <svg className="w-5 h-5 text-ap-orange" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <p className="text-[13px] sm:text-[14px] text-gray-600 leading-relaxed">
                            <span className="font-bold text-ap-blue">White-collar</span> employees are evaluated by you directly.{" "}
                            <span className="font-bold text-ap-green">Blue-collar</span> employees are evaluated by an HOD — nominate a white-collar
                            HOD below, then use <span className="font-semibold">Manage Employees</span> to assign blue-collar staff to them.
                        </p>
                    </div>

                    {/* ── Step 1: Nominate an HOD ── */}
                    <div className="bg-white border border-ap-border rounded-card p-4 sm:p-6 shadow-card">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-8 h-8 rounded-lg bg-ap-blue text-white flex items-center justify-center font-black text-[14px] shrink-0">1</div>
                            <div>
                                <p className="text-[11px] text-gray-500 font-bold uppercase tracking-wider">Nominate</p>
                                <p className="text-[17px] font-bold text-gray-800 leading-tight">Nominate a Head of Department</p>
                            </div>
                        </div>

                        {/* Department picker — every department shown, none hidden */}
                        <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">Select a department</p>
                        <div className="flex flex-wrap gap-2 mb-4">
                            {hodDepartments.map(dept => (
                                <button
                                    key={dept.id}
                                    type="button"
                                    onClick={() => { setHodDeptId(dept.id); setHodSearchQuery(""); setHodSelected(null); }}
                                    className={`min-h-[34px] px-3 py-1.5 text-[12px] font-bold rounded-lg border transition-colors cursor-pointer ${
                                        hodDeptId === dept.id
                                            ? "bg-ap-blue text-white border-ap-blue"
                                            : "bg-white text-ap-blue border-ap-blue/30 hover:bg-ap-blue hover:text-white"
                                    }`}
                                >
                                    {dept.name}
                                </button>
                            ))}
                            {hodDepartments.length === 0 && <p className="text-[12px] text-gray-400 italic">No departments found in your branch.</p>}
                        </div>

                        {/* Search by name/code — works any time, with or without a department */}
                        <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">Or search white-collar employees by name or code</p>
                        <SearchInput
                            value={hodSearchQuery}
                            onChange={(v) => { setHodSearchQuery(v); setHodSelected(null); }}
                            delay={300}
                            placeholder="Search by employee name or code…"
                        />

                        {/* Candidate list */}
                        {(hodDeptId || hodSearchQuery.trim()) && !hodSelected && (
                            <div className="mt-3 border border-ap-border rounded-xl max-h-72 overflow-y-auto">
                                {hodSearching && <p className="text-[13px] text-gray-500 p-3">Searching…</p>}
                                {!hodSearching && hodCandidates.length === 0 && (
                                    <p className="text-[13px] text-gray-500 p-3">
                                        {hodSearchQuery.trim()
                                            ? `No white-collar employees match "${hodSearchQuery.trim()}".`
                                            : "No white-collar employees found in this department."}
                                    </p>
                                )}
                                {!hodSearching && hodCandidates.map((c) => {
                                    const alreadyHodIn = c.currentHodDepartments || [];
                                    const isAlreadyHod = alreadyHodIn.length > 0;
                                    return (
                                        <button
                                            key={c.id}
                                            type="button"
                                            onClick={() => {
                                                setHodSelected(c);
                                                if (!hodDeptId && c.departmentId) setHodDeptId(c.departmentId);
                                            }}
                                            className="w-full text-left px-4 py-2.5 border-b border-[#F0F0F0] last:border-b-0 hover:bg-[#F5F7FA] cursor-pointer"
                                        >
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <p className="text-[14px] font-bold text-gray-800">
                                                    {c.name} <span className="text-gray-500 font-medium">({c.empCode})</span>
                                                </p>
                                                {isAlreadyHod && (
                                                    <span title={`Already HOD of: ${alreadyHodIn.map(d => d.name).filter(Boolean).join(", ")}`}>
                                                        <Badge label={`Already HOD${alreadyHodIn[0]?.name ? ` · ${alreadyHodIn.map(d => d.name).filter(Boolean).join(", ")}` : ""}`} color="orange" />
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-[12px] text-gray-500">
                                                {c.designation ? `${c.designation} · ` : ""}{c.departmentName}
                                            </p>
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        {/* Selected → nominate */}
                        {hodSelected && (
                            <div className="mt-3 bg-ap-green-50 border border-ap-green/30 rounded-xl px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
                                <div className="min-w-0">
                                    <p className="text-[13px] font-bold text-ap-green-700">Selected: {hodSelected.name} ({hodSelected.empCode})</p>
                                    <p className="text-[12px] text-ap-green-700/80">{hodSelected.departmentName}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Btn variant="ghost" size="sm" onClick={() => { setHodSelected(null); setHodSearchQuery(""); }}>Clear</Btn>
                                    <Btn variant="primary" size="md" disabled={hodLoading || !hodDeptId} loading={hodLoading} onClick={handleAssignHod}>
                                        Nominate as HOD
                                    </Btn>
                                </div>
                            </div>
                        )}

                        <p className="text-[11px] text-gray-400 mt-2">Only white-collar employees can be nominated as HOD.</p>
                    </div>

                    {/* ── Step 2: HOD Management ── */}
                    <div className="bg-white border border-ap-border rounded-card p-4 sm:p-6 shadow-card">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-8 h-8 rounded-lg bg-ap-green text-white flex items-center justify-center font-black text-[14px] shrink-0">2</div>
                            <div>
                                <p className="text-[11px] text-gray-500 font-bold uppercase tracking-wider">Manage</p>
                                <p className="text-[17px] font-bold text-gray-800 leading-tight">Heads of Department ({hodCount})</p>
                            </div>
                        </div>

                        {uniqueHods.length === 0 ? (
                            <EmptyState icon="🧑‍💼" title="No HODs nominated yet" sub="Nominate a white-collar employee above to start delegating blue-collar evaluations." />
                        ) : (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                                {uniqueHods.map((a) => {
                                    const st = hodStatsById.get(a.hodUserId);
                                    const assigned = st?.assigned ?? 0;
                                    const evaluated = st?.evaluated ?? 0;
                                    const pendingEval = Math.max(0, assigned - evaluated);
                                    const isRemoving = removingHodId === a.hodUserId;
                                    return (
                                        <div key={a.hodUserId} className="border border-ap-border rounded-xl p-4 bg-[#FAFCFF] flex flex-col gap-3">
                                            <div className="flex items-start gap-3">
                                                <Avatar name={a.hod?.name || "H"} size={40} color="#00843D" />
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-[15px] font-bold text-gray-800 truncate">{a.hod?.name || "Unknown"}</p>
                                                    <p className="text-[12px] text-gray-500 truncate">
                                                        {a.hod?.empCode ? `${a.hod.empCode} · ` : ""}{a.departments.join(", ") || "Department"}
                                                    </p>
                                                </div>
                                                <Badge label="HOD" color="blue" />
                                            </div>

                                            {/* Mini metrics */}
                                            <div className="grid grid-cols-3 gap-2 text-center">
                                                <div className="rounded-lg bg-white border border-ap-border py-1.5">
                                                    <p className="text-[16px] font-black text-ap-blue leading-none tabular-nums">{assigned}</p>
                                                    <p className="text-[9px] font-bold uppercase tracking-wider text-gray-500 mt-1">Assigned</p>
                                                </div>
                                                <div className="rounded-lg bg-white border border-ap-border py-1.5">
                                                    <p className="text-[16px] font-black text-ap-green leading-none tabular-nums">{evaluated}</p>
                                                    <p className="text-[9px] font-bold uppercase tracking-wider text-gray-500 mt-1">Evaluated</p>
                                                </div>
                                                <div className="rounded-lg bg-white border border-ap-border py-1.5">
                                                    <p className="text-[16px] font-black text-ap-orange leading-none tabular-nums">{pendingEval}</p>
                                                    <p className="text-[9px] font-bold uppercase tracking-wider text-gray-500 mt-1">Pending</p>
                                                </div>
                                            </div>

                                            {/* Actions */}
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <Btn variant="primary" size="sm" onClick={() => setManageHod(a)}>Manage Employees</Btn>
                                                <Btn variant="ghost" size="sm" onClick={() => setViewHod(a)}>View Assigned</Btn>
                                                <Btn variant="danger" size="sm" disabled={isRemoving} loading={isRemoving} onClick={() => handleRemoveHod(a)}>
                                                    Remove
                                                </Btn>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Departments view — STANDARD branches have no HODs. */}
            {activeView === "departments" && !isBigBranch && (
                <div className="bg-white border border-ap-border rounded-card p-6 mb-8 shadow-card">
                    <div className="flex items-center gap-3 mb-5">
                        <div className="w-10 h-10 rounded-full bg-ap-blue/10 flex items-center justify-center shrink-0">
                            <svg className="w-5 h-5 text-ap-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0H5m14 0h2M5 21H3m4-14h2m-2 4h2m-2 4h2m4-8h2m-2 4h2m-2 4h2" />
                            </svg>
                        </div>
                        <div>
                            <p className="text-[13px] text-gray-500 font-bold uppercase tracking-wider">Departments</p>
                            <p className="text-[18px] font-bold text-gray-800 leading-tight">{departments.length} department{departments.length === 1 ? "" : "s"} in your branch</p>
                        </div>
                    </div>
                    {departments.length === 0 ? (
                        <p className="text-[14px] text-gray-400 italic">No departments found in your branch.</p>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {departments.map((d) => (
                                <div key={d.id} className="border border-ap-border rounded-lg bg-[#FAFCFF] px-4 py-3 flex items-center justify-between gap-3">
                                    <p className="text-[14px] font-bold text-gray-800 truncate">{d.name}</p>
                                    <span className="text-[12px] font-bold text-ap-blue bg-white border border-ap-blue/20 rounded-full px-2.5 py-0.5 shrink-0">{d.employeeCount ?? 0}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* History view */}
            {activeView === "history" && (
                <div className="bg-white border border-ap-border rounded-card p-6 mb-8 shadow-card">
                    <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
                        <div>
                            <p className="text-[18px] font-bold text-gray-800">Evaluation History</p>
                            <p className="text-[13px] text-gray-500 font-medium">Employees you have evaluated this quarter{isBigBranch ? " (white-collar)" : ""}</p>
                        </div>
                        <Badge label={`${shortlistMeta.evaluatedCount} done`} color="green" />
                    </div>
                    {groupedHistory.length === 0 ? (
                        <EmptyState icon="🗂️" title="No Evaluations Yet" sub="Once you evaluate employees from the Evaluation tab, they will appear here." />
                    ) : (
                        <div className="space-y-6">
                            {groupedHistory.map((group) => (
                                <div key={group.id}>
                                    <div className="flex items-center gap-2 mb-3">
                                        <p className="text-[14px] font-bold uppercase tracking-wider text-ap-blue">{group.name}</p>
                                        <span className="text-[12px] text-gray-500 font-medium">· {group.rows.length}</span>
                                    </div>
                                    <div className="grid grid-cols-1 gap-3">
                                        {group.rows.map((entry) => (
                                            <div key={entry.userId} className="bg-ap-green-50 border border-ap-green/30 rounded-xl p-4 flex items-center justify-between gap-4">
                                                <div className="flex items-center gap-4 min-w-0">
                                                    <Avatar name={entry.name} size={44} color="#00843D" />
                                                    <div className="min-w-0">
                                                        <p className="text-[16px] font-bold text-ap-green-700 leading-tight truncate">{entry.name}</p>
                                                        <p className="text-[13px] text-ap-green-700/80 font-medium truncate">{entry.designation} | {entry.empCode}</p>
                                                    </div>
                                                </div>
                                                <span className="text-[13px] px-4 py-2 rounded-lg bg-white text-ap-green-700 border border-ap-green/30 font-bold shrink-0 flex items-center gap-2">
                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                                    Done
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ═══════ EVALUATION view ═══════ */}
            {activeView === "evaluate" && (
              <>
                <div className="bg-white border border-ap-border rounded-card p-6 mb-6 shadow-card">
                    <div className="flex justify-between items-end mb-3">
                        <div>
                            <span className="text-[14px] text-gray-500 font-bold uppercase tracking-wider block mb-1">Evaluation Progress</span>
                            <span className="text-[15px] font-medium text-gray-800">
                                {progress.evaluated} of {progress.total} employees evaluated{isBigBranch ? " (white-collar only)" : ""}
                            </span>
                        </div>
                        <span className="text-[24px] font-black text-ap-blue leading-none">{progress.evaluated}/{progress.total}</span>
                    </div>
                    <ProgressBar value={progress.total > 0 ? (progress.evaluated / progress.total) * 100 : 0} color="#00843D" height={12} />
                </div>

                {error && <div className="mb-6 p-4 bg-[#FFEBEE] border-l-4 border-red-600 rounded-r-lg text-red-700 text-[15px] font-bold shadow-sm">{error}</div>}
                {success && <div className="mb-6 p-5 bg-ap-green-50 border-l-4 border-ap-green rounded-r-lg text-ap-green-700 text-[15px] font-bold shadow-sm flex gap-3 items-center">
                    <svg className="w-6 h-6 text-ap-green shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    {success}
                </div>}

                {selectedEmployee ? (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
                        <button onClick={() => setSelectedEmployee(null)} className="min-h-[44px] min-w-[80px] px-4 py-2 text-[14px] font-bold text-ap-blue bg-white border border-ap-blue rounded-lg hover:bg-ap-blue hover:text-white transition-all mb-6 flex items-center gap-2 cursor-pointer shadow-sm">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                            Back to Employee List
                        </button>

                        <div className="bg-ap-blue-50 border border-ap-blue/30 rounded-card p-6 mb-6 shadow-card flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div>
                                <p className="text-[13px] text-ap-blue/80 font-bold uppercase tracking-wider mb-1">
                                    Currently Evaluating{selectedEmployee.department?.name ? ` · ${selectedEmployee.department.name}` : ""}
                                </p>
                                <p className="text-ap-blue font-black text-[22px] leading-tight">{selectedEmployee.name}</p>
                            </div>
                        </div>

                        <EvaluationForm
                            questions={shuffledQuestions}
                            onSubmit={handleEvaluate}
                            submitLabel={`Submit Evaluation for ${selectedEmployee.name.split(' ')[0]}`}
                            draftKey={user?.id && branch?.id ? `draft_eval_${user.id}_${selectedEmployee.userId}_${branch.id}` : null}
                        />
                    </div>
                ) : (
                    <div className="space-y-5">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                            <p className="text-gray-800 font-bold text-[18px]">Branch Shortlist · Stage 2</p>
                            <span className="text-[13px] text-gray-500 font-medium bg-gray-100 px-3 py-1 rounded-full border border-ap-border hidden sm:block">Blind evaluation — previous scores hidden</span>
                        </div>

                        {/* Compact search + filters (spec §8) */}
                        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                            <div className="flex-1">
                                <SearchInput value={evalSearch} onChange={setEvalSearch} placeholder="Search by name, code, designation or department…" />
                            </div>
                            <div className="flex gap-2 flex-wrap">
                                <div className="inline-flex rounded-lg border border-ap-border overflow-hidden">
                                    {[["all", "All"], ["pending", "Pending"], ["done", "Done"]].map(([id, label]) => (
                                        <button key={id} type="button" onClick={() => setEvalStatus(id)}
                                            className={`px-3 py-2 text-[12px] font-bold cursor-pointer transition-colors ${evalStatus === id ? "bg-ap-blue text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
                                            {label}
                                        </button>
                                    ))}
                                </div>
                                {isBigBranch && (
                                    <div className="inline-flex rounded-lg border border-ap-border overflow-hidden">
                                        {[["all", "All"], ["WHITE_COLLAR", "White"], ["BLUE_COLLAR", "Blue"]].map(([id, label]) => (
                                            <button key={id} type="button" onClick={() => setEvalCollar(id)}
                                                className={`px-3 py-2 text-[12px] font-bold cursor-pointer transition-colors ${evalCollar === id ? "bg-ap-blue text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
                                                {label}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {shortlist.length === 0 ? (
                            <EmptyState icon="📋" title="No Evaluations Pending" sub="No employees are pending your evaluation. Stage 1 shortlist may not be ready yet, or all your evaluations are complete." />
                        ) : groupedShortlist.length === 0 ? (
                            <EmptyState icon="🔍" title="No matches" sub="No employees match your current search or filters." />
                        ) : (
                            groupedShortlist.map((group) => (
                                <div key={group.id}>
                                    <div className="flex items-center gap-2 mb-3">
                                        <p className="text-[14px] font-bold uppercase tracking-wider text-ap-blue">{group.name}</p>
                                        <span className="text-[12px] text-gray-500 font-medium">· {group.rows.length}</span>
                                    </div>
                                    <div className="grid grid-cols-1 gap-3">
                                        {group.rows.map((entry) => (
                                            <div key={entry.userId} className={`bg-white border-2 rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all duration-200 ${entry.alreadyEvaluated ? "border-ap-green/30 bg-ap-green-50 shadow-sm" : "border-ap-border shadow-sm hover:border-ap-blue/50 hover:shadow-md"}`}>
                                                <div className="flex items-center gap-4 min-w-0">
                                                    <Avatar name={entry.name} size={48} color={entry.alreadyEvaluated ? "#00843D" : "#003087"} />
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                            <p className="text-[17px] font-bold text-ap-blue leading-tight truncate">{entry.name}</p>
                                                            <CollarBadge collar={entry.collarType} />
                                                            {entry.alreadyEvaluated
                                                                ? <Badge label="Done" color="green" />
                                                                : <Badge label="Pending" color="orange" />}
                                                        </div>
                                                        <p className="text-gray-500 text-[14px] font-medium truncate">{entry.designation} | {entry.empCode}</p>
                                                    </div>
                                                </div>
                                                <div className="shrink-0">
                                                    {entry.alreadyEvaluated ? (
                                                        <span className="min-h-[44px] text-[14px] px-6 py-2.5 rounded-lg bg-white text-ap-green-700 border border-ap-green/30 font-bold shadow-sm flex items-center gap-2 justify-center w-full sm:w-auto">
                                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                                            Done
                                                        </span>
                                                    ) : (
                                                        <button onClick={() => setSelectedEmployee(entry)} className="min-h-[44px] min-w-[120px] text-[15px] px-6 py-3 bg-ap-blue text-white rounded-lg hover:bg-ap-green transition-colors cursor-pointer font-bold shadow flex items-center gap-2 justify-center w-full sm:w-auto">
                                                            Evaluate
                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}
              </>
            )}

            {/* ═══════ DRAWERS — blue-collar management & assigned review ═══════ */}
            {manageHod && (
                <ManageEmployeesDrawer
                    open={!!manageHod}
                    hodUserId={manageHod.hodUserId}
                    hodName={manageHod.hod?.name || ""}
                    onClose={() => setManageHod(null)}
                    onChanged={async () => { await Promise.all([fetchShortlist(), fetchBmStats()]); }}
                />
            )}
            {viewHod && (
                <AssignedEmployeesDrawer
                    open={!!viewHod}
                    hod={viewHod}
                    otherHods={uniqueHods}
                    onClose={() => setViewHod(null)}
                    onChanged={async () => { await Promise.all([fetchShortlist(), fetchBmStats()]); }}
                />
            )}
        </DashboardShell>
    );
}
