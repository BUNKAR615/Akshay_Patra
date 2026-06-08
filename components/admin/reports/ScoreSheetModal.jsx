"use client";

import { Modal } from "../../ui/index.jsx";
import { fmtScore, fmtDate, collarLabel, stageLabel, rowScore } from "./helpers.js";

// ── One employee's full stage-by-stage score sheet ──
// `emp` is a row from /api/admin/reports (already in memory — no fetch needed).
export default function ScoreSheetModal({ emp, quarter, onClose }) {
    const open = !!emp;
    return (
        <Modal open={open} onClose={onClose} title="Employee Score Sheet" width={680}>
            {emp && <SheetBody emp={emp} quarter={quarter} />}
        </Modal>
    );
}

function SheetBody({ emp, quarter }) {
    const final = rowScore(emp);
    return (
        <div className="space-y-4">
            {/* Identity header */}
            <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-[#EEE]">
                <div>
                    <div className="text-[17px] font-black text-[#1A1A2E]">{emp.name}</div>
                    <div className="text-[12px] text-[#666] mt-0.5">
                        {emp.empCode ? `${emp.empCode} · ` : ""}{emp.branchName} · {emp.department}
                    </div>
                    <div className="text-[12px] text-[#666]">{emp.designation || "—"} · {collarLabel(emp.collarType)}</div>
                </div>
                <div className="text-right">
                    <span className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-bold ${emp.isWinner ? "bg-[#FEF3E2] text-[#C76A00]" : "bg-[#E8EEF9] text-[#003087]"}`}>
                        {emp.isWinner ? "🏆 Winner" : stageLabel(emp.currentStage || 0)}
                    </span>
                    {quarter?.name && <div className="text-[11px] text-[#999] mt-1">Quarter: {quarter.name}</div>}
                </div>
            </div>

            {/* Evaluation summary — scores at a glance */}
            <div>
                <div className="text-[11px] font-bold uppercase tracking-wide text-[#888] mb-1.5">Evaluation Summary</div>
                <div className="grid grid-cols-5 gap-2">
                    {[
                        { k: "S1 Self", v: emp.stage1?.normalizedScore },
                        { k: "S2 BM/HOD", v: emp.stage2?.shortlistCombinedScore ?? emp.stage2?.bmEval?.combinedScore ?? emp.stage2?.hodEval?.combinedScore },
                        { k: "S3 CM", v: emp.stage3?.shortlistCombinedScore ?? emp.stage3?.cmEval?.finalScore },
                        { k: "S4 HR", v: emp.stage4?.shortlistCombinedScore ?? emp.stage4?.hrEval?.combinedScore },
                        { k: "Final", v: final, strong: true },
                    ].map(c => (
                        <div key={c.k} className={`rounded-lg px-2 py-2 text-center ${c.strong ? "bg-[#003087] text-white" : "bg-[#F6F8FC]"}`}>
                            <div className={`text-[9px] font-bold uppercase tracking-wide ${c.strong ? "text-white/80" : "text-[#888]"}`}>{c.k}</div>
                            <div className={`text-[14px] font-black ${c.strong ? "text-white" : "text-[#003087]"}`}>{c.v === null || c.v === undefined ? "—" : fmtScore(c.v)}</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Evaluators */}
            <div>
                <div className="text-[11px] font-bold uppercase tracking-wide text-[#888] mb-1.5">Evaluators</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                        { role: "BM", name: emp.stage2?.bmEval?.evaluatorName },
                        { role: "HOD", name: emp.stage2?.hodEval?.evaluatorName },
                        { role: "CM", name: emp.stage3?.cmEval?.evaluatorName },
                        { role: "HR", name: emp.stage4?.hrEval?.evaluatorName },
                    ].map(c => (
                        <div key={c.role} className="rounded-lg bg-[#F6F8FC] px-3 py-2">
                            <div className="text-[10px] font-bold uppercase tracking-wide text-[#888]">{c.role}</div>
                            <div className="text-[12px] font-bold text-[#333] truncate">{c.name || "—"}</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Stage 1 · Self */}
            <StageCard title="Stage 1 · Self Assessment" reached={!!emp.stage1?.submitted}>
                <Grid>
                    <Cell label="Raw Score" value={fmtScore(emp.stage1?.rawScore)} />
                    <Cell label="Normalized" value={fmtScore(emp.stage1?.normalizedScore)} strong />
                    <Cell label="Shortlist Rank" value={emp.stage1?.shortlistRank ?? "—"} />
                    <Cell label="Submitted" value={fmtDate(emp.stage1?.submittedAt) || "—"} />
                </Grid>
            </StageCard>

            {/* Stage 2 · BM / HOD */}
            <StageCard title="Stage 2 · Branch Manager / HOD" reached={!!(emp.stage2?.bmEval || emp.stage2?.hodEval)}>
                {emp.stage2?.bmEval && <EvalBlock label="Branch Manager" ev={emp.stage2.bmEval} />}
                {emp.stage2?.hodEval && <EvalBlock label="HOD" ev={emp.stage2.hodEval} />}
                <Grid>
                    <Cell label="Self Contribution" value={fmtScore(emp.stage2?.bmEval?.selfContribution ?? emp.stage2?.hodEval?.selfContribution)} />
                    <Cell label="Combined Score" value={fmtScore(emp.stage2?.shortlistCombinedScore ?? emp.stage2?.bmEval?.combinedScore ?? emp.stage2?.hodEval?.combinedScore)} strong />
                    <Cell label="Shortlist Rank" value={emp.stage2?.shortlistRank ?? "—"} />
                    <Cell label="Shortlisted" value={emp.stage2?.shortlisted ? "Yes" : "No"} />
                </Grid>
            </StageCard>

            {/* Stage 3 · CM */}
            <StageCard title="Stage 3 · Cluster Manager" reached={!!emp.stage3?.cmEval}>
                {emp.stage3?.cmEval && <EvalBlock label="Cluster Manager" ev={emp.stage3.cmEval} />}
                <Grid>
                    <Cell label="CM Contribution" value={fmtScore(emp.stage3?.cmEval?.evaluatorContribution)} />
                    <Cell label="Final / Combined" value={fmtScore(emp.stage3?.shortlistCombinedScore ?? emp.stage3?.cmEval?.finalScore)} strong />
                    <Cell label="Shortlist Rank" value={emp.stage3?.shortlistRank ?? "—"} />
                    <Cell label="Shortlisted" value={emp.stage3?.shortlisted ? "Yes" : "No"} />
                </Grid>
            </StageCard>

            {/* Stage 4 · HR */}
            <StageCard title="Stage 4 · HR (Attendance & Punctuality)" reached={!!emp.stage4?.hrEval}>
                {emp.stage4?.hrEval && (
                    <div className="text-[12px] text-[#555] mb-2">
                        Evaluated by <span className="font-bold text-[#222]">{emp.stage4.hrEval.evaluatorName || "—"}</span>
                        {emp.stage4.hrEval.evaluatorEmpCode ? ` (${emp.stage4.hrEval.evaluatorEmpCode})` : ""}
                        {emp.stage4.hrEval.submittedAt ? ` · ${fmtDate(emp.stage4.hrEval.submittedAt)}` : ""}
                    </div>
                )}
                <Grid>
                    <Cell label="Attendance %" value={fmtScore(emp.stage4?.hrEval?.attendancePct)} />
                    <Cell label="Punctuality %" value={fmtScore(emp.stage4?.hrEval?.punctualityPct ?? emp.stage4?.hrEval?.workingHours)} />
                    <Cell label="HR Marks" value={fmtScore(emp.stage4?.hrEval?.hrScore)} />
                    <Cell label="Combined Score" value={fmtScore(emp.stage4?.shortlistCombinedScore ?? emp.stage4?.hrEval?.combinedScore)} strong />
                    <Cell label="Shortlist Rank" value={emp.stage4?.shortlistRank ?? "—"} />
                    <Cell label="Shortlisted" value={emp.stage4?.shortlisted ? "Yes" : "No"} />
                </Grid>
            </StageCard>

            {/* Final */}
            <div className="rounded-xl bg-[#003087] text-white px-4 py-3 flex items-center justify-between">
                <span className="text-[13px] font-bold uppercase tracking-wide">Best / Final Score</span>
                <span className="text-[22px] font-black">{final === null ? "—" : fmtScore(final)}</span>
            </div>
        </div>
    );
}

function StageCard({ title, reached, children }) {
    return (
        <div className={`rounded-xl border p-4 ${reached ? "border-[#D9E2F2] bg-white" : "border-[#EEE] bg-[#FAFAFA]"}`}>
            <div className="flex items-center justify-between mb-2">
                <h4 className="text-[13px] font-black text-[#003087]">{title}</h4>
                {!reached && <span className="text-[11px] font-bold text-[#AAA]">Not reached</span>}
            </div>
            {reached ? children : <p className="text-[12px] text-[#999]">No evaluation recorded at this stage.</p>}
        </div>
    );
}

function EvalBlock({ label, ev }) {
    return (
        <div className="text-[12px] text-[#555] mb-2">
            <span className="font-bold text-[#003087]">{label}:</span>{" "}
            <span className="font-bold text-[#222]">{ev.evaluatorName || "—"}</span>
            {ev.evaluatorEmpCode ? ` (${ev.evaluatorEmpCode})` : ""}
            {ev.submittedAt ? ` · ${fmtDate(ev.submittedAt)}` : ""}
            {" · "}raw {fmtScore(ev.rawScore) || "—"} · norm {fmtScore(ev.normalizedScore) || "—"}
        </div>
    );
}

function Grid({ children }) {
    return <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{children}</div>;
}

function Cell({ label, value, strong }) {
    return (
        <div className="rounded-lg bg-[#F6F8FC] px-3 py-2">
            <div className="text-[10px] font-bold uppercase tracking-wide text-[#888]">{label}</div>
            <div className={`mt-0.5 ${strong ? "text-[15px] font-black text-[#003087]" : "text-[14px] font-bold text-[#333]"}`}>
                {value === "" || value === null || value === undefined ? "—" : value}
            </div>
        </div>
    );
}
