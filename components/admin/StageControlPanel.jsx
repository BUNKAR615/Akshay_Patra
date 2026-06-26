"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../../lib/clientApi";

/**
 * Stage Scheduling panel — the admin workflow console on the Quarter page.
 *
 * Renders one management card per stage (§12) showing status, scheduled and
 * actual times, response progress, and the action buttons. The schedule engine
 * lives server-side (lib/stageScheduler.js); this panel is a thin, polling
 * client over GET/POST /api/admin/quarters/stages. It re-fetches every 20s so
 * automatic open/close/advance transitions appear without a manual refresh.
 *
 * Authoritative source of truth is the server response — the panel never
 * computes status locally, so it can't drift from the engine.
 */

const STATUS_STYLE = {
    SCHEDULED: { chip: "bg-gray-100 text-gray-600 border-gray-300", dot: "bg-gray-400", label: "Scheduled" },
    ACTIVE: { chip: "bg-[#E8F5E9] text-[#00843D] border-[#A5D6A7]", dot: "bg-[#00843D]", label: "Active" },
    PAUSED: { chip: "bg-[#FFF8E1] text-[#F57C00] border-[#FFE082]", dot: "bg-[#F57C00]", label: "Paused" },
    COMPLETED: { chip: "bg-[#E3F2FD] text-ap-blue border-[#90CAF9]", dot: "bg-ap-blue", label: "Completed" },
};

