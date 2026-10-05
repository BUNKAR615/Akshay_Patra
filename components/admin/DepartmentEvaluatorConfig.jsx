"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../lib/clientApi";
import { Badge, Btn, Modal, useToast } from "../ui";
import ConfirmDialog from "../ConfirmDialog";

/**
 * Department evaluator configuration — "Power of Attorney" (POA).
 *
 * For each department of a branch, shows who evaluates it at each of the four
 * evaluator stages (Branch Manager · Cluster Manager · HR · Committee): either
 * the Branch Default (the branch-level assignment) or a Department POA holder.
 * Admin can Assign / Change / Remove a POA. A POA is delegated evaluation
 * authority only — the person's role, home branch and department never change,
 * which is why their original identity and actual role are always shown.
 *
 * Props:
 *   branchId      — branch id or slug
 *   departmentId  — optional: render just this department (embedded use)
 *   compact       — optional: hide the section header (embedded use)
 */

const TYPE_STYLE = {
    BRANCH_MANAGER: { dot: "bg-emerald-500", text: "text-emerald-700" },
    CLUSTER_MANAGER: { dot: "bg-purple-500", text: "text-purple-700" },
    HR: { dot: "bg-sky-500", text: "text-sky-700" },
    COMMITTEE: { dot: "bg-amber-500", text: "text-amber-700" },
};

function PersonLine({ p, showIdentity = true }) {
    if (!p) return null;
    return (
        <div className="min-w-0">
            <p className="m-0 text-[13px] font-bold text-gray-900 truncate">
                {p.name}
                {p.empCode ? <span className="ml-1 font-mono text-[11px] font-semibold text-gray-500">({p.empCode})</span> : null}
            </p>
            {showIdentity && (
                <p className="m-0 text-[11px] text-gray-500 leading-snug">
                    <span className="font-semibold text-gray-600">Original:</span>{" "}
                    {p.homeBranch ? `${p.homeBranch} · ${p.homeDepartment || "—"}` : "No department (staff)"}
                    {" · "}
                    <span className="font-semibold text-gray-600">Actual role:</span> {(p.globalRoles || []).join("; ") || "—"}
                </p>
            )}
        </div>
    );
}

