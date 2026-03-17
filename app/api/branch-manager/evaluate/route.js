import prisma from "../../../../lib/prisma";
import { withRole } from "../../../../lib/withRole";
import { created, fail, notFound, conflict, serverError, validateBody } from "../../../../lib/api-response";
import { evaluateSchema } from "../../../../lib/validators";
import { createNotification } from "../../../../lib/notifications";
import { getDepartmentSize, logSmallDepartmentRule } from "../../../../lib/department-rules";
import { normalizeScore, calculateStage3Score } from "../../../../lib/scoreCalculator";

/**
 * POST /api/branch-manager/evaluate
 * Guards: no active quarter, employee not in Stage 2 shortlist, 
 * duplicate evaluation, shortlist not ready, missing prior scores.
 */
export const POST = withRole(["BRANCH_MANAGER"], async (request, { user }) => {
    try {
        const { data, error } = await validateBody(request, evaluateSchema);
        if (error) return error;

        const activeQuarter = await prisma.quarter.findFirst({ where: { status: "ACTIVE" } });
        if (!activeQuarter) return notFound("No active quarter. Evaluations are closed.");

        const employee = await prisma.user.findUnique({ where: { id: data.employeeId }, select: { id: true, departmentId: true } });
        if (!employee) return notFound("Employee not found");

        // Guard: employee in Stage 2 shortlist (for their department)
        const shortlistEntry = await prisma.shortlistStage2.findFirst({
            where: { userId: data.employeeId, quarterId: activeQuarter.id, departmentId: employee.departmentId },
        });
        if (!shortlistEntry) return fail("Employee is not in the Stage 2 shortlist. Supervisor evaluations may not be complete.");

        // Guard: duplicate
        const existing = await prisma.branchManagerEvaluation.findUnique({
            where: { managerId_employeeId_quarterId: { managerId: user.userId, employeeId: data.employeeId, quarterId: activeQuarter.id } },
        });
        if (existing) return conflict(`Already evaluated this employee on ${existing.submittedAt.toISOString()}`);

        // Validate answers
        const locked = await prisma.quarterQuestion.findMany({
            where: { quarterId: activeQuarter.id, question: { level: "BRANCH_MANAGER" } }, select: { questionId: true },
        });
        const lockedIds = new Set(locked.map((q) => q.questionId));
        if (data.answers.length !== lockedIds.size) return fail(`Must answer all ${lockedIds.size} questions. Received ${data.answers.length}.`);
        const seen = new Set();
        for (const a of data.answers) {
            if (seen.has(a.questionId)) return fail(`Duplicate answer for question ${a.questionId}`);
            if (!lockedIds.has(a.questionId)) return fail(`Question "${a.questionId}" is not part of this quarter's BM questions`);
            seen.add(a.questionId);
        }

        const bmRawScore = data.answers.reduce((s, a) => s + a.score, 0);
        const bmNormalized = normalizeScore(bmRawScore, lockedIds.size);

        // Guard: prior scores exist
        const selfA = await prisma.selfAssessment.findUnique({ where: { userId_quarterId: { userId: data.employeeId, quarterId: activeQuarter.id } }, select: { normalizedScore: true } });
        const supEval = await prisma.supervisorEvaluation.findFirst({ where: { employeeId: data.employeeId, quarterId: activeQuarter.id }, select: { supervisorNormalized: true } });
        if (!selfA || !supEval) return fail("Employee's prior evaluation scores not found. Earlier stages may be incomplete.");

        const { selfContribution, supervisorContribution, bmContribution, combined } = calculateStage3Score(
            selfA.normalizedScore,
            supEval.supervisorNormalized,
            bmNormalized
        );

        const result = await prisma.$transaction(async (tx) => {
            const evaluation = await tx.branchManagerEvaluation.create({
                data: { managerId: user.userId, employeeId: data.employeeId, quarterId: activeQuarter.id, answers: data.answers, bmRawScore, bmNormalized, selfContribution, supervisorContribution, bmContribution, stage3CombinedScore: combined },
            });

            const shortlistCount = await tx.shortlistStage2.count({ where: { departmentId: employee.departmentId, quarterId: activeQuarter.id } });
            const evaluatedCount = await tx.branchManagerEvaluation.count({
                where: { managerId: user.userId, quarterId: activeQuarter.id, employee: { departmentId: employee.departmentId } }
            });

            let stage3Created = false;
            if (evaluatedCount >= shortlistCount) {
                // ── Small department rule: dynamic Stage 3 limit ──
                const deptLimits = await getDepartmentSize(employee.departmentId);
                const findArgs = {
                    where: { managerId: user.userId, quarterId: activeQuarter.id, employee: { departmentId: employee.departmentId } },
                    orderBy: { stage3CombinedScore: "desc" }
                };
                if (deptLimits.stage3Limit !== null) {
                    findArgs.take = deptLimits.stage3Limit;
                }
                const allEvals = await tx.branchManagerEvaluation.findMany(findArgs);
                await tx.shortlistStage3.deleteMany({ where: { departmentId: employee.departmentId, quarterId: activeQuarter.id } });

                for (let i = 0; i < allEvals.length; i++) {
                    const ev = allEvals[i];
                    const sa = await tx.selfAssessment.findUnique({ where: { userId_quarterId: { userId: ev.employeeId, quarterId: activeQuarter.id } }, select: { normalizedScore: true } });
                    const se = await tx.supervisorEvaluation.findFirst({ where: { employeeId: ev.employeeId, quarterId: activeQuarter.id }, select: { supervisorNormalized: true } });
                    await tx.shortlistStage3.create({
                        data: { userId: ev.employeeId, quarterId: activeQuarter.id, departmentId: employee.departmentId, selfScore: sa?.normalizedScore || 0, supervisorScore: se?.supervisorNormalized || 0, bmScore: ev.bmNormalized, combinedScore: ev.stage3CombinedScore, rank: i + 1 },
                    });
                }
                stage3Created = true;

                if (deptLimits.caseNumber > 0) {
                    logSmallDepartmentRule({
                        userId: user.userId, departmentId: employee.departmentId,
                        caseNumber: deptLimits.caseNumber, totalEmployees: deptLimits.totalEmployees,
                        quarterId: activeQuarter.id, action: "SMALL_DEPT_STAGE3_AUTO_PROMOTE",
                    });
                }
            }

            return { evaluation, stage3Created, evaluatedCount, shortlistCount };
        });

        await prisma.auditLog.create({
            data: { userId: user.userId, action: "BM_EVALUATION_SUBMITTED", details: { evaluationId: result.evaluation.id, employeeId: data.employeeId, quarterId: activeQuarter.id, bmScore: bmNormalized, combinedScore: combined, progress: `${result.evaluatedCount}/${result.shortlistCount}`, stage3Generated: result.stage3Created } },
        });

        const response = {
            message: "Evaluation submitted successfully",
            evaluation: { id: result.evaluation.id, employeeId: data.employeeId, bmScore: bmNormalized, combinedScore: combined, submittedAt: result.evaluation.submittedAt },
            progress: { evaluated: result.evaluatedCount, total: result.shortlistCount, remaining: result.shortlistCount - result.evaluatedCount },
        };

        if (result.stage3Created) {
            const stage3 = await prisma.shortlistStage3.findMany({
                where: { departmentId: employee.departmentId, quarterId: activeQuarter.id }, orderBy: { rank: "asc" },
                include: { user: { select: { id: true, name: true, email: true } } },
            });
            response.stage3Shortlist = { message: "All done! Top 3 auto-selected for Stage 3.", shortlist: stage3 };

            // Notify shortlisted employees
            await createNotification(
                stage3.map((s) => s.userId),
                `You have been shortlisted for Stage 3 (Branch Manager Evaluation) in ${activeQuarter.name}!`
            );
        }

        return created(response);
    } catch (err) {
        console.error("BM evaluate error:", err);
        return serverError();
    }
});
