export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import prisma from "../../../../lib/prisma";
import { withRole } from "../../../../lib/withRole";
import { ok, serverError } from "../../../../lib/api-response";
import { isExamClosed } from "../../../../lib/examDeadline";

const ALL_ROLES = ["EMPLOYEE", "SUPERVISOR", "HOD", "BRANCH_MANAGER", "CLUSTER_MANAGER", "HR", "COMMITTEE", "ADMIN"];

/**
 * GET /api/exam/my — exams the signed-in employee was invited to. Only exams
 * that are published (ACTIVE) or COMPLETED are returned, so drafts never leak.
 * Each row carries the employee's own progress (not started / in progress /
 * submitted) so the dashboard can render the right call-to-action.
 */
export const GET = withRole(ALL_ROLES, async (request, { user }) => {
    try {
        const invites = await prisma.examInvite.findMany({
            where: {
                employeeId: user.userId,
                // Hidden exams are retracted from every employee's list.
                exam: { status: { in: ["ACTIVE", "COMPLETED"] }, hiddenFromEmployees: false },
            },
            include: {
                exam: {
                    select: {
                        id: true,
                        title: true,
                        description: true,
                        status: true,
                        timeLimitMin: true,
                        passMark: true,
                        dueDate: true,
                        showResults: true,
                        _count: { select: { questions: true } },
                    },
                },
            },
            orderBy: { invitedAt: "desc" },
        });

        // The employee's own responses, looked up in one query.
        const examIds = invites.map((i) => i.examId);
        const responses = examIds.length
            ? await prisma.examResponse.findMany({
                  where: { examId: { in: examIds }, employeeId: user.userId },
                  select: { examId: true, submittedAt: true, marks: true, startedAt: true },
              })
            : [];
        const respByExam = Object.fromEntries(responses.map((r) => [r.examId, r]));

        const exams = invites.map((i) => {
            const e = i.exam;
            const resp = respByExam[e.id];
            const submitted = !!resp?.submittedAt;
            // started = has a response row but not yet submitted
            const started = !!resp && !submitted;
            const closed = isExamClosed(e) && !submitted;
            const progress = submitted ? "SUBMITTED" : closed ? "CLOSED" : started ? "IN_PROGRESS" : "NOT_STARTED";
            return {
                id: e.id,
                title: e.title,
                description: e.description,
                status: e.status,
                timeLimitMin: e.timeLimitMin,
                passMark: e.passMark,
                dueDate: e.dueDate,
                closed,
                questionCount: e._count.questions,
                progress,
                submittedAt: resp?.submittedAt ?? null,
                // Only reveal the score when the exam allows it.
                marks: submitted && e.showResults ? resp.marks : null,
                passed: submitted && e.showResults ? (resp.marks ?? 0) >= e.passMark : null,
            };
        });

        const pending = exams.filter((e) => e.progress === "NOT_STARTED" || e.progress === "IN_PROGRESS").length;
        return ok({ exams, pending });
    } catch (err) {
        console.error("[GET /api/exam/my] error:", err);
        return serverError();
    }
});
