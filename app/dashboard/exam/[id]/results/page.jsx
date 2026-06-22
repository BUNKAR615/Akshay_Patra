"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ModuleShell from "../../../../../components/shell/ModuleShell";
import { Icon } from "../../../../../components/ui/Icons";
import { api } from "../../../../../lib/clientApi";
import { SkeletonCard } from "../../../../../components/Skeleton";
import { fmtDateTime, toDateTimeLocal } from "../../../../../lib/formatDateTime";

const PART_STATS = [
    { key: "invited", label: "Invited", sub: "all branches", color: "#003087", tint: "#EEF3FB", icon: "users" },
    { key: "started", label: "Started", subKey: "startedPct", color: "#0369A1", tint: "#EFF6FF", icon: "play" },
    { key: "completed", label: "Completed", subKey: "completedPct", color: "#00843D", tint: "#EBF7F1", icon: "check" },
    { key: "pending", label: "Pending", sub: "not started", color: "#B45309", tint: "#FFFBEB", icon: "hourglass" },
];

function timeAgo(iso) {
    const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
}

export default function ExamResultsPage() {
    const { id } = useParams();
    const router = useRouter();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    const reload = async () => {
        try { setData(await api(`/api/exam/${id}/results`)); }
        catch (e) { console.error("[Exam results] load failed:", e); }
    };

    useEffect(() => {
        (async () => {
            await reload();
            setLoading(false);
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    const exam = data?.exam;
    const p = data?.participation || {};
    const lb = data?.leaderboard || [];
    const split = data?.split || { internal: 0, external: 0 };
    const reg = data?.registration || { total: 0 };

    const exportRanks = () => {
        const rows = [["Rank", "Name", "Type", "Branch", "Department", "Marks", "Result"],
            ...lb.map((r) => [r.rank, r.name, r.external ? "External" : "Internal", r.branch, r.dept, r.marks, r.result])];
        const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
        const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
        const a = document.createElement("a");
        a.href = url; a.download = `${exam?.title || "exam"}-ranks.csv`; a.click();
        URL.revokeObjectURL(url);
    };

    const splitTotal = Math.max(1, split.internal + split.external);
    const intPct = Math.round((split.internal / splitTotal) * 100);

    return (
        <ModuleShell moduleId="exam" crumb="Results" activeNavId="results">
            <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
                <div>
                    <button onClick={() => router.push("/dashboard/exam")} className="text-[12.5px] font-bold text-ap-text-muted hover:text-ap-text cursor-pointer mb-1 inline-flex items-center gap-1">← All exams</button>
                    <h1 className="text-[27px] font-extrabold text-ap-text tracking-tight">{exam?.title || "Exam results"}</h1>
                    <p className="text-[13.5px] text-ap-text-muted mt-1">Live participation &amp; performance analytics.</p>
                </div>
                <div className="flex items-center gap-2.5">
                    {reg.total > 0 && (
                        <button onClick={() => router.push(`/dashboard/exam/${id}/registrants`)} className="text-[13px] font-bold text-ap-text-muted border border-ap-border rounded-[10px] px-3 py-2 hover:bg-ap-bg cursor-pointer">Registrants</button>
                    )}
                    <button onClick={exportRanks} className="inline-flex items-center gap-1.5 text-[13px] font-bold text-ap-text-muted border border-ap-border rounded-[10px] px-3 py-2 hover:bg-ap-bg cursor-pointer"><Icon name="doc" size={15} /> Export</button>
                    {exam?.status === "ACTIVE" && (
                        <span style={{ background: "#EBF7F1", borderColor: "#A3D9BC", color: "#006B32" }} className="text-[11px] font-bold border px-2.5 py-1.5 rounded-full inline-flex items-center gap-1.5">
                            <span style={{ background: "#00843D" }} className="w-1.5 h-1.5 rounded-full animate-pulse" /> Live
                        </span>
                    )}
                </div>
            </div>

            {loading ? <SkeletonCard lines={8} /> : !data ? (
                <div className="bg-white border border-ap-border rounded-[16px] p-12 text-center text-ap-text-muted">Could not load results.</div>
            ) : (
                <>
                    {/* Participation stats */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 mb-5">
                        {PART_STATS.map((s) => (
                            <div key={s.key} className="bg-white border border-ap-border rounded-[14px] p-[18px]" style={{ borderTop: `3px solid ${s.color}` }}>
                                <span style={{ background: s.tint, color: s.color }} className="w-[30px] h-[30px] rounded-lg flex items-center justify-center mb-2.5"><Icon name={s.icon} size={17} /></span>
                                <p className="text-[25px] font-extrabold text-ap-text leading-none">{p[s.key] ?? 0}</p>
                                <p className="text-[12px] text-ap-text-muted mt-1">{s.label}<span className="text-ap-text-faint"> · {s.subKey ? `${p[s.subKey] ?? 0}% of invited` : s.sub}</span></p>
                            </div>
                        ))}
                    </div>

                    {/* Admin management — schedule & visibility */}
                    <ManagePanel exam={exam} id={id} onChange={reload} />

                    {/* Charts row */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
                        <ChartCard title="Completion rate">
                            <Donut
                                gradient={`conic-gradient(#00843D 0 ${p.completedPct || 0}%, #EEF2F7 ${p.completedPct || 0}% 100%)`}
                                center={<><span className="text-[26px] font-extrabold text-ap-text">{p.completedPct || 0}%</span><span className="text-[11px] text-ap-text-muted">{p.completed} / {p.invited}</span></>}
                            />
                        </ChartCard>
                        <ChartCard title="Participation">
                            <Donut
                                gradient={`conic-gradient(#00843D 0 ${p.completedPct || 0}%, #F7941D ${p.completedPct || 0}% ${p.startedPct || 0}%, #CBD5E1 ${p.startedPct || 0}% 100%)`}
                                center={<><span className="text-[20px] font-extrabold text-ap-text">{p.invited}</span><span className="text-[11px] text-ap-text-muted">invited</span></>}
                            />
                            <div className="flex justify-center gap-3 mt-3 flex-wrap">
                                {[["Completed", "#00843D"], ["Started", "#F7941D"], ["Pending", "#CBD5E1"]].map(([l, c]) => (
                                    <span key={l} className="inline-flex items-center gap-1.5 text-[11px] text-ap-text-muted"><span style={{ background: c }} className="w-2 h-2 rounded-full" />{l}</span>
                                ))}
                            </div>
                        </ChartCard>
                        <ChartCard title="Score distribution">
                            <div className="flex items-end justify-between gap-2 h-[150px] pt-2">
                                {(data.scoreDist || []).map((b) => {
                                    const max = Math.max(...data.scoreDist.map((x) => x.count), 1);
                                    const h = Math.round((b.count / max) * 116) + 6;
                                    return (
                                        <div key={b.range} className="flex-1 flex flex-col items-center justify-end gap-1.5">
                                            <span className="text-[11px] font-bold text-ap-text">{b.count}</span>
                                            <div style={{ height: h, background: b.color }} className="w-full rounded-t-md transition-all" />
                                            <span className="text-[9.5px] text-ap-text-faint">{b.range}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </ChartCard>
                    </div>

                    {/* Audience composition + live tracking */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
                        <ChartCard title="Internal vs external">
                            <div className="flex items-baseline gap-2 mb-3">
                                <span className="text-[28px] font-extrabold text-ap-text leading-none">{split.internal + split.external}</span>
                                <span className="text-[12px] text-ap-text-muted">completed</span>
                            </div>
                            <div className="h-[12px] rounded-full overflow-hidden flex bg-gray-100">
                                <div style={{ width: `${intPct}%`, background: "#003087" }} />
                                <div style={{ width: `${100 - intPct}%`, background: "#F7941D" }} />
                            </div>
                            <div className="flex justify-between mt-3 text-[12px]">
                                <span className="inline-flex items-center gap-1.5"><span style={{ background: "#003087" }} className="w-2.5 h-2.5 rounded-full" /><b className="text-ap-text">{split.internal}</b> <span className="text-ap-text-muted">internal</span></span>
                                <span className="inline-flex items-center gap-1.5"><span style={{ background: "#F7941D" }} className="w-2.5 h-2.5 rounded-full" /><b className="text-ap-text">{split.external}</b> <span className="text-ap-text-muted">external</span></span>
                            </div>
                        </ChartCard>

                        <ChartCard title="Registration funnel">
                            {reg.total === 0 ? <p className="text-ap-text-muted text-[13px]">No external registrations.</p> : (
                                <div className="space-y-2.5 pt-1">
                                    {[["Approved", reg.approved, "#00843D"], ["Pending", reg.pending, "#F7941D"], ["Rejected", reg.rejected, "#DC2626"]].map(([l, n, c]) => (
                                        <div key={l} className="flex items-center gap-3">
                                            <span className="text-[12px] text-ap-text-muted w-20">{l}</span>
                                            <div className="flex-1 h-[10px] bg-gray-100 rounded-full overflow-hidden"><div style={{ width: `${Math.round((n / reg.total) * 100)}%`, background: c }} className="h-full rounded-full" /></div>
                                            <span className="text-[12px] font-bold text-ap-text w-7 text-right">{n}</span>
                                        </div>
                                    ))}
                                    <p className="text-[11.5px] text-ap-text-faint pt-1">{reg.total} total registrations</p>
                                </div>
                            )}
                        </ChartCard>

                        <ChartCard title={<span className="inline-flex items-center gap-1.5">Live activity {p.inProgress > 0 && <span style={{ background: "#FEF4E8", color: "#C2410C" }} className="text-[10px] font-bold px-2 py-0.5 rounded-full">{p.inProgress} in progress</span>}</span>}>
                            {(data.recent || []).length === 0 ? <p className="text-ap-text-muted text-[13px]">No submissions yet.</p> : (
                                <div className="space-y-2 pt-1">
                                    {data.recent.map((r, i) => (
                                        <div key={i} className="flex items-center gap-2.5">
                                            <span style={{ background: r.external ? "#FEF4E8" : "#EEF3FB", color: r.external ? "#C2410C" : "#003087" }} className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0">{r.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}</span>
                                            <div className="min-w-0 flex-1">
                                                <p className="text-[12.5px] font-semibold text-ap-text truncate">{r.name}</p>
                                                <p className="text-[11px] text-ap-text-faint">{timeAgo(r.at)} · {r.branch}</p>
                                            </div>
                                            <span style={{ color: r.marks >= (exam?.passMark ?? 70) ? "#006B32" : "#B45309" }} className="text-[13px] font-extrabold shrink-0">{r.marks}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </ChartCard>
                    </div>

                    {/* Completion by branch & department */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
                        <BreakdownCard title="Completion by branch" rows={data.branchBars} />
                        <BreakdownCard title="Completion by department" rows={data.deptBars} />
                    </div>

                    {/* Per-question analytics */}
                    {(data.questionStats || []).length > 0 && (
                        <div className="bg-white border border-ap-border rounded-[16px] p-[22px] mb-5">
                            <h3 className="text-[16px] font-extrabold text-ap-text mb-4">Question analytics</h3>
                            <div className="flex flex-col gap-4">
                                {data.questionStats.map((q, i) => <QuestionStat key={q.id} q={q} n={i + 1} segColors={data.segColors} />)}
                            </div>
                        </div>
                    )}

                    {/* Leaderboard */}
                    <div className="bg-white border border-ap-border rounded-[16px] p-[22px]">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-[16px] font-extrabold text-ap-text">Leaderboard — marks &amp; rank</h3>
                            <button onClick={exportRanks} className="text-[12.5px] font-bold text-ap-text-muted hover:text-ap-text cursor-pointer">Export ranks</button>
                        </div>
                        {lb.length === 0 ? <p className="text-ap-text-muted text-[13px]">No completed responses yet.</p> : (
                            <div className="overflow-x-auto">
                                <div className="min-w-[640px] space-y-1.5">
                                    <div className="grid items-center gap-3.5 px-3 pb-2 text-[10.5px] font-bold uppercase tracking-wider text-ap-text-faint" style={{ gridTemplateColumns: "48px 1fr 200px 96px 96px" }}>
                                        <span>Rank</span><span>Participant</span><span>Marks</span><span>Score</span><span>Result</span>
                                    </div>
                                    {lb.map((r) => (
                                        <div key={r.rank} style={{ background: r.rowBg, gridTemplateColumns: "48px 1fr 200px 96px 96px" }} className="grid items-center gap-3.5 px-3 py-2.5 rounded-xl border border-transparent hover:border-ap-border transition">
                                            <span style={{ background: r.rankBg, color: r.rankTx }} className="w-8 h-8 rounded-[10px] flex items-center justify-center text-[13px] font-extrabold shrink-0">{r.rank}</span>
                                            <div className="flex items-center gap-2.5 min-w-0">
                                                <span style={{ background: "#EEF3FB", color: "#003087" }} className="w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-bold shrink-0">{r.initials}</span>
                                                <div className="min-w-0">
                                                    <p className="text-[14px] font-bold text-ap-text truncate flex items-center gap-1.5">{r.name}{r.external && <span style={{ background: "#FEF4E8", color: "#C2410C" }} className="text-[9.5px] font-bold px-1.5 py-px rounded-full">EXT</span>}</p>
                                                    <p className="text-[11.5px] text-ap-text-muted truncate">{r.branch} · {r.dept}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <div className="flex-1 h-[6px] bg-gray-100 rounded-full overflow-hidden"><div style={{ width: `${r.marks}%`, background: r.barColor }} className="h-full rounded-full" /></div>
                                                <span className="text-[11px] text-ap-text-faint w-8 text-right">{r.time}</span>
                                            </div>
                                            <div><span style={{ color: r.marksColor }} className="text-[18px] font-extrabold">{r.marks}</span><span className="text-[11px] text-ap-text-faint">/100</span></div>
                                            <span style={{ background: r.resultBg, color: r.resultTx }} className="justify-self-start text-[11px] font-bold px-2.5 py-1 rounded-full">{r.result}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </>
            )}
        </ModuleShell>
    );
}

function ManagePanel({ exam, id, onChange }) {
    // Pending (staged) edits — nothing is saved until "Apply changes" is clicked.
    const [when, setWhen] = useState(() => toDateTimeLocal(exam?.dueDate));
    const [hidden, setHidden] = useState(() => !!exam?.hiddenFromEmployees);
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState("");

    // Re-sync the staged values whenever the exam reloads (e.g. after applying).
    useEffect(() => {
        setWhen(toDateTimeLocal(exam?.dueDate));
        setHidden(!!exam?.hiddenFromEmployees);
    }, [exam?.dueDate, exam?.hiddenFromEmployees]);

    if (!exam) return null;
    const created = fmtDateTime(exam.createdAt);
    const ends = fmtDateTime(exam.dueDate);
    const closed = exam.closed;

    // What's changed vs the saved exam.
    const scheduleDirty = when !== toDateTimeLocal(exam.dueDate);
    const hiddenDirty = hidden !== !!exam.hiddenFromEmployees;
    const dirty = scheduleDirty || hiddenDirty;

    // Preview of the staged end time / state.
    const pendingMs = when ? new Date(when).getTime() : null;
    const willBeOpen = pendingMs == null || pendingMs > Date.now();
    const reopening = closed && willBeOpen && scheduleDirty;

    const reset = () => {
        setWhen(toDateTimeLocal(exam.dueDate));
        setHidden(!!exam.hiddenFromEmployees);
        setMsg("");
    };

    const apply = async () => {
        if (!dirty) return;
        const summary = [];
        if (scheduleDirty) summary.push(when ? `end time → ${fmtDateTime(new Date(when))}` : "remove end time");
        if (hiddenDirty) summary.push(hidden ? "remove from employees' lists" : "restore to employees' lists");
        if (!window.confirm(`Apply these changes?\n\n• ${summary.join("\n• ")}`)) return;

        const body = {};
        if (scheduleDirty) {
            body.dueDate = when ? new Date(when).toISOString() : null;
            // Reopen the exam when the new end time leaves it open again.
            if (willBeOpen && (closed || exam.status === "COMPLETED")) body.status = "ACTIVE";
        }
        if (hiddenDirty) body.hiddenFromEmployees = hidden;

        setBusy(true); setMsg("");
        try {
            await api(`/api/exam/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
            setMsg("Changes applied and saved.");
            await onChange();
        } catch (e) {
            setMsg(e?.message || "Could not apply the changes.");
        } finally { setBusy(false); }
    };

    const quickBtn = "text-[12.5px] font-bold border border-ap-border rounded-[9px] px-3 py-1.5 cursor-pointer hover:bg-ap-bg transition";

    return (
        <div className="bg-white border border-ap-border rounded-[16px] p-[22px] mb-5">
            <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
                <div>
                    <h3 className="text-[16px] font-extrabold text-ap-text">Schedule &amp; visibility</h3>
                    <p className="text-[12.5px] text-ap-text-muted mt-0.5">Stage your changes, then click <b>Apply changes</b> to save.</p>
                </div>
                <div className="flex items-center gap-4 text-[12px]">
                    <div>
                        <p className="text-[10.5px] font-bold uppercase tracking-wider text-ap-text-faint">Created</p>
                        <p className="text-ap-text font-semibold mt-0.5">{created || "—"}</p>
                    </div>
                    <div>
                        <p className="text-[10.5px] font-bold uppercase tracking-wider text-ap-text-faint">Ends</p>
                        <p className="font-semibold mt-0.5" style={{ color: closed ? "#DC2626" : "#1E293B" }}>{ends || "No end time"}{closed ? " · closed" : ""}</p>
                    </div>
                </div>
            </div>

            {/* End date & time */}
            <div className="flex items-end gap-3 flex-wrap">
                <label className="flex flex-col gap-1">
                    <span className="text-[11.5px] font-bold text-ap-text-muted">End date &amp; time</span>
                    <input
                        type="datetime-local"
                        value={when}
                        onChange={(e) => setWhen(e.target.value)}
                        className="border border-ap-border rounded-[10px] px-3 py-2 text-[13.5px] outline-none focus:border-ap-orange"
                    />
                </label>
                <div className="flex items-center gap-2 pb-0.5">
                    <button type="button" onClick={() => setWhen("")} className={quickBtn}>Clear end time</button>
                    <button type="button" onClick={() => setWhen(toDateTimeLocal(new Date()))} className={quickBtn}>Close now</button>
                </div>
            </div>

            {/* Visibility */}
            <div className="mt-4 flex items-center gap-3 flex-wrap">
                <span className="text-[11.5px] font-bold text-ap-text-muted">Employee visibility</span>
                <button
                    type="button"
                    onClick={() => setHidden((h) => !h)}
                    style={hidden ? { background: "#FEF2F2", color: "#DC2626", borderColor: "#FCA5A5" } : { background: "#EBF7F1", color: "#006B32", borderColor: "#A3D9BC" }}
                    className="text-[12.5px] font-bold border rounded-[9px] px-3.5 py-1.5 cursor-pointer transition"
                >
                    {hidden ? "Removed from employees" : "Visible to employees"}
                </button>
                <span className="text-[11.5px] text-ap-text-faint">Click to {hidden ? "restore" : "remove"}</span>
            </div>

            {/* Apply / discard */}
            <div className="mt-5 pt-4 border-t border-ap-border flex items-center gap-3 flex-wrap">
                <button
                    type="button"
                    onClick={apply}
                    disabled={!dirty || busy}
                    style={{ background: dirty ? "#00843D" : "#CBD5E1" }}
                    className="text-white text-[13.5px] font-extrabold rounded-[11px] px-5 py-2.5 cursor-pointer disabled:cursor-not-allowed transition hover:brightness-105"
                >
                    {busy ? "Applying…" : "Apply changes & save"}
                </button>
                <button type="button" onClick={reset} disabled={!dirty || busy} className="text-[13px] font-bold text-ap-text-muted border border-ap-border rounded-[11px] px-4 py-2.5 cursor-pointer disabled:opacity-50 hover:bg-ap-bg">Discard</button>
                {dirty && (
                    <span className="text-[12px] font-semibold text-[#B45309]">
                        Unsaved: {[scheduleDirty && (reopening ? "reopen & reschedule" : when ? "new end time" : "remove end time"), hiddenDirty && (hidden ? "remove from employees" : "restore to employees")].filter(Boolean).join(" · ")}
                    </span>
                )}
                {!dirty && msg && <span className="text-[12.5px] font-semibold text-[#006B32]">{msg}</span>}
            </div>
            {dirty && msg && <p className="text-[12.5px] font-semibold text-red-600 mt-2">{msg}</p>}
        </div>
    );
}

function ChartCard({ title, children }) {
    return (
        <div className="bg-white border border-ap-border rounded-[16px] p-5">
            <h3 className="text-[14px] font-extrabold text-ap-text mb-3">{title}</h3>
            {children}
        </div>
    );
}

function Donut({ gradient, center }) {
    return (
        <div className="flex justify-center">
            <div className="relative w-[150px] h-[150px] rounded-full" style={{ background: gradient }}>
                <div className="absolute inset-[18px] bg-white rounded-full flex flex-col items-center justify-center">{center}</div>
            </div>
        </div>
    );
}

function BreakdownCard({ title, rows }) {
    return (
        <ChartCard title={title}>
            <div className="space-y-2.5 pt-1">
                {(rows || []).length === 0 && <p className="text-ap-text-muted text-[13px]">No data yet.</p>}
                {(rows || []).map((b) => (
                    <div key={b.name} className="flex items-center gap-3">
                        <span className="text-[12px] text-ap-text-muted w-[150px] truncate" title={b.name}>{b.name}</span>
                        <div className="flex-1 h-[10px] bg-gray-100 rounded-full overflow-hidden"><div style={{ width: `${b.pct}%`, background: b.color }} className="h-full rounded-full transition-all" /></div>
                        <span className="text-[12px] font-bold text-ap-text w-14 text-right">{b.completed}/{b.invited || b.completed}</span>
                    </div>
                ))}
            </div>
        </ChartCard>
    );
}

const Q_TYPE_LABEL = { SINGLE: "Single choice", MULTIPLE: "Multiple choice", TRUE_FALSE: "True / False", POLL: "Poll", PICTURE: "Picture", RATING: "Rating", LIKERT: "Likert", RANKING: "Ranking", WORD_CLOUD: "Word cloud", SHORT: "Short answer", LONG: "Long answer" };

function QuestionStat({ q, n, segColors }) {
    return (
        <div className="border border-ap-border rounded-[14px] p-4">
            <div className="flex items-center gap-2 mb-1">
                <span className="text-[11px] font-extrabold text-ap-text">Q{n}</span>
                <span style={{ background: "#F1F5F9", color: "#475569" }} className="text-[10px] font-bold px-2 py-0.5 rounded-full">{Q_TYPE_LABEL[q.type] || q.type}</span>
                <span className="text-[11px] text-ap-text-faint ml-auto">{q.responses} responses</span>
            </div>
            <p className="text-[13px] font-semibold text-ap-text mb-3 line-clamp-2">{q.text}</p>

            {q.kind === "choice" && (
                <div className="space-y-1.5">
                    {q.options.map((o) => (
                        <div key={o.label} className="flex items-center gap-2.5">
                            <span className="text-[11.5px] w-[120px] truncate" style={{ color: o.correct ? "#006B32" : "#64748B", fontWeight: o.correct ? 700 : 500 }} title={o.label}>{o.label}</span>
                            <div className="flex-1 h-[9px] bg-gray-100 rounded-full overflow-hidden"><div style={{ width: `${o.pct}%`, background: o.correct ? "#00843D" : "#94A3B8" }} className="h-full rounded-full" /></div>
                            <span className="text-[11.5px] font-bold text-ap-text w-8 text-right">{o.pct}%</span>
                        </div>
                    ))}
                </div>
            )}

            {q.kind === "scale" && (
                <div>
                    <div className="flex items-baseline gap-2 mb-2"><span className="text-[22px] font-extrabold" style={{ color: "#6D28D9" }}>{q.average}</span><span className="text-[11.5px] text-ap-text-muted">/ {q.max} average</span></div>
                    <div className="flex items-end gap-1.5 h-[64px]">
                        {q.dist.map((d) => {
                            const max = Math.max(1, ...q.dist.map((x) => x.count));
                            return (
                                <div key={d.value} className="flex-1 flex flex-col items-center justify-end gap-1">
                                    <div style={{ height: `${Math.round((d.count / max) * 50) + 4}px`, background: "#C4B5FD" }} className="w-full rounded-t" />
                                    <span className="text-[10px] text-ap-text-faint">{d.value}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {q.kind === "ranking" && (
                <div className="space-y-1.5">
                    {q.items.map((it, i) => (
                        <div key={it.label} className="flex items-center gap-2.5">
                            <span style={{ background: segColors[i % segColors.length] }} className="w-5 h-5 rounded text-white text-[10px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                            <span className="text-[12px] text-ap-text flex-1 truncate">{it.label}</span>
                            <span className="text-[11px] text-ap-text-faint">avg {it.avgRank}</span>
                        </div>
                    ))}
                </div>
            )}

            {q.kind === "words" && (
                q.words.length === 0 ? <p className="text-ap-text-faint text-[12px]">No responses yet.</p> : (
                    <div className="flex flex-wrap gap-1.5 items-center">
                        {q.words.map((w) => (
                            <span key={w.text} style={{ fontSize: w.size, color: segColors[w.text.length % segColors.length] }} className="font-bold leading-none">{w.text}</span>
                        ))}
                    </div>
                )
            )}

            {q.kind === "text" && (
                q.samples.length === 0 ? <p className="text-ap-text-faint text-[12px]">No responses yet.</p> : (
                    <div className="space-y-1.5">
                        {q.samples.map((s, i) => <p key={i} className="text-[12px] text-ap-text-muted border-l-2 border-ap-border pl-2.5 line-clamp-2">“{s}”</p>)}
                    </div>
                )
            )}
        </div>
    );
}
