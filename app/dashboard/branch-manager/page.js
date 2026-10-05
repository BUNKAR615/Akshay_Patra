"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import DashboardShell from "../../../components/DashboardShell";
import EvaluationForm from "../../../components/EvaluationForm";
import UserProfileCard from "../../../components/UserProfileCard";
import DelegationBanner from "../../../components/DelegationBanner";
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

// Short human date for assignment timestamps ("4 Jul 2026").
function fmtDate(d) {
    if (!d) return "";
    try {
        return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
    } catch {
        return "";
    }
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
 * AssignEmployeesDrawer — assign blue-collar employees to an HOD.
 * Two-panel picker: the left panel lists EVERY department in the branch; the
 * right panel lists the selected department's Stage-1-qualified blue-collar
 * employees with multi-select checkboxes. Typing in the search switches the
 * right panel to branch-wide results (name/code across ALL departments).
 * Every department's pool is fetched once per open and cached client-side, so
 * switching departments, searching, and selecting across departments are all
 * instant. Endpoints are unchanged — GET blue-collar-pool (±departmentId) and
 * POST hod/employees, which enforces the one-HOD-per-employee rule.
 */
function AssignEmployeesDrawer({ open, hodUserId, hodName, onClose, onChanged }) {
    const toast = useToast();
    const [depts, setDepts] = useState([]);
    const [poolByDept, setPoolByDept] = useState({});
    const [loading, setLoading] = useState(false);
    const [activeDeptId, setActiveDeptId] = useState("");
    const [selectedIds, setSelectedIds] = useState(() => new Set());
    const [search, setSearch] = useState("");
    const [busy, setBusy] = useState(false);

    const firstName = (hodName || "").split(" ")[0] || "this HOD";

    // One load per open: the department list, then every non-empty department's
    // pool in parallel. All later filtering happens client-side — no refetch on
    // every department click, and search can span the whole branch.
    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        setSearch("");
        setSelectedIds(new Set());
        setActiveDeptId("");
        setDepts([]);
        setPoolByDept({});
        setLoading(true);
        (async () => {
            try {
                const base = await drawerApi("/api/branch-manager/hod/blue-collar-pool");
                if (cancelled) return;
                const list = base.departments || [];
                setDepts(list);
                const first = list.find((d) => d.employeeCount > 0) || list[0];
                if (first) setActiveDeptId(first.id);
                const entries = await Promise.all(list.map(async (d) => {
                    if (!d.employeeCount) return [d.id, []];
                    try {
                        const data = await drawerApi(`/api/branch-manager/hod/blue-collar-pool?departmentId=${encodeURIComponent(d.id)}`);
                        return [d.id, (data.employees || []).map((e) => ({ ...e, departmentId: d.id, departmentName: d.name }))];
                    } catch {
                        return [d.id, []];
                    }
                }));
                if (!cancelled) setPoolByDept(Object.fromEntries(entries));
            } catch (e) {
                if (!cancelled) toast.error(e.message);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [open, toast]);

    const allEmployees = useMemo(() => Object.values(poolByDept).flat(), [poolByDept]);
    const searching = search.trim().length > 0;

    // Right-panel rows: department view by default, branch-wide when searching.
    const visible = useMemo(() => {
        if (searching) {
            const q = search.trim().toLowerCase();
            return allEmployees.filter((e) =>
                e.name.toLowerCase().includes(q) || (e.empCode || "").toLowerCase().includes(q)
            );
        }
        return poolByDept[activeDeptId] || [];
    }, [searching, search, allEmployees, poolByDept, activeDeptId]);

    const mineTotal = useMemo(
        () => allEmployees.filter((e) => e.currentHod?.id === hodUserId).length,
        [allEmployees, hodUserId]
    );
    const mineByDept = useMemo(() => {
        const m = {};
        for (const [deptId, emps] of Object.entries(poolByDept)) {
            m[deptId] = emps.filter((e) => e.currentHod?.id === hodUserId).length;
        }
        return m;
    }, [poolByDept, hodUserId]);

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
        const byId = new Map(allEmployees.map((e) => [e.id, e]));
        const collisions = ids.map((id) => byId.get(id)).filter((e) => e?.currentHod && e.currentHod.id !== hodUserId);
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
            // Flip statuses in the client cache so assignment feels instant;
            // the parent refreshes stats/queue in the background via onChanged.
            const assignedSet = new Set(ids);
            setPoolByDept((prev) => {
                const next = {};
                for (const [deptId, emps] of Object.entries(prev)) {
                    next[deptId] = emps.map((e) =>
                        assignedSet.has(e.id) ? { ...e, currentHod: { id: hodUserId, name: hodName } } : e
                    );
                }
                return next;
            });
            setSelectedIds(new Set());
            if (typeof onChanged === "function") onChanged();
        } catch (e) {
            toast.error(e.message);
        } finally {
            setBusy(false);
        }
    };

    const activeDeptName = depts.find((d) => d.id === activeDeptId)?.name || "";

    return (
        <Drawer
            open={open}
            onClose={onClose}
            title={`Assign Blue-collar · ${hodName}`}
            width={860}
            footer={
                <div className="flex items-center gap-2">
                    <Btn variant="primary" full disabled={busy || selectedIds.size === 0} loading={busy} onClick={handleAssignSelected}>
                        {selectedIds.size === 0
                            ? "Select employees to assign"
                            : `Assign ${selectedIds.size} selected employee${selectedIds.size === 1 ? "" : "s"}`}
                    </Btn>
                    {selectedIds.size > 0 && (
                        <Btn variant="ghost" disabled={busy} onClick={() => setSelectedIds(new Set())}>Clear</Btn>
                    )}
                </div>
            }
        >
            <div className="h-full flex flex-col">
                {/* Search — spans ALL departments by name or employee code */}
                <div className="shrink-0 pb-3">
                    <SearchInput value={search} onChange={setSearch} delay={150} placeholder="Search all departments by name or employee code…" />
                    <div className="flex items-center gap-x-3 gap-y-1 mt-2 flex-wrap">
                        <span className="text-[11px] font-bold text-gray-600">{mineTotal} assigned to {firstName}</span>
                        <span className="inline-flex items-center gap-1 text-[11px] text-gray-500"><span className="w-2 h-2 rounded-full bg-ap-green inline-block" /> Assigned</span>
                        <span className="inline-flex items-center gap-1 text-[11px] text-gray-500"><span className="w-2 h-2 rounded-full bg-ap-orange inline-block" /> Under another HOD</span>
                        <span className="inline-flex items-center gap-1 text-[11px] text-gray-500"><span className="w-2 h-2 rounded-full bg-[#B45309] inline-block" /> Pending assignment</span>
                    </div>
                </div>

                <div className="flex-1 min-h-0 flex flex-col sm:flex-row gap-3">
                    {/* Left panel — every department, always visible */}
                    <div className={`shrink-0 sm:w-52 sm:flex sm:flex-col sm:min-h-0 ${searching ? "opacity-40 pointer-events-none" : ""}`}>
                        <p className="hidden sm:block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1.5 shrink-0">Departments</p>
                        {loading && depts.length === 0 ? (
                            <p className="text-[12px] text-gray-500">Loading…</p>
                        ) : depts.length === 0 ? (
                            <p className="text-[12px] text-gray-400 italic">No departments found.</p>
                        ) : (
                            <div className="flex sm:flex-col gap-1.5 overflow-x-auto sm:overflow-x-visible sm:flex-1 sm:min-h-0 sm:overflow-y-auto pb-1 sm:pb-0 sm:pr-1">
                                {depts.map((d) => (
                                    <button
                                        key={d.id}
                                        type="button"
                                        onClick={() => setActiveDeptId(d.id)}
                                        className={`shrink-0 sm:w-full flex items-center justify-between gap-2 min-h-[38px] px-3 py-2 text-[12px] font-bold rounded-lg border text-left transition-colors cursor-pointer ${
                                            activeDeptId === d.id
                                                ? "bg-ap-blue text-white border-ap-blue"
                                                : "bg-white text-gray-700 border-ap-border hover:border-ap-blue/50"
                                        }`}
                                    >
                                        <span className="truncate">{d.name}</span>
                                        <span className="flex items-center gap-1 shrink-0">
                                            {(mineByDept[d.id] || 0) > 0 && (
                                                <span className={`text-[10px] font-bold rounded-full px-1.5 py-0.5 ${activeDeptId === d.id ? "bg-white/20 text-white" : "bg-ap-green-50 text-ap-green-700 border border-ap-green/30"}`}>
                                                    {mineByDept[d.id]} ✓
                                                </span>
                                            )}
                                            <span className={`text-[10px] font-bold rounded-full px-1.5 py-0.5 ${activeDeptId === d.id ? "bg-white/20 text-white" : "bg-gray-100 text-gray-600"}`}>
                                                {d.employeeCount}
                                            </span>
                                        </span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Right panel — eligible employees, multi-select */}
                    <div className="flex-1 min-h-0 flex flex-col border border-ap-border rounded-xl bg-[#FAFAFA]">
                        <div className="shrink-0 px-3 pt-2.5 pb-2 border-b border-ap-border/60">
                            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                                {searching
                                    ? `Search results · all departments (${visible.length})`
                                    : `${activeDeptName || "Department"} · qualified blue-collar (${visible.length})`}
                            </p>
                        </div>
                        <div className="flex-1 min-h-0 overflow-y-auto p-2.5 space-y-1.5">
                            {loading ? (
                                <p className="text-[12px] text-gray-500 px-1 py-2">Loading employees…</p>
                            ) : visible.length === 0 ? (
                                <p className="text-[12px] text-gray-400 italic px-1 py-2">
                                    {searching
                                        ? "No qualified blue-collar employees match your search."
                                        : "No blue-collar employees in this department have qualified for Stage 2 yet."}
                                </p>
                            ) : (
                                visible.map((e) => {
                                    const checked = selectedIds.has(e.id);
                                    const underThis = e.currentHod && e.currentHod.id === hodUserId;
                                    const underOther = e.currentHod && e.currentHod.id !== hodUserId;
                                    return (
                                        <label
                                            key={e.id}
                                            className={`flex items-center gap-3 min-h-[44px] px-3 py-2 rounded-lg border transition-colors ${
                                                underThis
                                                    ? "bg-ap-green-50/60 border-ap-green/20 cursor-default"
                                                    : checked
                                                        ? "bg-ap-blue-50 border-ap-blue/40 cursor-pointer"
                                                        : "bg-white border-ap-border hover:border-ap-blue/40 cursor-pointer"
                                            }`}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={checked}
                                                onChange={() => handleToggle(e.id)}
                                                disabled={underThis || busy}
                                                className="w-4 h-4 accent-ap-blue shrink-0"
                                            />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[13px] font-bold text-gray-800 truncate">
                                                    {e.name} <span className="text-gray-500 font-medium">({e.empCode})</span>
                                                </p>
                                                <p className="text-[11px] text-gray-500 truncate">
                                                    {e.departmentName}{e.designation ? ` · ${e.designation}` : ""}
                                                </p>
                                            </div>
                                            {underThis && <Badge label="Assigned ✓" color="green" />}
                                            {underOther && (
                                                <span title={`Currently under ${e.currentHod.name}`}>
                                                    <Badge label={`Under ${e.currentHod.name.split(" ")[0]}`} color="orange" />
                                                </span>
                                            )}
                                            {!e.currentHod && <Badge label="Pending" color="amber" />}
                                        </label>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </Drawer>
    );
}

/**
 * AssignedEmployeesDrawer — review the blue-collar employees under one HOD
 * (spec §6): name, code, department, assignment date, and evaluation status.
 * Each row supports Remove Assignment (back to the BM queue) and Reassign to
 * another HOD. Both reuse the existing /hod/employees endpoint — a reassign is
 * a POST to the target HOD, which the unique constraint resolves as a move.
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
                    sub={employees.length === 0 ? "Use “Assign Employees” on the HOD card to attach blue-collar staff to this HOD." : "Try a different search."}
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
                                        <p className="text-[11px] text-gray-500 truncate">
                                            {e.departmentName || "—"}{e.assignedAt ? ` · Assigned ${fmtDate(e.assignedAt)}` : ""}
                                        </p>
                                    </div>
                                </div>
                                {e.evaluated
                                    ? <Badge label="Evaluated ✓" color="green" />
                                    : <Badge label="Awaiting evaluation" color="sky" />}
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
                                            <option value="">Reassign to…</option>
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
                                            title={otherHods.filter(h => h.hodUserId !== hodUserId).length === 0 ? "No other HODs to reassign to" : undefined}
                                        >
                                            Reassign to another HOD
                                        </Btn>
                                        <Btn variant="danger" size="sm" disabled={busyId === e.id} loading={busyId === e.id} onClick={() => handleRemove(e.id, e.name)}>
                                            Remove Assignment
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
    // Department POA: a pure delegate (holds a Branch Manager POA but is not a
    // branch BM) gets an evaluation-only dashboard — the branch-management
    // views (overview stats, HOD management) are the branch BM's alone.
    const [delegateOnly, setDelegateOnly] = useState(false);
    const delegateOnlyRef = useRef(false);
    const [delegations, setDelegations] = useState([]);
    const requestedView = searchParams.get("view") || "evaluate";
    const activeView = delegateOnly && (requestedView === "shortlist" || requestedView === "departments") ? "evaluate" : requestedView;

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
        if (delegateOnlyRef.current) return;
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
            delegateOnlyRef.current = !!deptsData.delegateOnly;
            setDelegateOnly(!!deptsData.delegateOnly);
            setDelegations(deptsData.delegations || []);

            if (deptsData.branch?.branchType === "BIG" && !deptsData.delegateOnly) {
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
            if ((branch?.branchType || user?.branchType) === "BIG" && !delegateOnlyRef.current) {
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
        departments: isBigBranch ? "HOD Management" : "Departments",
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
                    // A pure delegate is NOT a Branch Manager — label the pill
                    // as the delegated authority it is (their real role is unchanged).
                    user={delegateOnly ? { ...user, role: "Delegated BM (POA)" } : user}
                    extraInfo={delegateOnly ? {
                        label: "Delegated Branch Manager evaluator (POA)",
                        value: `${departments.length} department${departments.length === 1 ? "" : "s"} delegated to you`,
                        color: "text-ap-orange-700"
                    } : {
                        label: branch?.name ? `Branch: ${branch.name}` : (user.branchName ? `Branch: ${user.branchName}` : "Evaluating"),
                        value: `${branch?.branchType || user.branchType || "STANDARD"} branch — ${departments.length} department${departments.length === 1 ? "" : "s"}`,
                        color: "text-ap-green"
                    }}
                />
            )}

            {/* Department POA banner — evaluation authority only, no role change. */}
            <DelegationBanner
                delegations={delegations}
                message={delegateOnly
                    ? "You evaluate Stage 2 for the departments below on behalf of the Branch Manager. Your own role, branch and department are unchanged, and your own evaluation stays with the Branch Manager."
                    : "In addition to your branch, you evaluate Stage 2 for these departments under a department POA:"}
            />

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
                    ...(delegateOnly ? [] : [
                        { id: "shortlist", label: "Branch Overview" },
                        { id: "departments", label: isBigBranch ? "HOD Management" : "Departments" },
                    ]),
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

            {/* ═══════ HOD MANAGEMENT (BIG branches) ═══════ */}
            {activeView === "departments" && isBigBranch && !delegateOnly && (
                <div className="space-y-6 mb-8">
                    {/* Quick statistics (spec) — refreshed after every nomination/assignment */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2 sm:gap-3">
                        <SummaryTile label="Qualified White-collar" value={bmStats?.stage1?.shortlistedWhite} color="#003087" />
                        <SummaryTile label="Qualified Blue-collar" value={bcQualified} color="#0369A1" />
                        <SummaryTile label="Current HODs" value={hodCount} color="#6A1B9A" />
                        <SummaryTile label="Blue-collar Assigned" value={bcAssigned} color="#00843D" />
                        <SummaryTile label="Pending Assignment" value={bcPending} color="#F7941D" accent={bcPending > 0} />
                    </div>

                    {/* ── Section 1: HOD Management ── */}
                    <div className="bg-white border border-ap-border rounded-card p-4 sm:p-6 shadow-card">
                        <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
                            <div className="min-w-0">
                                <p className="text-[11px] text-gray-500 font-bold uppercase tracking-wider">Section 1 · Manage</p>
                                <p className="text-[17px] font-bold text-gray-800 leading-tight">HOD Management ({hodCount})</p>
                                <p className="text-[12px] text-gray-500 mt-1">
                                    You evaluate <span className="font-bold text-ap-blue">white-collar</span> employees; each HOD evaluates the{" "}
                                    <span className="font-bold text-ap-green">blue-collar</span> employees you assign to them.
                                </p>
                            </div>
                            <Btn
                                variant="primary"
                                size="sm"
                                onClick={() => document.getElementById("nominate-hod")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                                icon={<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>}
                            >
                                Nominate HOD
                            </Btn>
                        </div>

                        {uniqueHods.length === 0 ? (
                            <EmptyState icon="🧑‍💼" title="No HODs nominated yet" sub="Use “Nominate HOD” to pick a qualified white-collar employee below, then assign blue-collar employees to them." />
                        ) : (
                            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
                                {uniqueHods.map((a) => {
                                    const st = hodStatsById.get(a.hodUserId);
                                    const assigned = st?.assigned ?? 0;
                                    const evaluated = st?.evaluated ?? 0;
                                    const pendingEval = Math.max(0, assigned - evaluated);
                                    const pct = assigned > 0 ? Math.round((evaluated / assigned) * 100) : 0;
                                    const isRemoving = removingHodId === a.hodUserId;
                                    return (
                                        <div key={a.hodUserId} className="border border-ap-border rounded-xl p-4 bg-[#FAFCFF] flex flex-col gap-3 transition-all duration-200 hover:border-ap-blue/40 hover:shadow-md">
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

                                            {/* Assigned / pending-evaluation summary */}
                                            <div>
                                                <div className="flex items-center justify-between gap-2 text-[11px] font-bold mb-1.5">
                                                    <span className="text-ap-blue">{assigned} assigned</span>
                                                    <span className={pendingEval > 0 ? "text-[#C2410C]" : "text-ap-green"}>
                                                        {assigned === 0
                                                            ? "No employees yet"
                                                            : pendingEval > 0
                                                                ? `${pendingEval} pending evaluation`
                                                                : "All evaluated ✓"}
                                                    </span>
                                                </div>
                                                <ProgressBar value={pct} color={assigned > 0 && pct === 100 ? "#00843D" : "#F7941D"} />
                                            </div>

                                            {/* Actions (spec: assign · view · remove — nothing else) */}
                                            <div className="flex items-center gap-2 flex-wrap mt-auto">
                                                <Btn variant="primary" size="sm" onClick={() => setManageHod(a)} title="Assign blue-collar employees to this HOD">
                                                    Assign Employees
                                                </Btn>
                                                <Btn variant="ghost" size="sm" onClick={() => setViewHod(a)}>
                                                    View Assigned{assigned > 0 ? ` (${assigned})` : ""}
                                                </Btn>
                                                <Btn variant="danger" size="sm" disabled={isRemoving} loading={isRemoving} onClick={() => handleRemoveHod(a)}
                                                    title="Remove HOD — their assigned employees return to your queue">
                                                    Remove HOD
                                                </Btn>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* ── Section 2: Nominate an HOD (both methods preserved) ── */}
                    <div id="nominate-hod" className="bg-white border border-ap-border rounded-card p-4 sm:p-6 shadow-card scroll-mt-24">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-8 h-8 rounded-lg bg-ap-blue text-white flex items-center justify-center font-black text-[16px] shrink-0">+</div>
                            <div>
                                <p className="text-[11px] text-gray-500 font-bold uppercase tracking-wider">Section 2 · Nominate</p>
                                <p className="text-[17px] font-bold text-gray-800 leading-tight">Nominate a Head of Department</p>
                            </div>
                        </div>

                        {/* Method 1 — direct search by employee name or code (branch-wide) */}
                        <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">Search white-collar employees by name or code</p>
                        <SearchInput
                            value={hodSearchQuery}
                            onChange={(v) => { setHodSearchQuery(v); setHodSelected(null); }}
                            delay={300}
                            placeholder="Search by employee name or code…"
                        />

                        {/* Method 2 — pick a department, browse its qualified white-collar staff */}
                        <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mt-4 mb-2">Or select a department to browse</p>
                        <div className="flex flex-wrap gap-2">
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
                </div>
            )}

            {/* Departments view — STANDARD branches have no HODs. */}
            {activeView === "departments" && !isBigBranch && !delegateOnly && (
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
                                                            {entry.delegated && !delegateOnly && <Badge label="Dept POA" color="orange" />}
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
                <AssignEmployeesDrawer
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
