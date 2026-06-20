"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ModuleShell from "../../../components/shell/ModuleShell";
import { Icon } from "../../../components/ui/Icons";
import { api } from "../../../lib/clientApi";
import { SkeletonCard } from "../../../components/Skeleton";

const STATUS_BADGE = {
    ACTIVE: { bg: "#EBF7F1", tx: "#006B32", bd: "#A3D9BC", label: "Active" },
    DRAFT: { bg: "#F3F4F6", tx: "#374151", bd: "#D1D5DB", label: "Draft" },
    COMPLETED: { bg: "#EEF3FB", tx: "#003087", bd: "#C7D9F5", label: "Completed" },
    SCHEDULED: { bg: "#FEF4E8", tx: "#C2410C", bd: "#FAD4A0", label: "Scheduled" },
};

const AUD_ICON = { ALL: "building", BRANCH: "pin", DEPT: "grid", BM: "users", RM: "star", RANDOM: "shuffle", CUSTOM: "grid", null: "grid" };

const KPI_DEFS = [
    { key: "total", label: "Total Exams", icon: "exam", tint: "#FEF4E8", color: "#C2410C" },
    { key: "active", label: "Active Now", icon: "play", tint: "#EBF7F1", color: "#006B32" },
    { key: "responses", label: "Responses Collected", icon: "check", tint: "#EEF3FB", color: "#003087" },
    { key: "avgCompletion", label: "Avg Completion", icon: "slider", tint: "#EFF6FF", color: "#0369A1", suffix: "%" },
];

export default function ExamListPage() {
    const router = useRouter();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try { setData(await api("/api/exam")); }
            catch (e) { console.error("[Exam list] load failed:", e); setData({ exams: [], kpis: {} }); }
            finally { setLoading(false); }
        })();
    }, []);

    const kpis = data?.kpis || {};
    const exams = data?.exams || [];

    return (
        <ModuleShell moduleId="exam" crumb="All Exams" activeNavId="list">
            <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
                <div>
                    <h1 className="text-[27px] font-extrabold text-ap-text tracking-tight">Online Exams</h1>
                    <p className="text-[14px] text-ap-text-muted mt-1">Create assessments, target audiences, and analyze results.</p>
                </div>
                <button
                    onClick={() => router.push("/dashboard/exam/new")}
                    style={{ background: "#F7941D", boxShadow: "0 4px 12px rgba(247,148,29,.28)" }}
                    className="inline-flex items-center gap-2 text-white font-bold text-[14px] rounded-[11px] px-4 py-2.5 cursor-pointer hover:brightness-105 transition"
                >
                    <span className="text-lg leading-none -mt-0.5">+</span> Create Exam
                </button>
            </div>

            {/* KPI strip */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 mb-5">
                {KPI_DEFS.map((k) => (
                    <div key={k.key} className="bg-white border border-ap-border rounded-[14px] p-[18px] flex items-center gap-3.5">
                        <span style={{ background: k.tint, color: k.color }} className="w-[46px] h-[46px] rounded-xl flex items-center justify-center shrink-0">
                            <Icon name={k.icon} size={22} sw={1.9} />
                        </span>
                        <div className="min-w-0">
                            <p className="text-[25px] font-extrabold text-ap-text leading-none">
                                {loading ? "—" : (kpis[k.key] ?? 0)}{k.suffix && !loading ? k.suffix : ""}
                            </p>
                            <p className="text-[12px] text-ap-text-muted mt-1 truncate">{k.label}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Exam grid */}
            {loading ? (
                <SkeletonCard lines={6} />
            ) : exams.length === 0 ? (
                <div className="bg-white border border-ap-border rounded-[16px] p-12 text-center">
                    <p className="text-ap-text font-bold mb-1">No exams yet</p>
                    <p className="text-ap-text-muted text-sm mb-4">Create your first online exam to get started.</p>
                    <button onClick={() => router.push("/dashboard/exam/new")} style={{ background: "#F7941D" }} className="text-white font-bold text-sm rounded-[11px] px-4 py-2 cursor-pointer">+ Create Exam</button>
                </div>
            ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    {exams.map((e) => <ExamCard key={e.id} e={e} router={router} />)}
                </div>
            )}
        </ModuleShell>
    );
}

function ExamCard({ e, router }) {
    const badge = STATUS_BADGE[e.status] || STATUS_BADGE.DRAFT;
    const canTake = e.status === "ACTIVE" || e.status === "COMPLETED";
    const partLabel = e.invited ? `${e.completed} of ${e.invited} completed` : "Not published";
    return (
        <div className="bg-white border border-ap-border rounded-[16px] p-[22px] transition-all hover:shadow-card-hover hover:-translate-y-0.5">
            <div className="flex items-start gap-3.5">
                <span style={{ background: badge.bg, color: badge.tx }} className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0">
                    <Icon name="exam" size={20} sw={1.8} />
                </span>
                <div className="flex-1 min-w-0">
                    <h3 className="text-[15.5px] font-extrabold text-ap-text leading-tight">{e.title}</h3>
                    <p className="flex items-center gap-1.5 text-[12.5px] text-ap-text-muted mt-1">
                        <span className="inline-flex" style={{ color: "#94A3B8" }}><Icon name={AUD_ICON[e.audienceMode] || "grid"} size={14} /></span>
                        {e.audienceLabel} · {e.questionCount} questions
                    </p>
                </div>
                <span style={{ background: badge.bg, color: badge.tx, borderColor: badge.bd }} className="text-[11px] font-bold border px-2.5 py-0.5 rounded-full shrink-0">
                    {badge.label}
                </span>
            </div>

            <div className="mt-4 mb-4">
                <div className="flex items-center justify-between text-[12px] mb-1.5">
                    <span className="text-ap-text-muted">{partLabel}</span>
                    <span className="font-bold" style={{ color: e.pctColor }}>{e.pct}%</span>
                </div>
                <div className="h-[7px] bg-gray-100 rounded-full overflow-hidden">
                    <div style={{ width: `${e.pct}%`, background: e.pctColor }} className="h-full rounded-full transition-all" />
                </div>
            </div>

            <div className="flex items-center gap-2.5">
                <button
                    onClick={() => router.push(`/dashboard/exam/${e.id}/results`)}
                    className="flex-1 text-[13px] font-bold text-ap-text-muted border border-ap-border rounded-[10px] py-2 hover:bg-ap-bg cursor-pointer transition"
                >
                    View Results
                </button>
                <button
                    onClick={() => (canTake ? router.push(`/exam/${e.id}/take`) : router.push(`/dashboard/exam/new?id=${e.id}`))}
                    style={{ borderColor: canTake ? "#FAD4A0" : "#E4E7ED", color: canTake ? "#C2410C" : "#64748B" }}
                    className="flex-1 text-[13px] font-bold border rounded-[10px] py-2 hover:bg-ap-bg cursor-pointer transition"
                >
                    {canTake ? "Preview" : "Edit"}
                </button>
            </div>
        </div>
    );
}
