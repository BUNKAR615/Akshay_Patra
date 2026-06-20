"use client";

import ModuleShell from "../../../../components/shell/ModuleShell";
import { Icon } from "../../../../components/ui/Icons";

// Light wrapper module — the internal Feedback & Survey workflow is left as-is.
// These are illustrative figures (matching the design handoff) so the module
// reads cleanly inside the platform shell.
const KPIS = [
    { label: "Active Surveys", value: "6", sub: "2 closing soon", color: "#00843D", tint: "#EBF7F1" },
    { label: "Responses", value: "1,284", sub: "this quarter", color: "#003087", tint: "#EEF3FB" },
    { label: "Avg Response Rate", value: "72%", sub: "+8% vs last quarter", color: "#0369A1", tint: "#EFF6FF" },
    { label: "Avg Sentiment", value: "4.2", sub: "out of 5", color: "#F7941D", tint: "#FEF4E8" },
];

const SURVEYS = [
    { title: "Workplace Wellbeing Pulse", meta: "All staff · closes in 4 days", responses: 412, status: "Open", bg: "#EBF7F1", tx: "#006B32" },
    { title: "Cafeteria & Facilities Feedback", meta: "Kitchen & ops teams · closes in 9 days", responses: 188, status: "Open", bg: "#EBF7F1", tx: "#006B32" },
    { title: "Manager Effectiveness 360", meta: "Branch managers · draft", responses: 0, status: "Draft", bg: "#F3F4F6", tx: "#374151" },
];

export default function FeedbackOverviewPage() {
    return (
        <ModuleShell moduleId="fs" crumb="Overview" activeNavId="overview">
            <h1 className="text-[27px] font-extrabold text-ap-text tracking-tight">Feedback &amp; Survey</h1>
            <p className="text-[14px] text-ap-text-muted mt-1 mb-6">Pulse surveys and structured feedback across the organization.</p>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 mb-5">
                {KPIS.map((k) => (
                    <div key={k.label} className="bg-white border border-ap-border rounded-[14px] p-[18px]">
                        <span style={{ background: k.tint, color: k.color }} className="w-[30px] h-[30px] rounded-lg flex items-center justify-center mb-2.5"><Icon name="chat" size={17} /></span>
                        <p className="text-[25px] font-extrabold text-ap-text leading-none">{k.value}</p>
                        <p className="text-[12px] text-ap-text-muted mt-1">{k.label} <span className="text-ap-text-faint">· {k.sub}</span></p>
                    </div>
                ))}
            </div>

            <div className="bg-white border border-ap-border rounded-[16px] p-[22px]">
                <h3 className="text-[16px] font-extrabold text-ap-text mb-4">Active Surveys</h3>
                <div className="space-y-2.5">
                    {SURVEYS.map((s) => (
                        <div key={s.title} className="flex items-center gap-3.5 border border-ap-border rounded-[12px] p-3.5">
                            <span style={{ background: "#EBF7F1", color: "#00843D" }} className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"><Icon name="chat" size={20} /></span>
                            <div className="flex-1 min-w-0">
                                <p className="text-[14.5px] font-bold text-ap-text truncate">{s.title}</p>
                                <p className="text-[12px] text-ap-text-muted truncate">{s.meta}</p>
                            </div>
                            <div className="text-right shrink-0">
                                <p className="text-[15px] font-extrabold text-ap-text">{s.responses}</p>
                                <p className="text-[11px] text-ap-text-faint">responses</p>
                            </div>
                            <span style={{ background: s.bg, color: s.tx }} className="text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0">{s.status}</span>
                        </div>
                    ))}
                </div>
            </div>
        </ModuleShell>
    );
}
