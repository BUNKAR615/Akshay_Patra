export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../lib/prisma";
import { withRole } from "../../../../lib/withRole";
import { created, fail, notFound, conflict, serverError, validateBody } from "../../../../lib/api-response";
import { evaluateSchema } from "../../../../lib/validators";
import { createNotification } from "../../../../lib/notifications";
import { getDepartmentSize, logSmallDepartmentRule } from "../../../../lib/department-rules";
import { normalizeScore, calculateStage2Score } from "../../../../lib/scoreCalculator";

/**
 * POST /api/supervisor/evaluate
 * Guards: no active quarter, employee not in shortlist, not in supervisor's dept,
 * duplicate evaluation, invalid answers, shortlist not ready.
 */
export const POST = withRole(["SUPERVISOR"], async (request, { user }) => {
    try {
        const { data, error } = await validateBody(request, evaluateSchema);
        if (error) return error;

        const activeQuarter = await prisma.quarter.findFirst({ where: { status: "ACTIVE" } });
        if (!activeQuarter) return notFound("No active quarter. Evaluations are closed.");

        // Guard: employee exists
        const employee = await prisma.user.findUnique({ where: { id: data.employeeId }, select: { id: true, departmentId: true } });
        if (!employee) return notFound("Employee not found");

        // Guard: supervisor is assigned to the employee's department (via departmentRoleMapping or primary dept)
        const deptMapping = await prisma.departmentRoleMapping.findFirst({
            where: { userId: user.userId, departmentId: employee.departmentId, role: "SUPERVISOR" },
        });
        const supervisor = await prisma.user.findUnique({ where: { id: user.userId }, select: { departmentId: true } });
        const isSupervisorForDept = !!deptMapping || (supervisor && supervisor.departmentId === employee.departmentId);

        if (!isSupervisorForDept) {
            return fail("You are not assigned as supervisor to this employee's department", 403);
        }

        const evaluatingDeptId = employee.departmentId;

        // Guard: employee must be in Stage 1 shortlist
        const shortlistEntry = await prisma.shortlistStage1.findFirst({
            where: { userId: data.employeeId, quarterId: activeQuarter.id, departmentId: evaluatingDeptId },
        });
        if (!shortlistEntry) return fail("Employee is not in the Stage 1 shortlist for your department. The shortlist may not have been generated yet.");

        // Guard: duplicate evaluation
        const existing = await prisma.supervisorEvaluation.findUnique({
            where: { supervisorId_employeeId_quarterId: { supervisorId: user.userId, employeeId: data.employeeId, quarterId: activeQuarter.id } },
        });
        if (existing) return conflict(`Already evaluated this employee on ${existing.submittedAt.toISOString()}`);

        // Validate answers against locked SUPERVISOR questions
        const locked = await prisma.quarterQuestion.findMany({
            where: { quarterId: activeQuarter.id, question: { level: "SUPERVISOR" } },
            select: { questionId: true },
        });
        const lockedIds = new Set(locked.map((q) => q.questionId));

        if (data.answers.length !== lockedIds.size) return fail(`Must answer all ${lockedIds.size} questions. Received ${data.answers.length}.`);
        const seen = new Set();
        for (const a of data.answers) {
            if (seen.has(a.questionId)) return fail(`Duplicate answer for question ${a.questionId}`);
            if (!lockedIds.has(a.questionId)) return fail(`Question "${a.questionId}" is not part of this quarter's supervisor questions`);
            seen.add(a.questionId);
        }

        const supervisorRawScore = data.answers.reduce((s, a) => s + a.score, 0);
        const supervisorNormalized = normalizeScore(supervisorRawScore, lockedIds.size);

        const selfAssessment = await prisma.selfAssessment.findUnique({
            where: { userId_quarterId: { userId: data.employeeId, quarterId: activeQuarter.id } },
            select: { normalizedScore: true },
        });
        if (!selfAssessment) return fail("Employee's self-assessment not found. They may not have submitted yet.");

        const { selfContribution, supervisorContribution, combined } = calculateStage2Score(
            selfAssessment.normalizedScore,
            supervisorNormalized
        );

        const result = await prisma.$transaction(async (tx) => {
            const evaluation = await tx.supervisorEvaluation.create({
                data: {
                    supervisorId: user.userId, employeeId: data.employeeId, quarterId: activeQuarter.id, answers: data.answers,
                    supervisorRawScore, supervisorNormalized, selfContribution, supervisorContribution, stage2CombinedScore: combined
                },
            });

            const shortlistCount = await tx.shortlistStage1.count({ where: { departmentId: evaluatingDeptId, quarterId: activeQuarter.id } });
            const evaluatedCount = await tx.supervisorEvaluation.count({ where: { supervisorId: user.userId, quarterId: activeQuarter.id, employee: { departmentId: evaluatingDeptId } } });

            let stage2Created = false;
            if (evaluatedCount >= shortlistCount) {
                // ── Small department rule: dynamic Stage 2 limit ──
                const deptLimits = await getDepartmentSize(evaluatingDeptId);
                const findArgs = { where: { supervisorId: user.userId, quarterId: activeQuarter.id, employee: { departmentId: evaluatingDeptId } }, orderBy: { stage2CombinedScore: "desc" } };
                if (deptLimits.stage2Limit !== null) {
                    findArgs.take = deptLimits.stage2Limit;
                }
                const allEvals = await tx.supervisorEvaluation.findMany(findArgs);

                await tx.shortlistStage2.deleteMany({ where: { departmentId: evaluatingDeptId, quarterId: activeQuarter.id } });

                for (let i = 0; i < allEvals.length; i++) {
                    const ev = allEvals[i];
                    const sa = await tx.selfAssessment.findUnique({ where: { userId_quarterId: { userId: ev.employeeId, quarterId: activeQuarter.id } }, select: { normalizedScore: true } });
                    await tx.shortlistStage2.create({
                        data: { userId: ev.employeeId, quarterId: activeQuarter.id, departmentId: evaluatingDeptId, selfScore: sa?.normalizedScore || 0, supervisorScore: ev.supervisorNormalized, combinedScore: ev.stage2CombinedScore, rank: i + 1 },
                    });
                }
                stage2Created = true;

                if (deptLimits.caseNumber > 0) {
                    logSmallDepartmentRule({
                        userId: user.userId, departmentId: evaluatingDeptId,
                        caseNumber: deptLimits.caseNumber, totalEmployees: deptLimits.totalEmployees,
                        quarterId: activeQuarter.id, action: "SMALL_DEPT_STAGE2_AUTO_PROMOTE",
                    });
                }
            }

            return { evaluation, stage2Created, evaluatedCount, shortlistCount };
        });

        console.log("Saved to DB (Supervisor Evaluation):", result.evaluation);

        await prisma.auditLog.create({
            data: { userId: user.userId, action: "EVALUATION_SUBMITTED", details: { employeeId: data.employeeId, quarterId: activeQuarter.id, level: "SUPERVISOR", score: supervisorNormalized, evaluationId: result.evaluation.id, combinedScore: combined, progress: `${result.evaluatedCount}/${result.shortlistCount}`, stage2Generated: result.stage2Created } },
        });

        const response = {
            message: "Evaluation submitted successfully",
            evaluation: { id: result.evaluation.id, employeeId: data.employeeId, submittedAt: result.evaluation.submittedAt, evaluated: true },
            progress: { evaluated: result.evaluatedCount, total: result.shortlistCount, remaining: result.shortlistCount - result.evaluatedCount },
        };

        if (result.stage2Created) {
            const stage2 = await prisma.shortlistStage2.findMany({
                where: { departmentId: evaluatingDeptId, quarterId: activeQuarter.id },
                select: { userId: true, user: { select: { id: true, name: true } } },
            });
            // BLIND SCORING: Only expose names, no scores/ranks/emails
            const sanitizedShortlist = stage2.map(s => ({ userId: s.userId, name: s.user.name }));
            response.stage2Shortlist = { message: "All done! Top employees auto-selected for Stage 2.", shortlist: sanitizedShortlist };

            // Notify shortlisted employees
            await createNotification(
                stage2.map((s) => s.userId),
                `You have been shortlisted for Stage 2 (Supervisor Evaluation) in ${activeQuarter.name}!`
            );
        }

        return created(response);
    } catch (err) {
        console.error("Supervisor evaluate error:", err);
        return serverError();
    }
});
