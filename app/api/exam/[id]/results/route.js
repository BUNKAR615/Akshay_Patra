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
const SEG = ["#003087", "#00843D", "#F7941D", "#0369A1", "#7C3AED", "#BE185D"];
const CHOICE_TYPES = ["SINGLE", "MULTIPLE", "TRUE_FALSE", "POLL", "PICTURE"];

const pctColor = (p) => (p >= 80 ? "#00843D" : p >= 60 ? "#F7941D" : "#0369A1");
const marksColor = (m) => (m >= 90 ? "#00843D" : m >= 70 ? "#003087" : "#B45309");
const STOP = new Set(["the", "a", "an", "and", "or", "of", "to", "in", "is", "it", "for", "on", "with", "as", "at", "by", "be", "this", "that", "are", "was"]);

/**
 * GET /api/exam/:id/results — full analytics: participation, internal vs
 * external split, registration funnel, completion by branch & department, score
 * distribution, per-question analytics (all types), live tracking, leaderboard.
 */
export const GET = withRole(["ADMIN"], async (request, { params }) => {
    try {
        const { id } = await params;
        const exam = await prisma.exam.findUnique({
            where: { id },
            include: { questions: { orderBy: { order: "asc" }, include: { choices: { orderBy: { order: "asc" } } } } },
        });
        if (!exam) return notFound("Exam not found");

        const [invites, responses, registrants, allAnswers] = await Promise.all([
            prisma.examInvite.findMany({ where: { examId: id }, select: { employeeId: true } }),
            prisma.examResponse.findMany({ where: { examId: id }, select: { employeeId: true, marks: true, submittedAt: true, startedAt: true, timeTakenSec: true } }),
            prisma.externalRegistrant.findMany({ where: { examId: id }, select: { id: true, name: true, branch: true, department: true, status: true } }),
            prisma.examAnswer.findMany({
                where: { response: { examId: id, submittedAt: { not: null } } },
                select: { questionId: true, choiceIds: true, textValue: true, ratingValue: true },
            }),
        ]);

        const registrantById = Object.fromEntries(registrants.map((r) => [r.id, r]));
        const isExternal = (uid) => uid in registrantById;

        const invited = invites.length;
        const started = responses.length;
        const completedResponses = responses.filter((r) => r.submittedAt != null);
        const completed = completedResponses.length;
        const inProgress = responses.filter((r) => r.submittedAt == null).length;
        const pending = Math.max(0, invited - started);

        // ── People (internal users + external registrants) ──
        const respIds = [...new Set([...invites.map((i) => i.employeeId), ...responses.map((r) => r.employeeId)])];
        const userIds = respIds.filter((uid) => !isExternal(uid));
        const users = userIds.length
            ? await prisma.user.findMany({
                where: { id: { in: userIds } },
                select: { id: true, name: true, department: { select: { name: true, branch: { select: { name: true } } } }, scopedBranch: { select: { name: true } } },
            })
            : [];
        const userById = Object.fromEntries(users.map((u) => [u.id, u]));
        const nameOf = (uid) => (isExternal(uid) ? registrantById[uid]?.name : userById[uid]?.name)?.trim() || "Participant";
        const branchOf = (uid) => isExternal(uid) ? (registrantById[uid]?.branch || "External") : (userById[uid]?.department?.branch?.name || userById[uid]?.scopedBranch?.name || "Unassigned");
        const deptOf = (uid) => isExternal(uid) ? (registrantById[uid]?.department || "External") : (userById[uid]?.department?.name || "—");

        // ── Internal vs external (completed) ──
        const extCompleted = completedResponses.filter((r) => isExternal(r.employeeId)).length;
        const split = { internal: completed - extCompleted, external: extCompleted };

        // ── Registration funnel ──
        const registration = {
            total: registrants.length,
            pending: registrants.filter((r) => r.status === "PENDING").length,
            approved: registrants.filter((r) => r.status === "APPROVED").length,
            rejected: registrants.filter((r) => r.status === "REJECTED").length,
        };

        // ── Score distribution ──
        const buckets = SCORE_BUCKETS.map((b) => ({ ...b, count: 0 }));
        for (const r of completedResponses) {
            let idx = Math.floor((r.marks ?? 0) / 20);
            idx = Math.max(0, Math.min(4, idx));
            buckets[idx].count++;
        }

        // ── Completion by branch & department ──
        const rollup = (keyFn) => {
            const inv = {}, comp = {};
            for (const i of invites) inv[keyFn(i.employeeId)] = (inv[keyFn(i.employeeId)] || 0) + 1;
            for (const r of completedResponses) comp[keyFn(r.employeeId)] = (comp[keyFn(r.employeeId)] || 0) + 1;
            // Include external completers (no invite) under their key.
            const keys = new Set([...Object.keys(inv), ...Object.keys(comp)]);
            return [...keys].map((name) => {
                const denom = inv[name] || comp[name] || 0;
                const pct = denom ? Math.round(((comp[name] || 0) / denom) * 100) : 0;
                return { name, completed: comp[name] || 0, invited: inv[name] || 0, pct, color: pctColor(pct) };
            }).sort((a, b) => b.completed - a.completed).slice(0, 8);
        };
        const branchBars = rollup(branchOf);
        const deptBars = rollup(deptOf);

        // ── Per-question analytics (all types) ──
        const answersByQ = {};
        for (const a of allAnswers) (answersByQ[a.questionId] ||= []).push(a);
        const questionStats = exam.questions.map((q) => {
            const ans = answersByQ[q.id] || [];
            const base = { id: q.id, type: q.type, text: q.text, responses: ans.length };
            if (CHOICE_TYPES.includes(q.type)) {
                const tally = Object.fromEntries(q.choices.map((c) => [c.id, 0]));
                for (const a of ans) for (const cid of a.choiceIds) if (cid in tally) tally[cid]++;
                const totalPicks = Math.max(1, q.type === "MULTIPLE" ? Object.values(tally).reduce((s, n) => s + n, 0) : ans.length);
                return { ...base, kind: "choice", options: q.choices.map((c) => ({ label: c.label, count: tally[c.id], pct: Math.round((tally[c.id] / totalPicks) * 100), correct: c.isCorrect })) };
            }
            if (q.type === "RATING" || q.type === "LIKERT") {
                const vals = ans.map((a) => a.ratingValue).filter((v) => v != null);
                const dist = [1, 2, 3, 4, 5].map((n) => ({ value: n, count: vals.filter((v) => v === n).length }));
                const avg = vals.length ? Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10 : 0;
                return { ...base, kind: "scale", average: avg, max: 5, dist };
            }
            if (q.type === "RANKING") {
                const byId = Object.fromEntries(q.choices.map((c) => [c.id, { label: c.label, sum: 0, n: 0 }]));
                for (const a of ans) a.choiceIds.forEach((cid, idx) => { if (byId[cid]) { byId[cid].sum += idx + 1; byId[cid].n++; } });
                const items = Object.values(byId).map((x) => ({ label: x.label, avgRank: x.n ? Math.round((x.sum / x.n) * 10) / 10 : 0 })).sort((a, b) => (a.avgRank || 99) - (b.avgRank || 99));
                return { ...base, kind: "ranking", items };
            }
            if (q.type === "WORD_CLOUD") {
                const freq = {};
                for (const a of ans) for (const w of (a.textValue || "").toLowerCase().split(/[^a-z0-9']+/)) {
                    if (w.length < 2 || STOP.has(w)) continue;
                    freq[w] = (freq[w] || 0) + 1;
                }
                const words = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 24).map(([text, count]) => ({ text, count }));
                const maxW = Math.max(1, ...words.map((w) => w.count));
                return { ...base, kind: "words", words: words.map((w) => ({ ...w, size: 12 + Math.round((w.count / maxW) * 18) })) };
            }
            // SHORT / LONG — open text, sampled
            return { ...base, kind: "text", samples: ans.map((a) => a.textValue).filter(Boolean).slice(0, 5) };
        });

        // ── Leaderboard (graded; includes external takers) ──
        const ranked = completedResponses.slice().sort((a, b) => (b.marks ?? 0) - (a.marks ?? 0)).map((r, i) => {
            const marks = Math.round(r.marks ?? 0);
            const pass = marks >= exam.passMark;
            const name = nameOf(r.employeeId);
            return {
                rank: i + 1, name, branch: branchOf(r.employeeId), dept: deptOf(r.employeeId),
                external: isExternal(r.employeeId),
                initials: name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase(),
                marks, time: r.timeTakenSec ? `${Math.round(r.timeTakenSec / 60)}m` : "—",
                rankBg: i < 3 ? MEDAL[i] : "#F1F5F9", rankTx: i < 3 ? "#fff" : "#64748B",
                rowBg: i === 0 ? "#FFFCF6" : "#fff",
                marksColor: marksColor(marks), barColor: marks >= 90 ? "#00843D" : marks >= 70 ? "#0369A1" : "#F7941D",
                result: pass ? "Pass" : "Below", resultBg: pass ? "#EBF7F1" : "#FEF4E8", resultTx: pass ? "#006B32" : "#C2410C",
            };
        });

        // ── Live tracking — most recent submissions ──
        const recent = completedResponses
            .slice().sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt)).slice(0, 6)
            .map((r) => ({ name: nameOf(r.employeeId), branch: branchOf(r.employeeId), marks: Math.round(r.marks ?? 0), external: isExternal(r.employeeId), at: r.submittedAt }));

        const startedPct = invited ? Math.round((started / invited) * 100) : 0;
        const completedPct = invited ? Math.round((completed / invited) * 100) : 0;

        return ok({
            exam: { id: exam.id, title: exam.title, status: exam.status, passMark: exam.passMark },
            participation: { invited, started, completed, pending, inProgress, startedPct, completedPct },
            split, registration,
            scoreDist: buckets, branchBars, deptBars,
            questionStats, segColors: SEG,
            recent, leaderboard: ranked,
        });
    } catch (err) {
        console.error("[GET /api/exam/:id/results] error:", err);
        return serverError();
    }
});
