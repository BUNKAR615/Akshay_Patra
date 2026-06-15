"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "../../lib/clientApi";

/**
 * Stage Control panel — lives on the Start Quarter page (QuarterView).
 *
 * Lets the admin run the four evaluation stages sequentially: start the
 * quarter (done by the parent), pause the active stage to unlock the next,
 * resume any unlocked stage, and close the quarter (done by the parent).
 *
 * Self-contained and AUTHORITATIVE: it derives everything it shows from its
 * own GET /api/admin/quarters/stage-state (which always resolves the active
 * quarter), so it can never display a stage state that belongs to a different
 * quarter than the one it controls. The `quarter` prop is used only as a
 * refetch trigger — when the parent starts or closes a quarter, the prop's
 * id/status changes and the panel reloads.
 *
 * The per-stage status logic below mirrors lib/stageControl.js. It is
 * duplicated (not imported) on purpose — that module imports prisma and must
 * never be pulled into a client bundle.
 */

// Kept in sync with STAGE_META in lib/stageControl.js.
const STAGES = [
    { stage: 1, label: "Self Assessment", who: "Employees submit self-assessments" },
    { stage: 2, label: "BM / HOD Evaluation", who: "Branch Managers & HODs evaluate" },
    { stage: 3, label: "Cluster Manager", who: "Cluster Managers evaluate" },
    { stage: 4, label: "HR Evaluation", who: "HR completes the final round" },
];

// "ACTIVE" | "PAUSED" | "LOCKED" for a stage given the live state.
function statusOf(state, stage) {
    if (!state) return "LOCKED";
    if (state.activeStage === stage) return "ACTIVE";
    if (stage <= state.unlockedStage) return "PAUSED";
    return "LOCKED";
}

function StatusChip({ status }) {
    const map = {
        ACTIVE: "bg-[#E8F5E9] text-[#00843D] border-[#A5D6A7]",
        PAUSED: "bg-[#FFF8E1] text-[#F57C00] border-[#FFE082]",
        LOCKED: "bg-gray-100 text-gray-500 border-gray-200",
        CLOSED: "bg-[#FFEBEE] text-[#D32F2F] border-[#EF9A9A]",
    };
    const label = { ACTIVE: "Active", PAUSED: "Paused", LOCKED: "Locked", CLOSED: "Closed" }[status];
    return (
        <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border whitespace-nowrap ${map[status]}`}>
            {label}
        </span>
    );
}

export default function StageControlPanel({ quarter: quarterProp, onChanged }) {
    const [data, setData] = useState(null); // { quarter, state, enabled } from GET
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(0); // stage number being mutated, -1 for INIT, 0 idle
    const [msg, setMsg] = useState({ type: "", text: "" });

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const d = await api("/api/admin/quarters/stage-state");
            setData(d);
        } catch (e) {
            setMsg({ type: "error", text: e.message || "Could not load stage control." });
        }
        setLoading(false);
    }, []);

    // Reload when the parent's quarter changes (start / close / switch).
    useEffect(() => {
        load();
    }, [quarterProp?.id, quarterProp?.status, load]);

    const act = async (action, stage) => {
        setBusy(action === "INIT" ? -1 : stage);
        setMsg({ type: "", text: "" });
        try {
            const d = await api("/api/admin/quarters/stage-state", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action, stage }),
            });
            setData((prev) => ({ ...prev, ...d }));
            setMsg({ type: "success", text: d.message || "Updated." });
            onChanged?.();
        } catch (e) {
            setMsg({ type: "error", text: e.message || "Action failed." });
        }
        setBusy(0);
    };

    const quarter = data?.quarter || null;
    const state = data?.state || null;
    const enabled = !!data?.enabled;
    const closed = quarter?.status === "CLOSED";

    // No quarter to control (none ever started) — show nothing; the Start form
    // on the page is what matters in that case.
    if (!loading && !quarter) return null;

    const activeStage = state?.activeStage || 0;
    const activeMeta = STAGES.find((s) => s.stage === activeStage);

    return (
        <div className="bg-white border border-ap-border shadow-card rounded-card p-6">
            <div className="flex items-center justify-between gap-3 mb-1">
                <h3 className="text-lg font-semibold text-ap-blue">Stage Control</h3>
                {quarter && (
                    <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border whitespace-nowrap ${closed ? "bg-[#FFEBEE] text-[#D32F2F] border-[#EF9A9A]" : "bg-[#E3F2FD] text-ap-blue border-[#90CAF9]"}`}>
                        {quarter.name} · {closed ? "Closed" : "Active"}
                    </span>
                )}
            </div>
            <p className="text-sm text-gray-500 mb-4">
                Run the four evaluation stages one at a time. Pause the active stage to unlock the next; a stage stops accepting submissions while it is paused.
            </p>

            {msg.text && (
                <div className={`mb-4 p-3 rounded-lg text-sm border ${msg.type === "success" ? "bg-ap-blue-50 border-[#90CAF9] text-ap-blue" : "bg-[#FFEBEE] border-[#EF9A9A] text-[#D32F2F]"}`}>
                    {msg.text}
                </div>
            )}

            {loading ? (
                <div className="py-6 text-center text-sm text-gray-500">Loading stage control…</div>
            ) : closed ? (
                <div className="space-y-2.5">
                    <div className="bg-[#FFEBEE] border border-[#EF9A9A] text-[#D32F2F] rounded-lg px-4 py-2.5 text-[13px]">
                        This quarter is closed. Stage control is locked and no further submissions are accepted.
                    </div>
                    <StageList state={state} closed busy={busy} onAct={act} />
                </div>
            ) : !enabled ? (
                // In-flight quarter that predates stage control — opt in explicitly.
                <div className="bg-ap-blue-50 border border-[#90CAF9] rounded-lg px-4 py-4">
                    <p className="text-[13px] text-gray-700 mb-3">
                        Sequential stage control isn&apos;t enabled for this quarter yet. Enabling it sets <span className="font-bold">Stage 1</span> as the active stage; you can then pause forward through the stages. Until enabled, all stages keep accepting submissions as before.
                    </p>
                    <button
                        onClick={() => act("INIT")}
                        disabled={busy !== 0}
                        className="min-h-[40px] px-5 py-2 bg-ap-blue hover:bg-ap-green text-white text-sm font-bold rounded-lg disabled:bg-gray-300 disabled:text-gray-500 cursor-pointer disabled:cursor-not-allowed transition-colors"
                    >
                        {busy === -1 ? "Enabling…" : "Enable Stage Control"}
                    </button>
                </div>
            ) : (
                <>
                    <div className="mb-3 text-[13px] text-gray-700">
                        {activeMeta
                            ? <>Active stage: <span className="font-bold text-ap-blue">Stage {activeMeta.stage} — {activeMeta.label}</span></>
                            : <span className="text-gray-500">No stage is currently active. Resume a stage to reopen submissions.</span>}
                    </div>
                    <StageList state={state} busy={busy} onAct={act} />
                </>
            )}
        </div>
    );
}

