"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
    api, fmtScore, fmtDate, collarLabel,
    reachedStage, evaluatedAtStage, stageScore,
    LIKERT_OPTIONS, likertOption,
} from "./reports/helpers.js";

// ── Per-stage presentation metadata ──────────────────────────────────────
// Drives the header colour, the "who is evaluating" line and the description
// shown at the top of each stage's detail view.
const STAGE_META = {
    1: {
        title: "Stage 1 — Self Assessment",
        color: "#003087", soft: "#E8EEF9",
        evaluator: "The employee themselves",
        desc: "Every employee evaluates themselves by answering the self-assessment questionnaire. In Stage 1 the employee is their own evaluator.",
    },
    2: {
        title: "Stage 2 — BM / HOD Evaluation",
        color: "#00843D", soft: "#E9F7EF",
        evaluator: "Branch Manager & HOD",
        desc: "Employees shortlisted from Stage 1 are evaluated by their Branch Manager (white-collar staff) and, in BIG branches, by the Head of Department (blue-collar staff).",
    },
    3: {
        title: "Stage 3 — Cluster Manager",
        color: "#F7941D", soft: "#FFF3E0",
        evaluator: "Cluster Manager",
        desc: "The Cluster Manager scores employees shortlisted from Stage 2. A single Cluster Manager can be responsible for more than one branch.",
    },
    4: {
        title: "Stage 4 — HR Round",
        color: "#6C3FB0", soft: "#F3E5F5",
        evaluator: "HR Team",
        desc: "HR evaluates the finalists on attendance and punctuality to decide the branch winners.",
    },
    5: {
        title: "Branch Winners",
        color: "#F57C00", soft: "#FFF3E0",
        evaluator: "Selected winners",
        desc: "The final winners of this branch for the quarter, with their stage-wise and final scores. Download the list with scores or with winner information.",
    },
};

// Pull the evaluator(s) recorded against a stage row for an employee.
function evaluatorsFor(e, stage) {
    if (stage === 1) return [];
    if (stage === 2) {
        const out = [];
        if (e.stage2?.bmEval) out.push({ role: "BM", ...e.stage2.bmEval });
        if (e.stage2?.hodEval) out.push({ role: "HOD", ...e.stage2.hodEval });
        return out;
    }
    if (stage === 3 && e.stage3?.cmEval) return [{ role: "CM", ...e.stage3.cmEval }];
    if (stage === 4 && e.stage4?.hrEval) return [{ role: "HR", ...e.stage4.hrEval }];
    return [];
}

// Distinct "Name (CODE)" evaluator chips seen across a list of employees.
function distinctEvaluators(rows, stage) {
    const seen = new Map();
    for (const e of rows) {
        for (const ev of evaluatorsFor(e, stage)) {
            const key = `${ev.role}:${ev.evaluatorEmpCode || ev.evaluatorName}`;
            if (!seen.has(key)) seen.set(key, { role: ev.role, name: ev.evaluatorName, code: ev.evaluatorEmpCode });
        }
    }
    return Array.from(seen.values());
}

