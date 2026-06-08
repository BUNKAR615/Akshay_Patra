"use client";

import { useMemo, useState } from "react";
import {
    PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid,
    Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import {
    CHART_COLORS, STAGE_COLORS, evaluatedAtStage,
    reachedStage, completedStage, passedStage,
} from "./helpers.js";

const PIE_STAGES = [
    { key: 1, label: "Stage 1 · Self" },
    { key: 2, label: "Stage 2 · BM/HOD" },
    { key: 3, label: "Stage 3 · CM" },
    { key: 4, label: "Stage 4 · HR" },
    { key: "final", label: "Final · Winners" },
];

// ── Charts overview: status pie per stage + branch bar + department analytics ──
export default function ReportCharts({ employees }) {
    const [pieStage, setPieStage] = useState(1);
    const [pieMode, setPieMode] = useState("status"); // "status" | "branch"

    const curStage = PIE_STAGES.find(s => s.key === pieStage) || PIE_STAGES[0];

    // Pie data for the selected stage.
    const pieData = useMemo(() => {
        const reached = employees.filter(e => reachedStage(e, pieStage));
        if (pieMode === "branch") {
            const map = new Map();
            for (const e of reached.filter(e => completedStage(e, pieStage))) {
                const b = e.branchName || "—";
                map.set(b, (map.get(b) || 0) + 1);
            }
            return Array.from(map.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
        }
        // Status partition of everyone who reached the stage.
        const passed = reached.filter(e => passedStage(e, pieStage)).length;
        const completedNotPassed = reached.filter(e => completedStage(e, pieStage) && !passedStage(e, pieStage)).length;
        const pending = reached.filter(e => !completedStage(e, pieStage)).length;
        return [
            { name: "Passed / Cleared", value: passed, color: "#00843D" },
            { name: "Evaluated · not passed", value: completedNotPassed, color: "#F7941D" },
            { name: "Pending", value: pending, color: "#C9CDD4" },
        ].filter(d => d.value > 0);
    }, [employees, pieStage, pieMode]);

    const pieTotal = pieData.reduce((s, d) => s + d.value, 0);

    // Bar: per-branch + Total, four stage-completed series.
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

    // Department analytics: participation (self-assessed) + progression (passed S1).
    const deptData = useMemo(() => {
        const map = new Map();
        for (const e of employees) {
            const d = e.department || "—";
            if (!map.has(d)) map.set(d, { dept: d, total: 0, participated: 0, passed: 0 });
            const row = map.get(d);
            row.total++;
            if (e.stage1?.submitted) row.participated++;
            if (e.stage1?.shortlisted) row.passed++;
        }
        return Array.from(map.values()).sort((a, b) => b.total - a.total).slice(0, 12);
    }, [employees]);

    return (
        <div className="space-y-5">
            {/* Pie: status by stage */}
            <div className="bg-white border border-[#E0E0E0] shadow-sm rounded-xl p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                    <h3 className="text-[14px] font-black text-[#003087]">Stage Breakdown · {curStage.label}</h3>
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="flex rounded-lg border border-[#CCC] overflow-hidden">
                            {PIE_STAGES.map(s => (
                                <button key={String(s.key)} type="button" onClick={() => setPieStage(s.key)}
                                    className={`px-3 h-9 text-xs font-bold ${pieStage === s.key ? "bg-[#003087] text-white" : "bg-white text-[#666] hover:bg-[#F5F5F5]"}`}>
                                    {s.key === "final" ? "Final" : `S${s.key}`}
                                </button>
                            ))}
                        </div>
                        <div className="flex rounded-lg border border-[#CCC] overflow-hidden">
                            <button type="button" onClick={() => setPieMode("status")}
                                className={`px-3 h-9 text-xs font-bold ${pieMode === "status" ? "bg-[#00843D] text-white" : "bg-white text-[#666] hover:bg-[#F5F5F5]"}`}>Status</button>
                            <button type="button" onClick={() => setPieMode("branch")}
                                className={`px-3 h-9 text-xs font-bold ${pieMode === "branch" ? "bg-[#00843D] text-white" : "bg-white text-[#666] hover:bg-[#F5F5F5]"}`}>By Branch</button>
                        </div>
                    </div>
                </div>
                {!pieData.length ? (
                    <div className="py-16 text-center text-[#888] text-sm">No employees have reached {curStage.label} for the current filters.</div>
                ) : (
                    <div className="h-[320px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={110}
                                    label={(d) => `${d.name}: ${d.value}`} labelLine={false}>
                                    {pieData.map((d, i) => (
                                        <Cell key={d.name} fill={d.color || CHART_COLORS[i % CHART_COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip formatter={(v, n) => [`${v} (${pieTotal ? Math.round((v / pieTotal) * 100) : 0}%)`, n]} />
                                <Legend />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </div>

            {/* Bar: all stages by branch & total (branch + combined progress) */}
            <div className="bg-white border border-[#E0E0E0] shadow-sm rounded-xl p-4 sm:p-5">
                <h3 className="text-[14px] font-black text-[#003087] mb-3">Branch & Overall Progress · employees evaluated per stage</h3>
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

            {/* Department analytics */}
            <div className="bg-white border border-[#E0E0E0] shadow-sm rounded-xl p-4 sm:p-5">
                <h3 className="text-[14px] font-black text-[#003087] mb-1">Department Analytics · participation & progress</h3>
                <p className="text-[11px] text-[#888] mb-3">Top {deptData.length} departments by size. Participated = self-assessed · Passed = cleared Stage 1.</p>
                {!deptData.length ? (
                    <div className="py-16 text-center text-[#888] text-sm">No data for the current filters.</div>
                ) : (
                    <div className="h-[380px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={deptData} margin={{ top: 8, right: 16, left: 0, bottom: 60 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#EEE" />
                                <XAxis dataKey="dept" angle={-30} textAnchor="end" interval={0} height={90} tick={{ fontSize: 11 }} />
                                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                                <Tooltip />
                                <Legend />
                                <Bar dataKey="total" name="Employees" fill="#003087" />
                                <Bar dataKey="participated" name="Participated" fill="#00843D" />
                                <Bar dataKey="passed" name="Passed S1" fill="#F7941D" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </div>
        </div>
    );
}
