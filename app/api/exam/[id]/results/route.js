export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import prisma from "../../../../../lib/prisma";
import { withRole } from "../../../../../lib/withRole";
import { ok, notFound, serverError } from "../../../../../lib/api-response";

const SCORE_BUCKETS = [
    { range: "0–20", color: "#DC2626" },
    { range: "20–40", color: "#F97316" },
    { range: "40–60", color: "#F7941D" },
    { range: "60–80", color: "#0369A1" },
    { range: "80–100", color: "#00843D" },
];
const MEDAL = ["#F7941D", "#94A3B8", "#C2722E"];

const branchBarColor = (p) => (p >= 80 ? "#00843D" : p >= 60 ? "#F7941D" : "#0369A1");
const marksColor = (m) => (m >= 90 ? "#00843D" : m >= 70 ? "#003087" : "#B45309");
const barColor = (m) => (m >= 90 ? "#00843D" : m >= 70 ? "#0369A1" : "#F7941D");

/**
 * GET /api/exam/:id/results — participation stats, score distribution,
 * completion-by-branch, per-question answer distribution, and the ranked
 * marks leaderboard. All derived from live ExamInvite/ExamResponse data.
 */
export const GET = withRole(["ADMIN"], async (request, { params }) => {
    try {
        const { id } = await params;
        const exam = await prisma.exam.findUnique({
            where: { id },
            include: {
                questions: { orderBy: { order: "asc" }, include: { choices: { orderBy: { order: "asc" } } } },
            },
        });
        if (!exam) return notFound("Exam not found");

        const invites = await prisma.examInvite.findMany({ where: { examId: id }, select: { employeeId: true } });
        const responses = await prisma.examResponse.findMany({
            where: { examId: id },
            select: { employeeId: true, marks: true, submittedAt: true, timeTakenSec: true },
        });

        const invited = invites.length;
        const started = responses.length;
        const completedResponses = responses.filter((r) => r.submittedAt != null);
        const completed = completedResponses.length;
        const pending = Math.max(0, invited - started);

        // ── Employee directory for leaderboard + branch rollup ──
        const empIds = [...new Set([...invites.map((i) => i.employeeId), ...responses.map((r) => r.employeeId)])];
        const users = empIds.length
            ? await prisma.user.findMany({
                where: { id: { in: empIds } },
                select: {
                    id: true, name: true,
                    department: { select: { name: true, branch: { select: { name: true } } } },
                    scopedBranch: { select: { name: true } },
                },
            })
            : [];
        const userById = Object.fromEntries(users.map((u) => [u.id, u]));
        const branchOf = (uid) => userById[uid]?.department?.branch?.name || userById[uid]?.scopedBranch?.name || "Unassigned";
        const deptOf = (uid) => userById[uid]?.department?.name || "—";

        // ── Score distribution ──
        const buckets = SCORE_BUCKETS.map((b) => ({ ...b, count: 0 }));
        for (const r of completedResponses) {
            const m = r.marks ?? 0;
            let idx = Math.floor(m / 20);
            if (idx > 4) idx = 4;
            if (idx < 0) idx = 0;
            buckets[idx].count++;
        }

        // ── Completion by branch ──
        const invitedByBranch = {};
        const completedByBranch = {};
        for (const i of invites) invitedByBranch[branchOf(i.employeeId)] = (invitedByBranch[branchOf(i.employeeId)] || 0) + 1;
        for (const r of completedResponses) completedByBranch[branchOf(r.employeeId)] = (completedByBranch[branchOf(r.employeeId)] || 0) + 1;
        const branchBars = Object.keys(invitedByBranch)
            .map((name) => {
                const pct = invitedByBranch[name] ? Math.round(((completedByBranch[name] || 0) / invitedByBranch[name]) * 100) : 0;
                return { name, pct, color: branchBarColor(pct) };
            })
            .sort((a, b) => b.pct - a.pct)
            .slice(0, 8);

        // ── Per-question answer distribution (first single-choice question) ──
        const firstSingle = exam.questions.find((q) => q.type === "SINGLE");
        let answerDist = { questionText: null, options: [] };
        if (firstSingle) {
            const ans = await prisma.examAnswer.findMany({
                where: { questionId: firstSingle.id, response: { examId: id, submittedAt: { not: null } } },
                select: { choiceIds: true },
            });
            const tally = Object.fromEntries(firstSingle.choices.map((c) => [c.id, 0]));
            for (const a of ans) for (const cid of a.choiceIds) if (cid in tally) tally[cid]++;
            const totalAns = ans.length || 1;
            answerDist = {
                questionText: firstSingle.text,
                options: firstSingle.choices.map((c) => ({
                    label: c.label,
                    pct: Math.round((tally[c.id] / totalAns) * 100),
                    correct: c.isCorrect,
                    color: c.isCorrect ? "#00843D" : "#CBD5E1",
                })),
            };
        }

        // ── Leaderboard ──
        const ranked = completedResponses
            .slice()
            .sort((a, b) => (b.marks ?? 0) - (a.marks ?? 0))
            .map((r, i) => {
                const marks = Math.round(r.marks ?? 0);
                const pass = marks >= exam.passMark;
                const mins = r.timeTakenSec ? `${Math.round(r.timeTakenSec / 60)}m` : "—";
                const name = userById[r.employeeId]?.name?.trim() || "Employee";
                return {
                    rank: i + 1,
                    name,
                    branch: branchOf(r.employeeId),
                    dept: deptOf(r.employeeId),
                    initials: name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase(),
                    marks,
                    time: mins,
                    isTop: i < 3,
                    rankBg: i < 3 ? MEDAL[i] : "#F1F5F9",
                    rankTx: i < 3 ? "#fff" : "#64748B",
                    rowBg: i === 0 ? "#FFFCF6" : "#fff",
                    marksColor: marksColor(marks),
                    barColor: barColor(marks),
                    result: pass ? "Pass" : "Below",
                    resultBg: pass ? "#EBF7F1" : "#FEF4E8",
                    resultTx: pass ? "#006B32" : "#C2410C",
                };
            });

        const startedPct = invited ? Math.round((started / invited) * 100) : 0;
        const completedPct = invited ? Math.round((completed / invited) * 100) : 0;

        return ok({
            exam: { id: exam.id, title: exam.title, status: exam.status, passMark: exam.passMark },
            participation: { invited, started, completed, pending, startedPct, completedPct },
            scoreDist: buckets,
            branchBars,
            answerDist,
            leaderboard: ranked,
        });
    } catch (err) {
        console.error("[GET /api/exam/:id/results] error:", err);
        return serverError();
    }
});