export default function StageDetailModal({ branch, stage, quarterId, onClose }) {
    const isWinners = stage === 5;
    const meta = STAGE_META[stage] || STAGE_META[1];
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [cmBranches, setCmBranches] = useState({}); // empCode -> [branchName]
    const [team, setTeam] = useState(null); // this branch's evaluators: { bms, cms, hods, hrs }
    const [winners, setWinners] = useState(null); // this branch's declared winners (Stage 4 + Winners view)
    const [winnersQuarterName, setWinnersQuarterName] = useState(null);

    // Load the branch's ongoing pipeline (per-employee stage rows). Skipped for
    // the Winners-only view, which has no evaluation cohort to compute.
    useEffect(() => {
        if (isWinners) { setLoading(false); return; }
        let alive = true;
        setLoading(true); setError("");
        const qs = quarterId ? `?quarterId=${encodeURIComponent(quarterId)}` : "";
        api(`/api/admin/branches/${branch.branchId}/export/ongoing${qs}`)
            .then(d => { if (alive) setData(d); })
            .catch(e => { if (alive) setError(e.message || "Failed to load stage details"); })
            .finally(() => { if (alive) setLoading(false); });
        return () => { alive = false; };
    }, [branch.branchId, quarterId, isWinners]);

    // Load THIS branch's evaluation team from the authoritative per-branch
    // assignment endpoints. BM / CM / HR live in dedicated assignment tables
    // (not departmentRoles), so we read them directly; HODs come from the
    // branch employees endpoint (role=HOD), which is quarter-scoped to the
    // active/current HODs. Everything here is already branch-specific.
    useEffect(() => {
        if (isWinners) return;
        let alive = true;
        const qp = quarterId ? `&quarterId=${encodeURIComponent(quarterId)}` : "";
        Promise.all([
            api(`/api/admin/branches/${branch.branchId}/bm-assign`).catch(() => ({ assignment: null })),
            api(`/api/admin/branches/${branch.branchId}/cm-assign`).catch(() => ({ assignments: [] })),
            api(`/api/admin/branches/${branch.branchId}/hr-assign`).catch(() => ({ assignments: [] })),
            api(`/api/admin/branches/${branch.branchId}/employees?role=HOD${qp}`).catch(() => ({ employees: [] })),
        ]).then(([bm, cm, hr, hodData]) => {
            if (!alive) return;
            const dedupe = (arr) => {
                const m = new Map();
                for (const u of arr) if (u && u.id && !m.has(u.id)) m.set(u.id, u);
                return Array.from(m.values());
            };
            setTeam({
                bms: bm.assignment?.bm ? [bm.assignment.bm] : [],
                cms: dedupe((cm.assignments || []).map(a => a.cm).filter(Boolean)),
                hrs: dedupe((hr.assignments || []).map(a => a.hr).filter(Boolean)),
                hods: dedupe(hodData.employees || []),
            });
        });
        return () => { alive = false; };
    }, [branch.branchId, quarterId, isWinners]);

    // Load THIS branch's declared winners (same data the committee sees) — for
    // both the Stage 4 view and the dedicated Winners view. ADMIN may target any
    // branch via ?branchId=.
    useEffect(() => {
        if (stage !== 4 && !isWinners) return;
        let alive = true;
        const qs = new URLSearchParams({ branchId: branch.branchId });
        if (quarterId) qs.set("quarterId", quarterId);
        api(`/api/committee/results?${qs.toString()}`)
            .then(d => {
                if (!alive) return;
                setWinners(d?.branches?.[0]?.winners || []);
                setWinnersQuarterName(d?.quarter?.name || null);
            })
            .catch(() => { if (alive) setWinners([]); });
        return () => { alive = false; };
    }, [stage, branch.branchId, quarterId, isWinners]);

    // For Stage 3, work out which branches each Cluster Manager covers so we
    // can surface the "under branches" list when one CM spans multiple branches.
    useEffect(() => {
        if (stage !== 3) return;
        let alive = true;
        api("/api/admin/departments/all-assignments")
            .then(d => {
                if (!alive) return;
                const map = {};
                for (const dept of d.departments || []) {
                    for (const cm of dept.clusterManagers || []) {
                        const key = cm.empCode || cm.name;
                        if (!key) continue;
                        if (!map[key]) map[key] = new Set();
                        map[key].add(dept.branch);
                    }
                }
                const out = {};
                for (const k of Object.keys(map)) out[k] = Array.from(map[k]).sort();
                setCmBranches(out);
            })
            .catch(() => {});
        return () => { alive = false; };
    }, [stage]);

    // Lock background scroll + close on Escape while the modal is open.
    useEffect(() => {
        const onKey = (e) => { if (e.key === "Escape") onClose(); };
        document.addEventListener("keydown", onKey);
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
    }, [onClose]);

    // Derive the stage cohort + participation split.
    const view = useMemo(() => {
        if (!data?.employees) return null;
        const pool = data.employees.filter(e => reachedStage(e, stage));
        const participated = pool.filter(e => evaluatedAtStage(e, stage));
        const pending = pool.filter(e => !evaluatedAtStage(e, stage));
        return { pool, participated, pending };
    }, [data, stage]);

    const cmList = useMemo(() => {
        if (stage !== 3 || !view) return [];
        return distinctEvaluators(view.participated, 3).map(ev => ({
            ...ev,
            branches: cmBranches[ev.code] || cmBranches[ev.name] || [],
        }));
    }, [stage, view, cmBranches]);

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-3 sm:p-6" onClick={onClose}>
            <div
                className="relative w-full max-w-4xl my-2 bg-[#F7F9FC] rounded-2xl shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Coloured header */}
                <div className="px-5 sm:px-6 py-4 text-white" style={{ background: `linear-gradient(135deg, ${meta.color}, ${meta.color}cc)` }}>
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <p className="text-[11px] font-bold uppercase tracking-wider text-white/80">{branch.branchName} · {branch.branchType}</p>
                            <h2 className="text-[18px] sm:text-[22px] font-black leading-tight mt-0.5">{meta.title}</h2>
                        </div>
                        <button
                            onClick={onClose}
                            className="shrink-0 w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white text-lg font-bold transition-colors"
                            aria-label="Close"
                        >
                            ✕
                        </button>
                    </div>
                    <p className="text-[12.5px] text-white/90 mt-2 leading-snug max-w-2xl">{meta.desc}</p>
                </div>

                <div className="p-4 sm:p-6 space-y-5 max-h-[78vh] overflow-y-auto">
                    {isWinners ? (
                        <BranchWinners winners={winners} branchName={branch.branchName} quarterName={winnersQuarterName} />
                    ) : loading ? (
                        <div className="py-16 text-center text-[#888] text-sm">Loading stage details…</div>
                    ) : error ? (
                        <div className="py-16 text-center text-[#C0392B] text-sm font-medium">{error}</div>
                    ) : !view ? (
                        <div className="py-16 text-center text-[#888] text-sm">No data available for this stage.</div>
                    ) : (
                        <>
                            {/* Stat tiles */}
                            <div className="grid grid-cols-3 gap-3">
                                <StatTile label="In stage" value={view.pool.length} color={meta.color} soft={meta.soft} />
                                <StatTile label="Participated" value={view.participated.length} color="#00843D" soft="#E9F7EF" />
                                <StatTile label="Pending" value={view.pending.length} color="#E65100" soft="#FFF3E0" />
                            </div>

                            {/* Branch evaluation team — branch-specific evaluator names */}
                            <TeamPanel team={team} branchName={branch.branchName} isBig={branch.branchType === "BIG"} />

                            {/* Who is evaluating */}
                            <div className="bg-white border border-[#E6ECF6] rounded-xl p-4">
                                <h3 className="text-[12px] font-bold uppercase tracking-wide text-[#888]">Who is evaluating</h3>
                                <p className="text-[15px] font-black mt-1" style={{ color: meta.color }}>{meta.evaluator}</p>

                                {stage === 1 && (
                                    <p className="text-[12.5px] text-[#666] mt-1">In Stage 1 each employee is their own evaluator — the scores below are self-submitted.</p>
                                )}

                                {stage === 2 && <Stage2Evaluators view={view} />}

                                {stage === 3 && (
                                    <div className="mt-3 space-y-2">
                                        {cmList.length === 0 ? (
                                            <p className="text-[12.5px] text-[#999]">No Cluster Manager evaluations recorded yet.</p>
                                        ) : cmList.map((cm, i) => (
                                            <div key={i} className="rounded-lg bg-[#FFF8F0] border border-[#FCE3C7] px-3 py-2">
                                                <p className="text-[13px] font-bold text-[#9A5700]">{cm.name}{cm.code ? ` (${cm.code})` : ""}</p>
                                                {cm.branches.length > 1 && (
                                                    <p className="text-[12px] text-[#A06A2C] mt-0.5">
                                                        <span className="font-bold">Handles {cm.branches.length} branches:</span> {cm.branches.join(" · ")}
                                                    </p>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {stage === 4 && <SimpleEvaluators rows={view.participated} stage={4} />}
                            </div>

                            {/* Stage 2 BM/HOD split */}
                            {stage === 2 && <Stage2Split view={view} quarterId={quarterId} stage={stage} />}

                            {/* Answer scripts */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <h3 className="text-[14px] font-black text-[#1A1A2E]">Answer Scripts</h3>
                                    <span className="text-[11px] text-[#999]">{view.pool.length} employees in this stage</span>
                                </div>
                                <EmployeeList rows={view.pool} stage={stage} quarterId={quarterId} />
                            </div>

                            {/* Stage 4 — this branch's winners + downloads */}
                            {stage === 4 && (
                                <BranchWinners
                                    winners={winners}
                                    branchName={branch.branchName}
                                    quarterName={data?.quarter?.name}
                                />
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

function StatTile({ label, value, color, soft }) {
    return (
        <div className="rounded-xl p-3 sm:p-4 text-center border" style={{ background: soft, borderColor: `${color}33` }}>
            <p className="text-[26px] sm:text-[32px] font-black leading-none" style={{ color }}>{value}</p>
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#777] mt-1.5">{label}</p>
        </div>
    );
}

// Stage 4 — this branch's declared winners, plus two Excel downloads:
//   (i)  with scores   — stage-wise + final scores
//   (ii) with info      — identity details (name, code, designation, dept…)
function BranchWinners({ winners, branchName, quarterName }) {
    const slug = (s) => String(s || "").replace(/[^A-Za-z0-9_-]+/g, "_") || "branch";
    const date = new Date().toISOString().slice(0, 10);
    const sc = (w, n) => {
        const v = w.stages?.find(s => s.stage === n)?.score;
        return (v === null || v === undefined) ? "" : Math.round(v * 100) / 100;
    };
    const collar = (ct) => ct === "WHITE_COLLAR" ? "White Collar" : ct === "BLUE_COLLAR" ? "Blue Collar" : "—";

    const writeSheet = async (rows, sheetName, fileName) => {
        const XLSX = await import("xlsx");
        const ws = XLSX.utils.json_to_sheet(rows);
        if (rows.length > 0) {
            ws["!cols"] = Object.keys(rows[0]).map(k => ({
                wch: Math.max(k.length, ...rows.map(r => String(r[k] ?? "").length)) + 2,
            }));
        }
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
        XLSX.writeFile(wb, fileName);
    };

    const downloadScores = () => writeSheet(
        (winners || []).map(w => ({
            Rank: w.rank,
            Name: w.name,
            "Emp Code": w.empCode || "",
            Department: w.department || "",
            Category: collar(w.collarType),
            "S1 (Self)": sc(w, 1),
            "S2 (BM/HOD)": sc(w, 2),
            "S3 (CM)": sc(w, 3),
            "S4 (HR)": sc(w, 4),
            "Final Score": w.finalScore === null || w.finalScore === undefined ? "" : Math.round(w.finalScore * 100) / 100,
        })),
        "Winners — Scores",
        `Winners_Scores_${slug(branchName)}_${slug(quarterName)}_${date}.xlsx`,
    );

    const downloadInfo = () => writeSheet(
        (winners || []).map(w => ({
            Rank: w.rank,
            Name: w.name,
            "Emp Code": w.empCode || "",
            Designation: w.designation || "",
            Department: w.department || "",
            Category: collar(w.collarType),
            Branch: w.branch || branchName,
        })),
        "Winners — Info",
        `Winners_Info_${slug(branchName)}_${slug(quarterName)}_${date}.xlsx`,
    );

    return (
        <div className="bg-gradient-to-r from-[#FFF8E1] to-[#FFF3E0] border border-[#FFCC80] rounded-xl p-4">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                <h3 className="text-[14px] font-black text-[#F57C00] flex items-center gap-1.5"><span>🏆</span> Branch Winners</h3>
                {winners && winners.length > 0 && (
                    <div className="flex items-center gap-2">
                        <button onClick={downloadScores}
                            className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-[#003087] hover:bg-[#00256b] text-white cursor-pointer transition-colors">
                            ⬇ Scores (.xlsx)
                        </button>
                        <button onClick={downloadInfo}
                            className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-[#00843D] hover:bg-[#006B32] text-white cursor-pointer transition-colors">
                            ⬇ Info (.xlsx)
                        </button>
                    </div>
                )}
            </div>
            {winners === null ? (
                <p className="text-[12.5px] text-[#999]">Loading winners…</p>
            ) : winners.length === 0 ? (
                <p className="text-[12.5px] text-[#999] italic">No winners declared yet for this branch.</p>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-[12px] min-w-[520px]">
                        <thead>
                            <tr className="text-[10px] uppercase tracking-wider text-[#A06A2C] border-b border-[#FFE0B2]">
                                <th className="py-1.5 pr-2 font-bold">#</th>
                                <th className="py-1.5 pr-2 font-bold">Name</th>
                                <th className="py-1.5 pr-2 font-bold">Department</th>
                                <th className="py-1.5 pr-2 font-bold">Category</th>
                                <th className="py-1.5 px-1 font-bold text-right">S1</th>
                                <th className="py-1.5 px-1 font-bold text-right">S2</th>
                                <th className="py-1.5 px-1 font-bold text-right">S3</th>
                                <th className="py-1.5 px-1 font-bold text-right">S4</th>
                                <th className="py-1.5 pl-2 font-bold text-right">Final</th>
                            </tr>
                        </thead>
                        <tbody>
                            {winners.map(w => {
                                const isWC = w.collarType === "WHITE_COLLAR";
                                return (
                                    <tr key={w.empCode || w.name} className="border-b border-[#FFF3E0] last:border-0">
                                        <td className="py-1.5 pr-2 font-black text-[#F57C00]">{w.rank}</td>
                                        <td className="py-1.5 pr-2">
                                            <span className="font-bold text-[#1A1A2E]">{w.name}</span>
                                            {w.empCode ? <span className="text-[#999]"> · {w.empCode}</span> : null}
                                            {w.designation ? <div className="text-[10px] text-[#999]">{w.designation}</div> : null}
                                        </td>
                                        <td className="py-1.5 pr-2 text-[#666]">{w.department || "—"}</td>
                                        <td className="py-1.5 pr-2">
                                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold border"
                                                style={{ backgroundColor: isWC ? "#E3F2FD" : "#E8F5E9", color: isWC ? "#003087" : "#00843D", borderColor: isWC ? "#90CAF9" : "#A5D6A7" }}>
                                                {isWC ? "WC" : "BC"}
                                            </span>
                                        </td>
                                        <td className="py-1.5 px-1 text-right tabular-nums text-[#666]">{sc(w, 1) === "" ? "—" : sc(w, 1)}</td>
                                        <td className="py-1.5 px-1 text-right tabular-nums text-[#666]">{sc(w, 2) === "" ? "—" : sc(w, 2)}</td>
                                        <td className="py-1.5 px-1 text-right tabular-nums text-[#666]">{sc(w, 3) === "" ? "—" : sc(w, 3)}</td>
                                        <td className="py-1.5 px-1 text-right tabular-nums text-[#666]">{sc(w, 4) === "" ? "—" : sc(w, 4)}</td>
                                        <td className="py-1.5 pl-2 text-right font-black text-[#003087] tabular-nums">
                                            {w.finalScore === null || w.finalScore === undefined ? "—" : Math.round(w.finalScore * 100) / 100}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

// Branch-specific evaluation team — names of the BM, CM, HR and (for BIG
// branches) the current HODs assigned to THIS branch.
function TeamPanel({ team, branchName, isBig }) {
    const roles = [
        { label: "Branch Manager", people: team?.bms, color: "#00843D", soft: "#E9F7EF" },
        { label: "Cluster Manager", people: team?.cms, color: "#9A5700", soft: "#FFF3E0" },
        { label: "HR Personnel", people: team?.hrs, color: "#6C3FB0", soft: "#F3E5F5" },
    ];
    if (isBig) roles.push({ label: "Head of Department (HOD)", people: team?.hods, color: "#003087", soft: "#E8EEF9" });

    return (
        <div className="bg-white border border-[#E6ECF6] rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-[12px] font-bold uppercase tracking-wide text-[#888]">Branch Evaluation Team</h3>
                <span className="text-[11px] font-bold text-[#003087]">{branchName}</span>
            </div>
            {!team ? (
                <p className="text-[12.5px] text-[#999]">Loading evaluator names…</p>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {roles.map(r => <RoleBox key={r.label} {...r} />)}
                </div>
            )}
        </div>
    );
}

function RoleBox({ label, people, color, soft }) {
    const list = people || [];
    return (
        <div className="rounded-lg px-3 py-2.5 border" style={{ background: soft, borderColor: `${color}33` }}>
            <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color }}>{label}</p>
            {list.length === 0 ? (
                <p className="text-[12.5px] text-[#999] mt-1 italic">Not assigned</p>
            ) : (
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {list.map(p => (
                        <span key={p.id} className="inline-flex items-center text-[12px] font-bold px-2 py-0.5 rounded-full bg-white border" style={{ color, borderColor: `${color}44` }}>
                            {p.name}{p.empCode ? <span className="font-medium opacity-70 ml-1">({p.empCode})</span> : null}
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}

// Distinct evaluator chips for a single-role stage (Stage 4 / generic).
function SimpleEvaluators({ rows, stage }) {
    const evs = distinctEvaluators(rows, stage);
    if (evs.length === 0) return <p className="text-[12.5px] text-[#999] mt-1">No evaluations recorded yet.</p>;
    return (
        <div className="flex flex-wrap gap-2 mt-2">
            {evs.map((ev, i) => (
                <span key={i} className="text-[12px] font-bold px-2.5 py-1 rounded-full bg-[#F3E5F5] text-[#6C3FB0]">
                    {ev.name}{ev.code ? ` (${ev.code})` : ""}
                </span>
            ))}
        </div>
    );
}

function Stage2Evaluators({ view }) {
    const bms = distinctEvaluators(view.participated.filter(e => e.stage2?.bmEval), 2).filter(e => e.role === "BM");
    const hods = distinctEvaluators(view.participated.filter(e => e.stage2?.hodEval), 2).filter(e => e.role === "HOD");
    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
            <div className="rounded-lg bg-[#E9F7EF] border border-[#BCE3CC] px-3 py-2">
                <p className="text-[11px] font-bold uppercase tracking-wide text-[#2E7D52]">Branch Managers</p>
                <p className="text-[12.5px] text-[#1B5E20] mt-1">{bms.length ? bms.map(b => `${b.name}${b.code ? ` (${b.code})` : ""}`).join(", ") : "—"}</p>
            </div>
            <div className="rounded-lg bg-[#E8EEF9] border border-[#B9CBEC] px-3 py-2">
                <p className="text-[11px] font-bold uppercase tracking-wide text-[#274C8C]">Heads of Department</p>
                <p className="text-[12.5px] text-[#003087] mt-1">{hods.length ? hods.map(h => `${h.name}${h.code ? ` (${h.code})` : ""}`).join(", ") : "—"}</p>
            </div>
        </div>
    );
}

// Stage 2: who BM evaluated, who HOD evaluated, and who is still pending.
function Stage2Split({ view }) {
    const bmRows = view.participated.filter(e => e.stage2?.bmEval);
    const hodRows = view.participated.filter(e => e.stage2?.hodEval);
    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <SplitCard title="BM evaluated" accent="#00843D" rows={bmRows} pick={(e) => e.stage2.bmEval} />
            <SplitCard title="HOD evaluated" accent="#003087" rows={hodRows} pick={(e) => e.stage2.hodEval} />
            <SplitCard title="Pending" accent="#E65100" rows={view.pending} pick={() => null} />
        </div>
    );
}

function SplitCard({ title, accent, rows, pick }) {
    return (
        <div className="bg-white border border-[#E6ECF6] rounded-xl overflow-hidden">
            <div className="px-3 py-2 flex items-center justify-between" style={{ background: `${accent}12` }}>
                <span className="text-[12px] font-black" style={{ color: accent }}>{title}</span>
                <span className="text-[12px] font-black" style={{ color: accent }}>{rows.length}</span>
            </div>
            <div className="max-h-44 overflow-y-auto divide-y divide-[#F2F2F2]">
                {rows.length === 0 ? (
                    <p className="px-3 py-4 text-[12px] text-[#999] text-center">None</p>
                ) : rows.map(e => {
                    const ev = pick(e);
                    return (
                        <div key={e.userId} className="px-3 py-2">
                            <p className="text-[12.5px] font-bold text-[#222] truncate">{e.name}</p>
                            <p className="text-[11px] text-[#888] truncate">
                                {e.department}{ev ? ` · by ${ev.evaluatorName}` : ""}
                            </p>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ── Employee list with expandable per-employee answer script ──────────────
function EmployeeList({ rows, stage, quarterId }) {
    const [openId, setOpenId] = useState(null);
    if (rows.length === 0) {
        return <div className="bg-white border border-[#E6ECF6] rounded-xl p-8 text-center text-[#999] text-sm">No employees have reached this stage yet.</div>;
    }
    return (
        <div className="bg-white border border-[#E6ECF6] rounded-xl divide-y divide-[#F2F2F2] overflow-hidden">
            {rows.map(e => {
                const done = evaluatedAtStage(e, stage);
                const score = stageScore(e, stage);
                const open = openId === e.userId;
                return (
                    <div key={e.userId}>
                        <button
                            type="button"
                            onClick={() => setOpenId(open ? null : e.userId)}
                            className="w-full text-left px-3 sm:px-4 py-3 flex items-center gap-3 hover:bg-[#F7FAFF] transition-colors"
                        >
                            <span className={`shrink-0 w-2.5 h-2.5 rounded-full ${done ? "bg-[#00843D]" : "bg-[#E0E0E0]"}`} />
                            <div className="min-w-0 flex-1">
                                <p className="text-[13.5px] font-bold text-[#222] truncate">{e.name}</p>
                                <p className="text-[11px] text-[#888] truncate">{e.empCode ? `${e.empCode} · ` : ""}{e.department} · {collarLabel(e.collarType)}</p>
                            </div>
                            <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${done ? "bg-[#E9F7EF] text-[#00843D]" : "bg-[#FFF3E0] text-[#E65100]"}`}>
                                {done ? "Evaluated" : "Pending"}
                            </span>
                            {score !== null && score !== undefined && (
                                <span className="shrink-0 text-[12px] font-black text-[#003087] tabular-nums w-12 text-right">{fmtScore(score)}</span>
                            )}
                            <span className="shrink-0 text-[#BBB] text-xs">{open ? "▲" : "▼"}</span>
                        </button>
                        {open && <AnswerScript employeeId={e.userId} stage={stage} quarterId={quarterId} />}
                    </div>
                );
            })}
        </div>
    );
}

function AnswerScript({ employeeId, stage, quarterId }) {
    const [sheet, setSheet] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const reqRef = useRef(0);

    useEffect(() => {
        const myReq = ++reqRef.current;
        setLoading(true); setError("");
        const qs = new URLSearchParams({ employeeId, stage: String(stage) });
        if (quarterId) qs.set("quarterId", quarterId);
        api(`/api/admin/answer-sheet?${qs.toString()}`)
            .then(d => { if (myReq === reqRef.current) setSheet(d); })
            .catch(e => { if (myReq === reqRef.current) setError(e.message || "Failed to load answer script"); })
            .finally(() => { if (myReq === reqRef.current) setLoading(false); });
    }, [employeeId, stage, quarterId]);

    const hasContent = (sheet?.sheets?.length || 0) > 0 || !!sheet?.attendance;

    return (
        <div className="bg-[#FAFBFE] border-t border-[#EEF1F7] px-3 sm:px-4 py-3 space-y-3">
            {loading ? (
                <p className="text-[12px] text-[#999] py-2">Loading answer script…</p>
            ) : error ? (
                <p className="text-[12px] text-[#C0392B] py-2 font-medium">{error}</p>
            ) : !hasContent ? (
                <p className="text-[12px] text-[#999] py-2">No answer script recorded for this stage yet.</p>
            ) : (
                <>
                    {(sheet.sheets || []).map((s, i) => <ScriptSheet key={i} s={s} />)}
                    {sheet.attendance && <AttendanceBlock a={sheet.attendance} />}
                </>
            )}
        </div>
    );
}

function ScriptSheet({ s }) {
    return (
        <div className="bg-white border border-[#E6ECF6] rounded-lg overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-[#F6F8FC] border-b border-[#E6ECF6]">
                <span className="text-[12px] font-black text-[#003087]">
                    {s.role}
                    <span className="text-[11px] font-medium text-[#666] ml-2">by {s.evaluatorName}{s.evaluatorEmpCode ? ` (${s.evaluatorEmpCode})` : ""}</span>
                </span>
                <div className="flex items-center gap-2 text-[11px]">
                    {s.submittedAt && <span className="text-[#999]">{fmtDate(s.submittedAt)}</span>}
                    <span className="px-2 py-0.5 rounded-full bg-[#E8EEF9] text-[#003087] font-bold">Raw {fmtScore(s.rawScore) || "—"}{s.maxScore ? ` / ${fmtScore(s.maxScore)}` : ""}</span>
                    {s.normalizedScore !== null && s.normalizedScore !== undefined && (
                        <span className="px-2 py-0.5 rounded-full bg-[#E9F7EF] text-[#00843D] font-bold">Norm {fmtScore(s.normalizedScore)}</span>
                    )}
                </div>
            </div>
            {!s.questions?.length ? (
                <p className="p-4 text-center text-[#999] text-[12px]">No question-level answers recorded.</p>
            ) : (
                <div className="divide-y divide-[#F2F2F2]">
                    {s.questions.map(q => <ScriptRow key={q.number} q={q} />)}
                </div>
            )}
        </div>
    );
}

function ScriptRow({ q }) {
    const selected = likertOption(q.score);
    return (
        <div className="px-3 py-2.5 flex items-start gap-2.5">
            <span className="shrink-0 w-6 h-6 rounded-full bg-[#003087] text-white text-[11px] font-bold flex items-center justify-center mt-0.5">{q.number}</span>
            <div className="min-w-0 flex-1">
                <p className="text-[12.5px] font-semibold text-[#222] leading-snug">{q.text}</p>
                {q.textHindi && <p className="text-[11.5px] text-[#777] leading-snug mt-0.5">{q.textHindi}</p>}
                <div className="flex flex-wrap gap-1 mt-1.5">
                    {LIKERT_OPTIONS.map(o => {
                        const isSel = o.value === q.score;
                        return (
                            <span key={o.value}
                                style={isSel ? { background: o.color, borderColor: o.color, color: "#fff" } : { borderColor: "#DDD", color: "#999" }}
                                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-bold ${isSel ? "" : "bg-white"}`}>
                                {isSel && <span aria-hidden>✓</span>}
                                {o.label}
                            </span>
                        );
                    })}
                </div>
            </div>
            <div className="shrink-0 text-right">
                <div className="text-[16px] font-black" style={{ color: selected?.color || "#333" }}>
                    {q.score === null || q.score === undefined ? "—" : (q.score > 0 ? `+${q.score}` : q.score)}
                </div>
            </div>
        </div>
    );
}

function AttendanceBlock({ a }) {
    const cells = [
        { label: "Attendance %", value: fmtScore(a.attendancePct) },
        { label: "Punctuality %", value: fmtScore(a.punctualityPct) },
        { label: "Present Days", value: a.presentDays ?? "—" },
        { label: "Punctual Days", value: a.punctualDays ?? "—" },
        { label: "Working Days", value: a.workingDays ?? "—" },
        { label: "HR Marks", value: fmtScore(a.hrScore) },
    ];
    return (
        <div className="bg-white border border-[#E6ECF6] rounded-lg overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-[#F6F8FC] border-b border-[#E6ECF6]">
                <span className="text-[12px] font-black text-[#6C3FB0]">HR · Attendance & Punctuality</span>
                <span className="text-[11px] text-[#666]">by {a.evaluatorName}{a.evaluatorEmpCode ? ` (${a.evaluatorEmpCode})` : ""}</span>
            </div>
            <div className="p-3 grid grid-cols-3 gap-2">
                {cells.map(c => (
                    <div key={c.label} className="rounded-lg bg-[#F6F8FC] px-2.5 py-2">
                        <div className="text-[9.5px] font-bold uppercase tracking-wide text-[#888]">{c.label}</div>
                        <div className="mt-0.5 text-[15px] font-black text-[#6C3FB0]">{c.value === "" || c.value === null || c.value === undefined ? "—" : c.value}</div>
                    </div>
                ))}
            </div>
            {(a.attendancePdfUrl || a.punctualityPdfUrl || a.referenceSheetUrl || a.notes) && (
                <div className="px-3 pb-3 flex flex-wrap items-center gap-3 text-[11.5px]">
                    {a.attendancePdfUrl && <a href={a.attendancePdfUrl} target="_blank" rel="noreferrer" className="text-[#003087] font-bold underline">Attendance proof</a>}
                    {a.punctualityPdfUrl && <a href={a.punctualityPdfUrl} target="_blank" rel="noreferrer" className="text-[#003087] font-bold underline">Punctuality proof</a>}
                    {a.referenceSheetUrl && <a href={a.referenceSheetUrl} target="_blank" rel="noreferrer" className="text-[#003087] font-bold underline">Reference sheet</a>}
                    {a.notes && <span className="text-[#666]">Notes: {a.notes}</span>}
                </div>
            )}
        </div>
    );
}