// ── datetime-local ⇄ ISO helpers ──
// datetime-local works in the browser's local timezone; the engine stores
// absolute instants. new Date(localValue) interprets the value as local time,
// so round-tripping through toISOString is timezone-correct.
function toLocalInput(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(value) {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
function fmt(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function StatusChip({ status }) {
    const s = STATUS_STYLE[status] || STATUS_STYLE.SCHEDULED;
    return (
        <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full border whitespace-nowrap ${s.chip}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
            {s.label}
        </span>
    );
}

export default function StageControlPanel({ quarter: quarterProp, onChanged }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState({ stage: 0, action: "" });
    const [msg, setMsg] = useState({ type: "", text: "" });
    const [editing, setEditing] = useState(0); // stageNumber whose schedule form is open
    const [draft, setDraft] = useState({ scheduledStart: "", scheduledEnd: "" });
    const pollRef = useRef(null);

    const load = useCallback(async (showSpinner = true) => {
        if (showSpinner) setLoading(true);
        try {
            const d = await api("/api/admin/quarters/stages");
            setData(d);
        } catch (e) {
            setMsg({ type: "error", text: e.message || "Could not load stage scheduling." });
        }
        if (showSpinner) setLoading(false);
    }, []);

    // Reload when the parent quarter changes (start / close / switch).
    useEffect(() => { load(true); }, [quarterProp?.id, quarterProp?.status, load]);

    // Poll for automatic transitions while the panel is mounted and the quarter
    // is active. Silent refresh — no spinner, no clobbering an open edit form.
    useEffect(() => {
        if (pollRef.current) clearInterval(pollRef.current);
        if (data?.quarter?.status === "ACTIVE") {
            pollRef.current = setInterval(() => { if (!editing) load(false); }, 20000);
        }
        return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }, [data?.quarter?.status, editing, load]);

    const act = async (action, stage, extra = {}) => {
        setBusy({ stage, action });
        setMsg({ type: "", text: "" });
        try {
            const d = await api("/api/admin/quarters/stages", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action, stage, ...extra }),
            });
            setData(d);
            setMsg({ type: "success", text: d.message || "Updated." });
            if (action === "SCHEDULE") setEditing(0);
            onChanged?.();
        } catch (e) {
            setMsg({ type: "error", text: e.message || "Action failed." });
        }
        setBusy({ stage: 0, action: "" });
    };

    const openEdit = (s) => {
        setDraft({ scheduledStart: toLocalInput(s.scheduledStart), scheduledEnd: toLocalInput(s.scheduledEnd) });
        setEditing(s.stageNumber);
        setMsg({ type: "", text: "" });
    };

    const saveSchedule = (stageNumber) => {
        act("SCHEDULE", stageNumber, {
            scheduledStart: fromLocalInput(draft.scheduledStart),
            scheduledEnd: fromLocalInput(draft.scheduledEnd),
        });
    };

    const quarter = data?.quarter || null;
    const closed = quarter?.status === "CLOSED";
    const stages = data?.stages || [];

    if (!loading && !quarter) return null;

    return (
        <div className="bg-white border border-ap-border shadow-card rounded-card p-6">
            <div className="flex items-center justify-between gap-3 mb-1">
                <h3 className="text-lg font-semibold text-ap-blue">Stage Scheduling</h3>
                {quarter && (
                    <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border whitespace-nowrap ${closed ? "bg-[#FFEBEE] text-[#D32F2F] border-[#EF9A9A]" : "bg-[#E3F2FD] text-ap-blue border-[#90CAF9]"}`}>
                        {quarter.name} · {closed ? "Closed" : "Active"}
                    </span>
                )}
            </div>
            <p className="text-sm text-gray-500 mb-4">
                Schedule each stage to open and close automatically, or take manual control at any time. Only one stage is active at a time — starting or resuming a stage pauses the others.
            </p>

            {msg.text && (
                <div className={`mb-4 p-3 rounded-lg text-sm border ${msg.type === "success" ? "bg-ap-blue-50 border-[#90CAF9] text-ap-blue" : "bg-[#FFEBEE] border-[#EF9A9A] text-[#D32F2F]"}`}>
                    {msg.text}
                </div>
            )}

            {loading ? (
                <div className="py-6 text-center text-sm text-gray-500">Loading stage scheduling…</div>
            ) : (
                <>
                    {closed && (
                        <div className="mb-4 bg-[#FFEBEE] border border-[#EF9A9A] text-[#D32F2F] rounded-lg px-4 py-2.5 text-[13px]">
                            This quarter is closed. Stage scheduling is locked and no further submissions are accepted.
                        </div>
                    )}
                    <ol className="space-y-3">
                        {stages.map((s) => (
                            <StageCard
                                key={s.stageNumber}
                                stage={s}
                                closed={closed}
                                busy={busy}
                                editing={editing === s.stageNumber}
                                draft={draft}
                                setDraft={setDraft}
                                onEdit={() => openEdit(s)}
                                onCancelEdit={() => setEditing(0)}
                                onSave={() => saveSchedule(s.stageNumber)}
                                onAct={act}
                            />
                        ))}
                    </ol>
                </>
            )}
        </div>
    );
}

function StageCard({ stage: s, closed, busy, editing, draft, setDraft, onEdit, onCancelEdit, onSave, onAct }) {
    const style = STATUS_STYLE[s.status] || STATUS_STYLE.SCHEDULED;
    const isBusy = busy.stage === s.stageNumber;
    const m = s.metrics || { submitted: 0, total: 0, remaining: 0, percentage: 0 };

    // Intelligent enable/disable (§12). Everything is locked once the quarter
    // is closed or this card has a request in flight.
    const lock = closed || isBusy;
    const canStart = !lock && s.status !== "ACTIVE";
    const canPause = !lock && s.status === "ACTIVE";
    const canResume = !lock && s.status === "PAUSED";
    const canComplete = !lock && s.status !== "COMPLETED";
    const canMoveNext = !lock && s.stageNumber < 5;

    const confirmAct = (action, label) => {
        if (typeof window !== "undefined" && !window.confirm(label)) return;
        onAct(action, s.stageNumber);
    };

    return (
        <li className="border border-ap-border rounded-xl overflow-hidden">
            <div className="flex flex-col gap-3 px-4 py-3.5">
                {/* Header row */}
                <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                        <span className={`w-8 h-8 shrink-0 rounded-full grid place-items-center text-[13px] font-bold text-white ${style.dot}`}>{s.stageNumber}</span>
                        <div className="min-w-0">
                            <p className="font-semibold text-gray-900 text-sm">Stage {s.stageNumber} — {s.label}</p>
                            <p className="text-[12px] text-gray-500 truncate">{s.who}</p>
                        </div>
                    </div>
                    <StatusChip status={s.status} />
                </div>

                {/* Schedule + actuals + progress grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 text-[12px]">
                    <Field label="Scheduled start" value={fmt(s.scheduledStart)} />
                    <Field label="Scheduled end" value={fmt(s.scheduledEnd)} />
                    <Field label="Actual start" value={fmt(s.actualStart)} />
                    <Field label="Actual end" value={fmt(s.actualEnd)} />
                </div>

                {/* Progress (submission stages only) */}
                {s.submission && (
                    <div>
                        <div className="flex items-center justify-between text-[12px] mb-1">
                            <span className="text-gray-500">Responses</span>
                            <span className="text-gray-700 font-semibold">
                                {m.submitted} / {m.total} · {m.remaining} remaining · {m.percentage}%
                            </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                            <div className={`h-full ${style.dot}`} style={{ width: `${Math.min(m.percentage, 100)}%` }} />
                        </div>
                    </div>
                )}

                {/* Inline schedule editor */}
                {editing ? (
                    <div className="bg-ap-blue-50 border border-[#90CAF9] rounded-lg p-3 space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <label className="block">
                                <span className="block text-[12px] text-gray-700 font-medium mb-1">Start date &amp; time</span>
                                <input
                                    type="datetime-local"
                                    value={draft.scheduledStart}
                                    onChange={(e) => setDraft((d) => ({ ...d, scheduledStart: e.target.value }))}
                                    className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-ap-blue"
                                />
                            </label>
                            <label className="block">
                                <span className="block text-[12px] text-gray-700 font-medium mb-1">End date &amp; time</span>
                                <input
                                    type="datetime-local"
                                    value={draft.scheduledEnd}
                                    onChange={(e) => setDraft((d) => ({ ...d, scheduledEnd: e.target.value }))}
                                    className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-ap-blue"
                                />
                            </label>
                        </div>
                        <div className="flex items-center gap-2">
                            <button onClick={onSave} disabled={isBusy} className="min-h-[36px] px-4 py-1.5 text-[13px] font-bold rounded-lg bg-ap-blue text-white hover:bg-ap-green disabled:bg-gray-300 disabled:text-gray-500 cursor-pointer disabled:cursor-not-allowed transition-colors">
                                {isBusy && busy.action === "SCHEDULE" ? "Saving…" : "Save Schedule"}
                            </button>
                            <button onClick={() => setDraft((d) => ({ ...d, scheduledStart: "", scheduledEnd: "" }))} disabled={isBusy} className="min-h-[36px] px-3 py-1.5 text-[13px] font-medium rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 cursor-pointer transition-colors">
                                Clear
                            </button>
                            <button onClick={onCancelEdit} disabled={isBusy} className="min-h-[36px] px-3 py-1.5 text-[13px] font-medium rounded-lg text-gray-500 hover:text-gray-700 cursor-pointer transition-colors ml-auto">
                                Cancel
                            </button>
                        </div>
                    </div>
                ) : (
                    /* Action buttons */
                    <div className="flex flex-wrap items-center gap-2 pt-0.5">
                        <ActionBtn disabled={closed || isBusy} onClick={onEdit} variant="ghost">Edit Schedule</ActionBtn>
                        <ActionBtn disabled={!canStart} onClick={() => onAct("START_NOW", s.stageNumber)} variant="primary" busy={isBusy && busy.action === "START_NOW"}>
                            {s.status === "COMPLETED" ? "Reopen / Start Now" : "Start Now"}
                        </ActionBtn>
                        <ActionBtn disabled={!canPause} onClick={() => onAct("PAUSE", s.stageNumber)} variant="warn" busy={isBusy && busy.action === "PAUSE"}>Pause</ActionBtn>
                        <ActionBtn disabled={!canResume} onClick={() => onAct("RESUME", s.stageNumber)} variant="primary" busy={isBusy && busy.action === "RESUME"}>Resume</ActionBtn>
                        <ActionBtn disabled={!canComplete} onClick={() => confirmAct("COMPLETE", `Complete Stage ${s.stageNumber} now? Submissions will be locked.`)} variant="ghost" busy={isBusy && busy.action === "COMPLETE"}>Complete Stage</ActionBtn>
                        {canMoveNext && (
                            <ActionBtn disabled={!canMoveNext} onClick={() => confirmAct("MOVE_NEXT", `Move to Stage ${s.stageNumber + 1}? Stage ${s.stageNumber} will be completed and Stage ${s.stageNumber + 1} activated.`)} variant="primary" busy={isBusy && busy.action === "MOVE_NEXT"}>Move to Next Stage</ActionBtn>
                        )}
                    </div>
                )}
            </div>
        </li>
    );
}

function Field({ label, value }) {
    return (
        <div className="min-w-0">
            <p className="text-gray-400 uppercase tracking-wide text-[10px] font-semibold">{label}</p>
            <p className="text-gray-700 truncate">{value}</p>
        </div>
    );
}

function ActionBtn({ children, onClick, disabled, variant = "ghost", busy = false }) {
    const styles = {
        primary: "bg-ap-blue text-white hover:bg-ap-green disabled:bg-gray-200 disabled:text-gray-400",
        warn: "bg-white border border-[#F57C00] text-[#F57C00] hover:bg-[#FFF8E1] disabled:opacity-40 disabled:border-gray-200 disabled:text-gray-400",
        ghost: "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:text-gray-400",
    };
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={`min-h-[36px] px-3.5 py-1.5 text-[13px] font-bold rounded-lg cursor-pointer disabled:cursor-not-allowed transition-colors ${styles[variant]}`}
        >
            {busy ? "…" : children}
        </button>
    );
}
