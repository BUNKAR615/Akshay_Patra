"use client";

import { useMemo, useState } from "react";
import {
    PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid,
    Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { CHART_COLORS, STAGE_COLORS, evaluatedAtStage } from "./helpers.js";

const STAGE_LABELS = { 1: "Stage 1 · Self", 2: "Stage 2 · BM/HOD", 3: "Stage 3 · CM", 4: "Stage 4 · HR" };

// ── Charts overview: pie per stage + combined bar by branch & total ──
export default function ReportCharts({ employees }) {
    const [pieStage, setPieStage] = useState(1);
    const [pieMode, setPieMode] = useState("branch"); // "branch" | "shortlist"

    // Pie data for the selected stage.
    const pieData = useMemo(() => {
        const evaluated = employees.filter(e => evaluatedAtStage(e, pieStage));
        if (pieMode === "shortlist") {
            const yes = evaluated.filter(e => stageShortlisted(e, pieStage)).length;
            return [
                { name: "Shortlisted", value: yes },
                { name: "Not Shortlisted", value: evaluated.length - yes },
            ].filter(d => d.value > 0);
        }
        const map = new Map();
        for (const e of evaluated) {
            const b = e.branchName || "—";
            map.set(b, (map.get(b) || 0) + 1);
        }
        return Array.from(map.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    }, [employees, pieStage, pieMode]);

    // Bar data: one row per branch + a Total row, four stage series each.
    const barData = useMemo(() => {
        const map = new Map();
        const ensure = (b) => {
            if (!map.has(b)) map.set(b, { branch: b, s1: 0, s2: 0, s3: 0, s4: 0 });
            return map.get(b);
        };
        const total = { branch: "Total", s1: 0, s2: 0, s3: 0, s4: 0 };
        for (const e of employees) {
            const row = ensure(e.branchName || "—");
            for (const n of [1, 2, 3, 4]) {
                if (evaluatedAtStage(e, n)) { row[`s${n}`]++; total[`s${n}`]++; }
            }
        }
        const branches = Array.from(map.values()).sort((a, b) => a.branch.localeCompare(b.branch));
        return [...branches, total];
    }, [employees]);

    const pieTotal = pieData.reduce((s, d) => s + d.value, 0);

    return (
        <div className="space-y-5">
            {/* Pie: evaluation by stage */}
            <div className="bg-white border border-[#E0E0E0] shadow-sm rounded-xl p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                    <h3 className="text-[14px] font-black text-[#003087]">Evaluation Breakdown · {STAGE_LABELS[pieStage]}</h3>
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="flex rounded-lg border border-[#CCC] overflow-hidden">
                            {[1, 2, 3, 4].map(n => (
                                <button key={n} type="button" onClick={() => setPieStage(n)}
                                    className={`px-3 h-9 text-xs font-bold ${pieStage === n ? "bg-[#003087] text-white" : "bg-white text-[#666] hover:bg-[#F5F5F5]"}`}>
                                    S{n}
                                </button>
                            ))}
                        </div>
                        <div className="flex rounded-lg border border-[#CCC] overflow-hidden">
                            <button type="button" onClick={() => setPieMode("branch")}
                                className={`px-3 h-9 text-xs font-bold ${pieMode === "branch" ? "bg-[#00843D] text-white" : "bg-white text-[#666] hover:bg-[#F5F5F5]"}`}>By Branch</button>
                            <button type="button" onClick={() => setPieMode("shortlist")}
                                className={`px-3 h-9 text-xs font-bold ${pieMode === "shortlist" ? "bg-[#00843D] text-white" : "bg-white text-[#666] hover:bg-[#F5F5F5]"}`}>Shortlisted</button>
                        </div>
                    </div>
                </div>
                {!pieData.length ? (
                    <div className="py-16 text-center text-[#888] text-sm">No employees evaluated at {STAGE_LABELS[pieStage]} for the current filters.</div>
                ) : (
                    <div className="h-[320px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={110}
                                    label={(d) => `${d.name}: ${d.value}`} labelLine={false}>
                                    {pieData.map((d, i) => (
                                        <Cell key={d.name} fill={pieMode === "shortlist"
                                            ? (d.name === "Shortlisted" ? "#00843D" : "#C9CDD4")
                                            : CHART_COLORS[i % CHART_COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip formatter={(v, n) => [`${v} (${pieTotal ? Math.round((v / pieTotal) * 100) : 0}%)`, n]} />
                                <Legend />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </div>

            {/* Bar: all stages by branch & total */}
            <div className="bg-white border border-[#E0E0E0] shadow-sm rounded-xl p-4 sm:p-5">
                <h3 className="text-[14px] font-black text-[#003087] mb-3">All Stages by Branch & Total</h3>
                {!barData.length ? (
                    <div className="py-16 text-center text-[#888] text-sm">No data for the current filters.</div>
                ) : (
                    <div className="h-[380px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={barData} margin={{ top: 8, right: 16, left: 0, bottom: 40 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#EEE" />
                                <XAxis dataKey="branch" angle={-30} textAnchor="end" interval={0} height={70} tick={{ fontSize: 11 }} />
                                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                                <Tooltip />
                                <Legend />
                                <Bar dataKey="s1" name="Stage 1" fill={STAGE_COLORS[1]} />
                                <Bar dataKey="s2" name="Stage 2" fill={STAGE_COLORS[2]} />
                                <Bar dataKey="s3" name="Stage 3" fill={STAGE_COLORS[3]} />
                                <Bar dataKey="s4" name="Stage 4" fill={STAGE_COLORS[4]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </div>
        </div>
    );
}

function stageShortlisted(e, n) {
    if (n === 1) return e.stage1?.shortlisted;
    if (n === 2) return e.stage2?.shortlisted;
    if (n === 3) return e.stage3?.shortlisted;
    if (n === 4) return e.stage4?.shortlisted;
    return false;
}
