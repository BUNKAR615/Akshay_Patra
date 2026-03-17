import prisma from "../../../../lib/prisma";
import { withRole } from "../../../../lib/withRole";
import { created, fail, notFound, conflict, serverError, validateBody } from "../../../../lib/api-response";
import { submitAssessmentSchema } from "../../../../lib/validators";
import { getDepartmentSize, logSmallDepartmentRule } from "../../../../lib/department-rules";
import { normalizeScore } from "../../../../lib/scoreCalculator";

/**
 * POST /api/assessment/submit
 * Guards: no active quarter, duplicate submission, invalid/missing answers,
 * duplicate questionIds, questions not in locked set.
 */
export const POST = withRole(["EMPLOYEE"], async (request, { user }) => {
    try {
        const { data, error } = await validateBody(request, submitAssessmentSchema);
        if (error) return error;

        const activeQuarter = await prisma.quarter.findFirst({ where: { status: "ACTIVE" } });
        if (!activeQuarter) return notFound("No active quarter. Self-assessment submissions are closed.");

        // Guard: already submitted
        const existing = await prisma.selfAssessment.findUnique({
            where: { userId_quarterId: { userId: user.userId, quarterId: activeQuarter.id } },
        });
        if (existing) return conflict(`You already submitted on ${existing.submittedAt.toISOString()}`);

        // Guard: validate answers against locked SELF questions
        const lockedQuestions = await prisma.quarterQuestion.findMany({
            where: { quarterId: activeQuarter.id, question: { level: "SELF" } },
            select: { questionId: true },
        });
        const lockedIds = new Set(lockedQuestions.map((q) => q.questionId));

        // Guard: must answer all questions
        if (data.answers.length !== lockedIds.size) {
            return fail(`Must answer all ${lockedIds.size} questions. Received ${data.answers.length}.`);
        }

        // Guard: no duplicates
        const seen = new Set();
        for (const a of data.answers) {
            if (seen.has(a.questionId)) return fail(`Duplicate answer for question ${a.questionId}`);
            if (!lockedIds.has(a.questionId)) return fail(`Question "${a.questionId}" is not part of this quarter's self-assessment`);
            seen.add(a.questionId);
        }

        const rawScore = data.answers.reduce((s, a) => s + a.score, 0);
        const maxScore = lockedIds.size * 2;
        const normalizedScore = normalizeScore(rawScore, lockedIds.size);

        const employee = await prisma.user.findUnique({ where: { id: user.userId }, select: { departmentId: true } });

        // Guard: department must have a supervisor assigned
        const hasSupervisor = await prisma.departmentRole.findFirst({
            where: { departmentId: employee.departmentId, role: "SUPERVISOR" },
        });
        if (!hasSupervisor) {
            return fail("No supervisor assigned for your department. Please contact admin.");
        }

        const result = await prisma.$transaction(async (tx) => {
            const assessment = await tx.selfAssessment.create({
                data: { userId: user.userId, quarterId: activeQuarter.id, answers: data.answers, rawScore, maxScore, normalizedScore, submittedAt: new Date() },
            });

            // ── Small department rule: dynamic Stage 1 limit ──
            const deptLimits = await getDepartmentSize(employee.departmentId);

            const findArgs = {
                where: { quarterId: activeQuarter.id, user: { departmentId: employee.departmentId } },
                orderBy: { normalizedScore: "desc" },
                select: { userId: true, normalizedScore: true },
            };
            // If stage1Limit is null → take ALL (small department)
            if (deptLimits.stage1Limit !== null) {
                findArgs.take = deptLimits.stage1Limit;
            }

            const departmentScores = await tx.selfAssessment.findMany(findArgs);

            await tx.shortlistStage1.deleteMany({
                where: { departmentId: employee.departmentId, quarterId: activeQuarter.id },
            });

            if (departmentScores.length > 0) {
                await tx.shortlistStage1.createMany({
                    data: departmentScores.map((s, i) => ({
                        userId: s.userId, quarterId: activeQuarter.id, departmentId: employee.departmentId,
                        selfScore: s.normalizedScore, rank: i + 1,
                    })),
                });
            }

            // Log if small department rule was applied
            if (deptLimits.caseNumber > 0) {
                logSmallDepartmentRule({
                    userId: user.userId, departmentId: employee.departmentId,
                    caseNumber: deptLimits.caseNumber, totalEmployees: deptLimits.totalEmployees,
                    quarterId: activeQuarter.id, action: "SMALL_DEPT_STAGE1_AUTO_PROMOTE",
                });
            }

            return assessment;
        });
        console.log("Saved to DB (Self Assessment):", result);

        await prisma.auditLog.create({
            data: { userId: user.userId, action: "ASSESSMENT_SUBMITTED", details: { quarterId: activeQuarter.id, score: normalizedScore } },
        });

        return created({ message: "Self-assessment submitted successfully", assessment: { id: result.id, normalizedScore, submittedAt: result.submittedAt } });
    } catch (err) {
        console.error("Submit assessment error:", err);
        return serverError();
    }
});
