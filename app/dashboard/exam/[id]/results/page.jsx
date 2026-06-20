"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ModuleShell from "../../../../../components/shell/ModuleShell";
import { Icon } from "../../../../../components/ui/Icons";
import { api } from "../../../../../lib/clientApi";
import { SkeletonCard } from "../../../../../components/Skeleton";

const PART_STATS = [
    { key: "invited", label: "Invited", sub: "all branches", color: "#003087", tint: "#EEF3FB", icon: "users" },
    { key: "started", label: "Started", subKey: "startedPct", color: "#0369A1", tint: "#EFF6FF", icon: "play" },
    { key: "completed", label: "Completed", subKey: "completedPct", color: "#00843D", tint: "#EBF7F1", icon: "check" },
    { key: "pending", label: "Pending", sub: "not started", color: "#B45309", tint: "#FFFBEB", icon: "hourglass" },
];

export default function ExamResultsPage() {
    const { id } = useParams();
    const router = useRouter();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try { setData(await api(`/api/exam/${id}/results`)); }
            catch (e) { console.error("[Exam results] load failed:", e); }
            finally { setLoading(false); }
        })();
    }, [id]);

    const exam = data?.exam;
    const p = data?.participation || {};
    const lb = data?.leaderboard || [];

    const exportRanks = () => {
        const rows = [["Rank", "Employee", "Branch", "Department", "Marks", "Result"],
            ...lb.map((r) => [r.rank, r.name, r.branch, r.dept, r.marks, r.result])];
        const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
        const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
        const a = document.createElement("a");
        a.href = url; a.download = `${exam?.title || "exam"}-ranks.csv`; a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <ModuleShell moduleId="exam" crumb="Results" activeNavId="results">
            <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
                <div>
                    <button onClick={() => router.push("/dashboard/exam")} className="text-[12.5px] font-bold text-ap-text-muted hover:text-ap-text cursor-pointer mb-1 inline-flex items-center gap-1">
                        ← All exams
                    </button>
                    <h1 className="text-[27px] font-extrabold text-ap-text tracking-tight">{exam?.title || "Exam results"}</h1>
                    <p className="text-[13.5px] text-ap-text-muted mt-1">Live participation &amp; performance analytics.</p>
                </div>
                <div className="flex items-center gap-2.5">
                    <button onClick={exportRanks} className="inline-flex items-center gap-1.5 text-[13px] font-bold text-ap-text-muted border border-ap-border rounded-[10px] px-3 py-2 hover:bg-ap-bg cursor-pointer">
                        <Icon name="doc" size={15} /> Export
                    </button>
                    {exam?.status === "ACTIVE" && (
                        <span style={{ background: "#EBF7F1", borderColor: "#A3D9BC", color: "#006B32" }} className="text-[11px] font-bold border px-2.5 py-1.5 rounded-full inline-flex items-center gap-1.5">
                            <span style={{ background: "#00843D" }} className="w-1.5 h-1.5 rounded-full" /> Live
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
                                <span style={{ background: s.tint, color: s.color }} className="w-[30px] h-[30px] rounded-lg flex items-center justify-center mb-2.5">
                                    <Icon name={s.icon} size={17} />
                                </span>
                                <p className="text-[25px] font-extrabold text-ap-text leading-none">{p[s.key] ?? 0}</p>
                                <p className="text-[12px] text-ap-text-muted mt-1">{s.label}
                                    <span className="text-ap-text-faint"> · {s.subKey ? `${p[s.subKey] ?? 0}% of invited` : s.sub}</span>
                                </p>
                            </div>
                        ))}
                    </div>

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
                                    <span key={l} className="inline-flex items-center gap-1.5 text-[11px] text-ap-text-muted">
                                        <span style={{ background: c }} className="w-2 h-2 rounded-full" />{l}
                                    </span>
                                ))}
                            </div>
                        </ChartCard>
                        <ChartCard title="Score distribution" wide>
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

                    {/* Bottom row */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
                        <ChartCard title="Completion by branch">
                            <div className="space-y-2.5 pt-1">
                                {(data.branchBars || []).length === 0 && <p className="text-ap-text-muted text-[13px]">No branch data yet.</p>}
                                {(data.branchBars || []).map((b) => (
                                    <div key={b.name} className="flex items-center gap-3">
                                        <span className="text-[12px] text-ap-text-muted w-[150px] truncate">{b.name}</span>
                                        <div className="flex-1 h-[10px] bg-gray-100 rounded-full overflow-hidden">
                                            <div style={{ width: `${b.pct}%`, background: b.color }} className="h-full rounded-full transition-all" />
                                        </div>
                                        <span className="text-[12px] font-bold text-ap-text w-9 text-right">{b.pct}%</span>
                                    </div>
                                ))}
                            </div>
                        </ChartCard>
                        <ChartCard title={data.answerDist?.questionText ? `Answer distribution` : "Answer distribution"}>
                            {data.answerDist?.questionText ? (
                                <>
                                    <p className="text-[12.5px] text-ap-text mb-3 font-semibold line-clamp-2">{data.answerDist.questionText}</p>
                                    <div className="space-y-2">
                                        {data.answerDist.options.map((o) => (
                                            <div key={o.label} className="flex items-center gap-3">
                                                <span className="text-[12px] text-ap-text-muted w-[150px] truncate" style={{ color: o.correct ? "#006B32" : undefined, fontWeight: o.correct ? 700 : 400 }}>{o.label}</span>
                                                <div className="flex-1 h-[10px] bg-gray-100 rounded-full overflow-hidden">
                                                    <div style={{ width: `${o.pct}%`, background: o.color }} className="h-full rounded-full" />
                                                </div>
                                                <span className="text-[12px] font-bold text-ap-text w-9 text-right">{o.pct}%</span>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            ) : <p className="text-ap-text-muted text-[13px]">No choice questions to analyze.</p>}
                        </ChartCard>
                    </div>

                    {/* Leaderboard */}
                    <div className="bg-white border border-ap-border rounded-[16px] p-[22px]">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-[16px] font-extrabold text-ap-text">Leaderboard — marks &amp; rank</h3>
                            <button onClick={exportRanks} className="text-[12.5px] font-bold text-ap-text-muted hover:text-ap-text cursor-pointer">Export ranks</button>
                        </div>
                        {lb.length === 0 ? (
                            <p className="text-ap-text-muted text-[13px]">No completed responses yet.</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <div className="min-w-[640px] space-y-1.5">
                                    <div className="grid items-center gap-3.5 px-3 pb-2 text-[10.5px] font-bold uppercase tracking-wider text-ap-text-faint" style={{ gridTemplateColumns: "48px 1fr 200px 96px 96px" }}>
                                        <span>Rank</span><span>Employee</span><span>Marks</span><span>Score</span><span>Result</span>
                                    </div>
                                    {lb.map((r) => (
                                        <div key={r.rank} style={{ background: r.rowBg, gridTemplateColumns: "48px 1fr 200px 96px 96px" }} className="grid items-center gap-3.5 px-3 py-2.5 rounded-xl border border-transparent hover:border-ap-border transition">
                                            <span style={{ background: r.rankBg, color: r.rankTx }} className="w-8 h-8 rounded-[10px] flex items-center justify-center text-[13px] font-extrabold shrink-0">{r.rank}</span>
                                            <div className="flex items-center gap-2.5 min-w-0">
                                                <span style={{ background: "#EEF3FB", color: "#003087" }} className="w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-bold shrink-0">{r.initials}</span>
                                                <div className="min-w-0">
                                                    <p className="text-[14px] font-bold text-ap-text truncate">{r.name}</p>
                                                    <p className="text-[11.5px] text-ap-text-muted truncate">{r.branch} · {r.dept}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <div className="flex-1 h-[6px] bg-gray-100 rounded-full overflow-hidden">
                                                    <div style={{ width: `${r.marks}%`, background: r.barColor }} className="h-full rounded-full" />
                                                </div>
                                                <span className="text-[11px] text-ap-text-faint w-8 text-right">{r.time}</span>
                                            </div>
                                            <div>
                                                <span style={{ color: r.marksColor }} className="text-[18px] font-extrabold">{r.marks}</span>
                                                <span className="text-[11px] text-ap-text-faint">/100</span>
                                            </div>
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

function ChartCard({ title, children, wide }) {
    return (
        <div className={`bg-white border border-ap-border rounded-[16px] p-5 ${wide ? "lg:col-span-1" : ""}`}>
            <h3 className="text-[14px] font-extrabold text-ap-text mb-3">{title}</h3>
            {children}
        </div>
    );
}

function Donut({ gradient, center }) {
    return (
        <div className="flex justify-center">
            <div className="relative w-[150px] h-[150px] rounded-full" style={{ background: gradient }}>
                <div className="absolute inset-[18px] bg-white rounded-full flex flex-col items-center justify-center">
                    {center}
                </div>
            </div>
        </div>
    );
}