function StageList({ state, closed = false, busy, onAct }) {
    return (
        <ol className="space-y-2.5">
            {STAGES.map((s) => {
                const status = closed ? "CLOSED" : statusOf(state, s.stage);
                const isActive = status === "ACTIVE";
                const isLocked = status === "LOCKED";
                const rowBusy = busy === s.stage;
                // Single toggle per stage: Pause when active, otherwise Resume.
                const canToggle = !closed && !rowBusy && (isActive || !isLocked);
                const badgeColor = isActive
                    ? "bg-[#00843D] text-white"
                    : status === "PAUSED"
                        ? "bg-[#F57C00] text-white"
                        : "bg-gray-200 text-gray-500";

                return (
                    <li key={s.stage} className="flex flex-col sm:flex-row sm:items-center gap-3 border border-ap-border rounded-xl px-4 py-3">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                            <span className={`w-7 h-7 shrink-0 rounded-full grid place-items-center text-[13px] font-bold ${badgeColor}`}>
                                {s.stage}
                            </span>
                            <div className="min-w-0">
                                <p className="font-semibold text-gray-900 text-sm">Stage {s.stage} — {s.label}</p>
                                <p className="text-[12px] text-gray-500 truncate">
                                    {isLocked ? `Locked — pause Stage ${s.stage - 1} to unlock.` : s.who}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2.5 shrink-0">
                            <StatusChip status={status} />
                            <button
                                onClick={() => onAct(isActive ? "PAUSE" : "RESUME", s.stage)}
                                disabled={!canToggle}
                                title={isLocked ? `Pause Stage ${s.stage - 1} first` : undefined}
                                className={`min-h-[36px] min-w-[112px] px-4 py-1.5 text-[13px] font-bold rounded-lg cursor-pointer disabled:cursor-not-allowed transition-colors ${
                                    isActive
                                        ? "bg-white border border-[#F57C00] text-[#F57C00] hover:bg-[#FFF8E1] disabled:opacity-50"
                                        : "bg-ap-blue text-white hover:bg-ap-green disabled:bg-gray-200 disabled:text-gray-500"
                                }`}
                            >
                                {rowBusy ? "…" : isActive ? `Pause Stage ${s.stage}` : `Resume Stage ${s.stage}`}
                            </button>
                        </div>
                    </li>
                );
            })}
        </ol>
    );
}
