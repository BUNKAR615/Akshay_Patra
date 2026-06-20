"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import ModuleShell from "../../../../../components/shell/ModuleShell";
import { Icon } from "../../../../../components/ui/Icons";
import { api } from "../../../../../lib/clientApi";
import { SkeletonCard } from "../../../../../components/Skeleton";

const STATUS = {
    PENDING: { label: "Pending", bg: "#FEF4E8", tx: "#C2410C", bd: "#FAD4A0" },
    APPROVED: { label: "Approved", bg: "#EBF7F1", tx: "#006B32", bd: "#A3D9BC" },
    REJECTED: { label: "Rejected", bg: "#FEF2F2", tx: "#DC2626", bd: "#FCA5A5" },
};
const COUNTS = [
    { key: "PENDING", label: "Pending review", tint: "#FEF4E8", color: "#C2410C", icon: "hourglass" },
    { key: "APPROVED", label: "Approved", tint: "#EBF7F1", color: "#006B32", icon: "check" },
    { key: "REJECTED", label: "Rejected", tint: "#FEF2F2", color: "#DC2626", icon: "doc" },
];
const FILTERS = ["ALL", "PENDING", "APPROVED", "REJECTED"];

export default function RegistrantsPage() {
    const { id } = useParams();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState("PENDING");
    const [busy, setBusy] = useState(null);

    const load = async () => {
        try { setData(await api(`/api/exam/${id}/registrants`)); }
        catch (e) { console.error("[Registrants] load failed:", e); setData({ registrants: [], counts: {}, exam: null }); }
        finally { setLoading(false); }
    };
    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    const review = async (registrantId, status) => {
        setBusy(registrantId);
        try {
            await api(`/api/exam/${id}/registrants`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ registrantId, status }) });
            await load();
        } catch (e) { console.error("[Registrants] review failed:", e); }
        finally { setBusy(null); }
    };

    const all = data?.registrants || [];
    const counts = data?.counts || {};
    const rows = filter === "ALL" ? all : all.filter((r) => r.status === filter);

    return (
        <ModuleShell moduleId="exam" crumb="Registrants" activeNavId="list">
            <div className="mb-6">
                <h1 className="text-[27px] font-extrabold text-ap-text tracking-tight">External registrants</h1>
                <p className="text-[14px] text-ap-text-muted mt-1">{data?.exam?.title ? `Review external sign-ups for “${data.exam.title}”.` : "Review and approve external participants."}</p>
            </div>

            <div className="grid grid-cols-3 gap-3.5 mb-5">
                {COUNTS.map((c) => (
                    <div key={c.key} className="bg-white border border-ap-border rounded-[14px] p-[18px] flex items-center gap-3.5">
                        <span style={{ background: c.tint, color: c.color }} className="w-[46px] h-[46px] rounded-xl flex items-center justify-center shrink-0"><Icon name={c.icon} size={22} sw={1.9} /></span>
                        <div><p className="text-[25px] font-extrabold text-ap-text leading-none">{loading ? "—" : (counts[c.key] ?? 0)}</p><p className="text-[12px] text-ap-text-muted mt-1">{c.label}</p></div>
                    </div>
                ))}
            </div>

            <div className="flex items-center gap-2 mb-4 flex-wrap">
                {FILTERS.map((f) => {
                    const on = filter === f;
                    const n = f === "ALL" ? all.length : (counts[f] ?? 0);
                    return (
                        <button key={f} onClick={() => setFilter(f)} style={{ background: on ? "#0D1B3E" : "#fff", color: on ? "#fff" : "#475569", borderColor: on ? "#0D1B3E" : "#E4E7ED" }} className="text-[13px] font-bold border rounded-full px-3.5 py-1.5 cursor-pointer transition">
                            {f === "ALL" ? "All" : STATUS[f].label} <span className={on ? "text-white/60" : "text-ap-text-faint"}>{n}</span>
                        </button>
                    );
                })}
            </div>

            {loading ? (
                <SkeletonCard lines={6} />
            ) : rows.length === 0 ? (
                <div className="bg-white border border-ap-border rounded-[16px] p-12 text-center">
                    <div style={{ background: "#F4F6FA", color: "#CBD5E1" }} className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3.5"><Icon name="users" size={26} sw={1.6} /></div>
                    <p className="text-ap-text font-bold mb-1">No {filter === "ALL" ? "" : STATUS[filter].label.toLowerCase()} registrants</p>
                    <p className="text-ap-text-muted text-sm">External sign-ups will appear here as people register.</p>
                </div>
            ) : (
                <div className="bg-white border border-ap-border rounded-[16px] divide-y divide-gray-100">
                    {rows.map((r) => {
                        const s = STATUS[r.status] || STATUS.PENDING;
                        return (
                            <div key={r.id} className="flex items-center gap-4 px-4 sm:px-5 py-3.5 flex-wrap">
                                <div className="flex-1 min-w-[200px]">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[14.5px] font-bold text-ap-text">{r.name}</span>
                                        <span className="text-[11.5px] text-ap-text-faint font-semibold">#{r.empCode}</span>
                                    </div>
                                    <div className="flex items-center gap-x-3 gap-y-0.5 mt-1 flex-wrap text-[12.5px] text-ap-text-muted">
                                        {r.designation && <span>{r.designation}</span>}
                                        {r.branch && <span>· {r.branch}</span>}
                                        {r.department && <span>· {r.department}</span>}
                                    </div>
                                    <div className="flex items-center gap-x-3 mt-0.5 flex-wrap text-[12px] text-ap-text-faint">
                                        {r.email && <span>{r.email}</span>}
                                        {r.mobile && <span>· {r.mobile}</span>}
                                    </div>
                                </div>
                                <span style={{ background: s.bg, color: s.tx, borderColor: s.bd }} className="text-[11px] font-bold border px-2.5 py-0.5 rounded-full shrink-0">{s.label}</span>
                                <div className="flex items-center gap-2 shrink-0">
                                    {r.status !== "APPROVED" && (
                                        <button onClick={() => review(r.id, "APPROVED")} disabled={busy === r.id} style={{ background: "#00843D" }} className="text-white text-[12.5px] font-bold rounded-lg px-3 py-1.5 cursor-pointer disabled:opacity-60">Approve</button>
                                    )}
                                    {r.status !== "REJECTED" && (
                                        <button onClick={() => review(r.id, "REJECTED")} disabled={busy === r.id} className="text-[12.5px] font-bold text-ap-text-muted border border-ap-border rounded-lg px-3 py-1.5 hover:bg-ap-bg cursor-pointer disabled:opacity-60">Reject</button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </ModuleShell>
    );
}
