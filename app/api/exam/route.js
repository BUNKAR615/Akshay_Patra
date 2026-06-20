export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import prisma from "../../../lib/prisma";
import { withRole } from "../../../lib/withRole";
import { ok, created, serverError, validateBody } from "../../../lib/api-response";
import { createExamSchema } from "../../../lib/examValidators";

const BANDS = (pct) => (pct >= 80 ? "#00843D" : pct >= 40 ? "#F7941D" : pct > 0 ? "#0369A1" : "#94A3B8");

/**
 * GET /api/exam — list all exams with computed participation, plus KPI totals.
 */
export const GET = withRole(["ADMIN"], async () => {
    try {
        const exams = await prisma.exam.findMany({
            orderBy: { createdAt: "desc" },
            include: {
                audience: true,
                _count: { select: { questions: true, invites: true } },
            },
        });

        // Completed counts per exam in one grouped query.
        const completedRows = await prisma.examResponse.groupBy({
            by: ["examId"],
            where: { submittedAt: { not: null } },
            _count: { _all: true },
        });
        const completedByExam = Object.fromEntries(completedRows.map((r) => [r.examId, r._count._all]));

        const list = exams.map((e) => {
            const invited = e._count.invites;
            const completed = completedByExam[e.id] || 0;
            const pct = invited ? Math.round((completed / invited) * 100) : 0;
            return {
                id: e.id,
                title: e.title,
                status: e.status,
                questionCount: e._count.questions,
                audienceMode: e.audience?.mode || null,
                audienceLabel: audienceLabel(e.audience),
                invited,
                completed,
                pct,
                pctColor: BANDS(pct),
                dueDate: e.dueDate,
            };
        });

        const totalResponses = completedRows.reduce((s, r) => s + r._count._all, 0);
        const activeCount = exams.filter((e) => e.status === "ACTIVE").length;
        const withInvites = list.filter((e) => e.invited > 0);
        const avgCompletion = withInvites.length
            ? Math.round(withInvites.reduce((s, e) => s + e.pct, 0) / withInvites.length)
            : 0;

        const kpis = {
            total: exams.length,
            active: activeCount,
            responses: totalResponses,
            avgCompletion,
        };

        return ok({ exams: list, kpis });
    } catch (err) {
        console.error("[GET /api/exam] error:", err);
        return serverError();
    }
});

/**
 * POST /api/exam — create a new draft exam.
 */
export const POST = withRole(["ADMIN"], async (request, { user }) => {
    try {
        const { data, error } = await validateBody(request, createExamSchema);
        if (error) return error;

        const exam = await prisma.exam.create({
            data: {
                title: data.title,
                description: data.description || null,
                status: "DRAFT",
                createdById: user.userId,
            },
        });

        await prisma.auditLog.create({
            data: { userId: user.userId, action: "EXAM_CREATED", details: { examId: exam.id, title: exam.title } },
        });

        return created({ exam });
    } catch (err) {
        console.error("[POST /api/exam] error:", err);
        return serverError();
    }
});

function audienceLabel(aud) {
    if (!aud) return "Not set";
    const map = {
        ALL: "All branches",
        BRANCH: "Specific branch",
        DEPT: "Branch + department",
        BM: "Branch Managers",
        RM: "Regional Managers",
        RANDOM: "Random sample",
        CUSTOM: "Custom combination",
    };
    return map[aud.mode] || "Not set";
}