export default function DepartmentEvaluatorConfig({ branchId, departmentId = null, compact = false }) {
    const toast = useToast();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [openDept, setOpenDept] = useState(null);

    // Assign / Change modal
    const [modal, setModal] = useState(null); // { dept, type, typeLabel, replacing }
    const [query, setQuery] = useState("");
    const [candidates, setCandidates] = useState([]);
    const [searching, setSearching] = useState(false);
    const [picked, setPicked] = useState(null);
    const [confirming, setConfirming] = useState(false);
    const [saving, setSaving] = useState(false);

    // Remove confirmation
    const [removeTarget, setRemoveTarget] = useState(null); // { delegate, dept, typeLabel }
    const [removing, setRemoving] = useState(false);

    const base = `/api/admin/branches/${encodeURIComponent(branchId)}/evaluator-delegations`;

    const load = useCallback(async () => {
        try {
            setError("");
            const d = await api(base);
            setData(d);
        } catch (e) {
            setError(e.message || "Failed to load department evaluators");
        } finally {
            setLoading(false);
        }
    }, [base]);

    useEffect(() => { setLoading(true); load(); }, [load]);

    // Debounced person search for the picker.
    useEffect(() => {
        if (!modal) return;
        const q = query.trim();
        if (q.length < 2) { setCandidates([]); return; }
        setSearching(true);
        const t = setTimeout(async () => {
            try {
                const d = await api(`${base}?q=${encodeURIComponent(q)}`);
                setCandidates(d.candidates || []);
            } catch {
                setCandidates([]);
            } finally {
                setSearching(false);
            }
        }, 300);
        return () => clearTimeout(t);
    }, [query, modal, base]);

    const typeLabel = useCallback(
        (type) => data?.types?.find((t) => t.type === type)?.label || type,
        [data]
    );

    const departments = useMemo(() => {
        const list = data?.departments || [];
        return departmentId ? list.filter((d) => d.id === departmentId) : list;
    }, [data, departmentId]);

    const openAssign = (dept, type, replacing = null) => {
        setModal({ dept, type, typeLabel: typeLabel(type), replacing });
        setQuery("");
        setCandidates([]);
        setPicked(null);
        setConfirming(false);
    };

    const submitAssign = async () => {
        if (!modal || !picked) return;
        setSaving(true);
        try {
            const d = await api(base, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    departmentId: modal.dept.id,
                    evaluatorType: modal.type,
                    userId: picked.id,
                    replace: !!modal.replacing,
                }),
            });
            toast.success(d?.message || "POA saved");
            setModal(null);
            await load();
        } catch (e) {
            toast.error(e.message || "Failed to save POA");
            setConfirming(false);
        } finally {
            setSaving(false);
        }
    };

    const submitRemove = async () => {
        if (!removeTarget) return;
        setRemoving(true);
        try {
            const d = await api(`${base}?id=${encodeURIComponent(removeTarget.delegate.delegationId)}`, { method: "DELETE" });
            toast.success(d?.message || "POA removed");
            setRemoveTarget(null);
            await load();
        } catch (e) {
            toast.error(e.message || "Failed to remove POA");
        } finally {
            setRemoving(false);
        }
    };

    if (loading) {
        return <div className="text-sm text-gray-500 py-4">Loading department evaluators…</div>;
    }
    if (error) {
        return <div className="p-3 rounded-lg text-sm bg-red-50 text-red-700 border border-red-200">{error}</div>;
    }
    if (!data) return null;

    const poaCount = (dept) => (data.types || []).filter((t) => dept.evaluators[t.type]?.mode === "DEPARTMENT_POA").length;

    const renderDept = (dept) => (
        <div className="divide-y divide-[#EEF0F3]">
            {(data.types || []).map(({ type, label, multiple }) => {
                const ev = dept.evaluators[type];
                const isPoa = ev.mode === "DEPARTMENT_POA";
                const style = TYPE_STYLE[type] || TYPE_STYLE.BRANCH_MANAGER;
                const canAddMore = multiple && ev.delegates.length < 3;
                return (
                    <div key={type} className="py-3 flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-4">
                        <div className="sm:w-44 shrink-0 flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${style.dot}`} aria-hidden="true" />
                            <span className={`text-[12px] font-bold uppercase tracking-wide ${style.text}`}>{label}</span>
                        </div>
                        <div className="flex-1 min-w-0 space-y-2">
                            <div>
                                {isPoa
                                    ? <Badge label="Department POA" color="orange" />
                                    : <Badge label="Branch Default" color="gray" />}
                            </div>
                            {isPoa ? (
                                ev.delegates.map((p) => (
                                    <div key={p.delegationId} className="flex flex-col sm:flex-row sm:items-center gap-2 bg-orange-50/60 border border-orange-100 rounded-lg px-3 py-2">
                                        <div className="flex-1 min-w-0">
                                            <p className="m-0 text-[10px] font-bold uppercase tracking-wider text-orange-700">Department-specific · Delegated {label}</p>
                                            <PersonLine p={p} />
                                        </div>
                                        <div className="flex gap-1.5 shrink-0">
                                            {!multiple && (
                                                <Btn size="sm" variant="ghost" onClick={() => openAssign(dept, type, p)}>Change</Btn>
                                            )}
                                            <Btn size="sm" variant="ghost" onClick={() => setRemoveTarget({ delegate: p, dept, typeLabel: label })}>Remove</Btn>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="text-[12px] text-gray-600">
                                    <p className="m-0 font-semibold text-gray-700">Using Branch Default</p>
                                    {ev.branchDefault.length > 0 ? (
                                        <p className="m-0 text-gray-500">
                                            {ev.branchDefault.map((p) => `${p.name}${p.empCode ? ` (${p.empCode})` : ""}`).join(", ")}
                                        </p>
                                    ) : (
                                        <p className="m-0 text-red-600 font-semibold">No branch-level {label} assigned for {data.branch.name}</p>
                                    )}
                                </div>
                            )}
                        </div>
                        <div className="shrink-0">
                            {!isPoa && <Btn size="sm" onClick={() => openAssign(dept, type)}>Assign POA</Btn>}
                            {isPoa && canAddMore && <Btn size="sm" variant="ghost" onClick={() => openAssign(dept, type)}>+ Add member</Btn>}
                        </div>
                    </div>
                );
            })}
        </div>
    );

    return (
        <div className={compact ? "" : "bg-white border border-[#E0E0E0] rounded-xl p-5"}>
            {!compact && (
                <div className="mb-4">
                    <h3 className="text-[15px] font-bold text-[#003087] uppercase tracking-wide m-0">Department Evaluators · Power of Attorney</h3>
                    <p className="text-[12px] text-gray-500 mt-1 mb-0">
                        Every department uses the branch-level evaluators by default. Assign a department POA to let another
                        person evaluate just that department for one stage. A POA never changes the person&apos;s own role,
                        branch or department, and a delegate is never evaluated by themselves — their own evaluation stays with the branch default.
                    </p>
                    <div className="flex flex-wrap gap-2 mt-2">
                        <Badge label="Branch Default" color="gray" />
                        <Badge label="Department POA" color="orange" />
                    </div>
                </div>
            )}

            {departments.length === 0 ? (
                <p className="text-sm text-gray-500 m-0">No departments in this branch yet.</p>
            ) : departmentId ? (
                renderDept(departments[0])
            ) : (
                <div className="border border-[#E0E0E0] rounded-lg">
                    <div className="px-4 py-2.5 bg-[#F9FAFB] border-b border-[#E0E0E0] rounded-t-lg">
                        <p className="m-0 text-[13px] font-black text-[#003087] uppercase tracking-wide">{data.branch.name}</p>
                    </div>
                    <ul className="m-0 p-0 list-none divide-y divide-[#E0E0E0]">
                        {departments.map((dept) => {
                            const open = openDept === dept.id;
                            const n = poaCount(dept);
                            return (
                                <li key={dept.id}>
                                    <button
                                        onClick={() => setOpenDept(open ? null : dept.id)}
                                        aria-expanded={open}
                                        className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-transparent border-none cursor-pointer text-left hover:bg-gray-50"
                                    >
                                        <span className="flex items-center gap-2 min-w-0">
                                            <span className="text-gray-400 font-mono text-[12px]" aria-hidden="true">{open ? "▾" : "▸"}</span>
                                            <span className="text-[14px] font-bold text-gray-800 truncate">{dept.name}</span>
                                            <span className="text-[11px] text-gray-500 shrink-0">{dept.employeeCount} emp</span>
                                        </span>
                                        <span className="flex flex-wrap gap-1 justify-end">
                                            {(data.types || []).map(({ type, label }) => {
                                                const isPoa = dept.evaluators[type]?.mode === "DEPARTMENT_POA";
                                                return (
                                                    <span
                                                        key={type}
                                                        title={`${label}: ${isPoa ? "Department POA" : "Branch Default"}`}
                                                        className={`hidden sm:inline-block text-[10px] px-1.5 py-0.5 rounded border font-bold ${isPoa ? "bg-orange-50 text-orange-700 border-orange-200" : "bg-gray-50 text-gray-500 border-gray-200"}`}
                                                    >
                                                        {type === "BRANCH_MANAGER" ? "BM" : type === "CLUSTER_MANAGER" ? "CM" : type === "HR" ? "HR" : "COM"}
                                                    </span>
                                                );
                                            })}
                                            {n > 0 && <span className="sm:hidden"><Badge label={`${n} POA`} color="orange" /></span>}
                                        </span>
                                    </button>
                                    {open && <div className="px-4 pb-2 border-t border-[#F0F0F0]">{renderDept(dept)}</div>}
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}

            {/* Assign / Change POA */}
            <Modal
                open={!!modal}
                onClose={() => !saving && setModal(null)}
                title={modal ? `${modal.replacing ? "Change" : "Assign"} ${modal.typeLabel} POA — ${data.branch.name} · ${modal.dept.name}` : ""}
                width={560}
                footer={modal && (
                    <div className="flex gap-2 justify-end">
                        <Btn variant="ghost" onClick={() => (confirming ? setConfirming(false) : setModal(null))} disabled={saving}>
                            {confirming ? "Back" : "Cancel"}
                        </Btn>
                        {confirming ? (
                            <Btn onClick={submitAssign} loading={saving}>Confirm POA</Btn>
                        ) : (
                            <Btn onClick={() => setConfirming(true)} disabled={!picked}>
                                {picked ? `Continue with ${picked.name.split(" ")[0]}` : "Select a person"}
                            </Btn>
                        )}
                    </div>
                )}
            >
                {modal && (confirming && picked ? (
                    <div className="space-y-3 text-[13px] text-gray-700">
                        <p className="m-0">
                            <span className="font-bold">{picked.name}</span> will evaluate <span className="font-bold">{modal.dept.name}</span> employees
                            of <span className="font-bold">{data.branch.name}</span> as the department-specific <span className="font-bold">{modal.typeLabel}</span>
                            {modal.replacing ? <>, replacing<span className="font-bold">{modal.replacing.name}</span></> : null}.
                        </p>
                        <ul className="m-0 pl-5 space-y-1 text-[12px] text-gray-600">
                            <li>Their role, branch, department and designation stay exactly as they are.</li>
                            <li>Only {data.branch.name} · {modal.dept.name} is affected — no other department or branch.</li>
                            <li>{picked.name.split(" ")[0]}&apos;s own evaluation (if they are a candidate) stays with the branch default.</li>
                            <li>They sign in with their employee code and evaluator password (Firstname_last-2-digits) to reach the {modal.typeLabel} dashboard.</li>
                        </ul>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {modal.replacing && (
                            <div className="text-[12px] bg-orange-50 border border-orange-100 rounded-lg px-3 py-2">
                                Current POA: <span className="font-bold">{modal.replacing.name}</span>
                                {modal.replacing.empCode ? ` (${modal.replacing.empCode})` : ""}
                            </div>
                        )}
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => { setQuery(e.target.value); setPicked(null); }}
                            placeholder="Search by name or employee code (min 2 characters)…"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#003087]"
                            autoFocus
                        />
                        <div className="space-y-1.5 max-h-72 overflow-y-auto">
                            {searching && <p className="text-[12px] text-gray-400 italic m-0">Searching…</p>}
                            {!searching && query.trim().length >= 2 && candidates.length === 0 && (
                                <p className="text-[12px] text-gray-400 italic m-0">No matching people.</p>
                            )}
                            {candidates.map((c) => {
                                const sel = picked?.id === c.id;
                                return (
                                    <button
                                        key={c.id}
                                        onClick={() => setPicked(c)}
                                        className={`w-full text-left px-3 py-2 rounded-lg border cursor-pointer transition-colors ${sel ? "bg-[#EEF3FB] border-[#003087]" : "bg-white border-[#E0E0E0] hover:bg-gray-50"}`}
                                    >
                                        <PersonLine p={c} />
                                        {c.designation && <p className="m-0 text-[11px] text-gray-400">{c.designation}</p>}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </Modal>

            {/* Remove POA */}
            <ConfirmDialog
                open={!!removeTarget}
                title="Remove department POA?"
                message={removeTarget
                    ? `${removeTarget.delegate.name} will no longer evaluate ${removeTarget.dept.name} as ${removeTarget.typeLabel}. The department immediately falls back to the branch-default ${removeTarget.typeLabel}. Evaluations already submitted are kept unchanged.`
                    : ""}
                confirmLabel="Remove POA"
                cancelLabel="Cancel"
                variant="danger"
                loading={removing}
                onConfirm={submitRemove}
                onCancel={() => !removing && setRemoveTarget(null)}
            />
        </div>
    );
}
