export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../lib/prisma";
import { withRole } from "../../../../lib/withRole";
import { ok, fail, serverError, validateBody } from "../../../../lib/api-response";
import { evaluateSchema } from "../../../../lib/validators";
import { normalizeScore, calculateBranchStage2Score } from "../../../../lib/scoreCalculator";
import { getBigBranchCollarLimits } from "../../../../lib/branchRules";
import { createNotification } from "../../../../lib/notifications";

/**
 * POST /api/hod/evaluate
 * HOD evaluates blue collar employees assigned to them (big branch only).
 * When all HODs finish, the top 10 blue collar employees are shortlisted to Stage 2.
 */
export const POST = withRole(["HOD"], async (request, { user }) => {
    try {
        const { data, error } = await validateBody(request, evaluateSchema);
        if (error) return error;

        const { employeeId, answers } = data;

        // Get active quarter
        const quarter = await prisma.quarter.findFirst({ where: { status: "ACTIVE" } });
        if (!quarter) return fail("No active quarter");

        // Verify HOD has this employee assigned
        const employee = await prisma.user.findUnique({
            where: { id: employeeId },
            select: { id: true, name: true, departmentId: true, collarType: true, department: { select: { branchId: true } } }
        });
        if (!employee) return fail("Employee not found");
        if (employee.collarType !== "BLUE_COLLAR") return fail("HOD can only evaluate blue collar employees");

        // HOD-employee link check.
        //
        // In the new BM flow, the BM nominates an HOD (HodAssignment is on the
        // HOD's WHITE_COLLAR home department) and then attaches BC employees
        // to that HOD per-employee via EmployeeHodAssignment — so a BC
        // employee's `departmentId` will almost never equal the HOD's
        // HodAssignment.departmentId. The previous dept-level check therefore
        // rejected every legitimate submission (e.g. Om Prakash → Ajay K R).
        //
        // We now consult EmployeeHodAssignment first (the BM's explicit
        // per-employee link). If that row exists for the active quarter, it
        // IS the source of truth; otherwise we fall back to the legacy
        // dept-level HodAssignment so seeded / older data keeps working.
        const empHodLink = await prisma.employeeHodAssignment.findUnique({
            where: { employeeId_quarterId: { employeeId, quarterId: quarter.id } },
            select: { hodUserId: true },
        });
        if (empHodLink) {
            if (empHodLink.hodUserId !== user.userId) {
                return fail("You are not the HOD assigned to evaluate this employee");
            }
        } else {
            const hodAssignment = await prisma.hodAssignment.findFirst({
                where: {
                    hodUserId: user.userId,
                    departmentId: employee.departmentId,
                    quarterId: quarter.id,
                },
            });
            if (!hodAssignment) return fail("You are not assigned as HOD for this employee");
        }

        // Verify employee is in Stage 1 shortlist
        const inShortlist = await prisma.branchShortlistStage1.findUnique({
            where: { userId_quarterId: { userId: employeeId, quarterId: quarter.id } }
        });
        if (!inShortlist) return fail("Employee is not in Stage 1 shortlist");

        // Check duplicate evaluation
        const existing = await prisma.hodEvaluation.findUnique({
            where: { hodId_employeeId_quarterId: { hodId: user.userId, employeeId, quarterId: quarter.id } }
        });
        if (existing) return fail("You have already evaluated this employee");

        // HOD evaluators reuse the BRANCH_MANAGER question bank — there is
        // no separate HOD bank loaded at quarter start (see
        // app/api/admin/quarters/start/route.js and the comment on
        // app/api/hod/questions/route.js). Validating against `level: "HOD"`
        // here was rejecting every submission because no HOD-level rows
        // exist in QuarterQuestion. Align with the questions route so the
        // IDs the dashboard renders are the IDs we accept.
        const hodQuestions = await prisma.quarterQuestion.findMany({
            where: { quarterId: quarter.id, question: { level: "BRANCH_MANAGER" } },
            select: { questionId: true },
        });
        const validQIds = new Set(hodQuestions.map(q => q.questionId));
        for (const ans of answers) {
            if (!validQIds.has(ans.questionId)) return fail("Invalid question in submission");
        }

        // Calculate scores
        const rawScore = answers.reduce((sum, a) => sum + a.score, 0);
        const hodNormalized = normalizeScore(rawScore, answers.length);

        // Get self-assessment score
        const selfAssessment = await prisma.selfAssessment.findUnique({
            where: { userId_quarterId: { userId: employeeId, quarterId: quarter.id } }
        });
        if (!selfAssessment) return fail("Employee has not completed self-assessment");

        const selfNorm = selfAssessment.normalizedScore;
        const { selfContribution, evaluatorContribution, combined } = calculateBranchStage2Score(selfNorm, hodNormalized);

        // Save evaluation
        await prisma.hodEvaluation.create({
            data: {
                hodId: user.userId,
                employeeId,
                quarterId: quarter.id,
                answers,
                hodRawScore: rawScore,
                hodNormalized,
                selfContribution,
                hodContribution: evaluatorContribution,
                stage2CombinedScore: combined
            }
        });

        await prisma.auditLog.create({
            data: {
                userId: user.userId,
                action: "HOD_EVALUATION",
                details: { employeeId, quarterId: quarter.id, hodNormalized, combined }
            }
        }).catch(() => {});

        // Check if ALL HODs have evaluated ALL their assigned blue collar Stage 1 employees.
        //
        // Same shift as above: with per-employee EmployeeHodAssignment we no
        // longer match HOD ⇄ employee through `department`. For each BC
        // Stage-1 employee we read their per-employee HOD link; only
        // employees that ARE attached to some HOD count toward completion
        // (unassigned ones legitimately stay with the BM and shouldn't
        // block Stage-2 generation).
        const branchId = employee.department.branchId;
        const bcStage1 = await prisma.branchShortlistStage1.findMany({
            where: { branchId, quarterId: quarter.id, collarType: "BLUE_COLLAR" },
            select: { userId: true },
        });
        const bcUserIds = bcStage1.map((s) => s.userId);
        const empHodRows = bcUserIds.length > 0
            ? await prisma.employeeHodAssignment.findMany({
                where: { quarterId: quarter.id, employeeId: { in: bcUserIds } },
                select: { employeeId: true, hodUserId: true },
            })
            : [];
        const hodByEmp = new Map(empHodRows.map((r) => [r.employeeId, r.hodUserId]));

        let allComplete = true;
        for (const emp of bcStage1) {
            const hodUserId = hodByEmp.get(emp.userId);
            if (!hodUserId) continue; // Not attached to any HOD — BM evaluates.
            const evalExists = await prisma.hodEvaluation.findUnique({
                where: { hodId_employeeId_quarterId: { hodId: hodUserId, employeeId: emp.userId, quarterId: quarter.id } },
            });
            if (!evalExists) { allComplete = false; break; }
        }

        if (allComplete && bcStage1.length > 0) {
            // Generate Stage 2 shortlist for BC track
            const bcLimits = getBigBranchCollarLimits("BLUE_COLLAR");

            // Get all HOD evaluations for BC employees
            const allEvals = await prisma.hodEvaluation.findMany({
                where: { quarterId: quarter.id, employee: { department: { branchId }, collarType: "BLUE_COLLAR" } },
                orderBy: { stage2CombinedScore: "desc" }
            });

            // Take top N
            const topN = allEvals.slice(0, bcLimits.stage2Limit);

            for (let i = 0; i < topN.length; i++) {
                const ev = topN[i];
                await prisma.branchShortlistStage2.upsert({
                    where: { userId_quarterId: { userId: ev.employeeId, quarterId: quarter.id } },
                    update: {
                        collarType: "BLUE_COLLAR",
                        selfScore: ev.selfContribution,
                        evaluatorScore: ev.hodContribution,
                        combinedScore: ev.stage2CombinedScore,
                        rank: i + 1
                    },
                    create: {
                        userId: ev.employeeId,
                        quarterId: quarter.id,
                        branchId,
                        collarType: "BLUE_COLLAR",
                        selfScore: ev.selfContribution,
                        evaluatorScore: ev.hodContribution,
                        combinedScore: ev.stage2CombinedScore,
                        rank: i + 1
                    }
                });
            }

            // Notify shortlisted employees
            for (const ev of topN) {
                await createNotification(ev.employeeId, "You have been shortlisted to Stage 2 (HOD evaluation complete). Cluster Manager will evaluate next.")
                    .catch((err) => { console.error(`[HOD-EVALUATE] Stage 2 notification failed for user ${ev.employeeId}:`, err); });
            }
        }

        return ok({ message: "Evaluation submitted successfully", stage2CombinedScore: combined });
    } catch (err) {
        console.error("[HOD-EVALUATE] Error:", err.message, err.stack);
        return serverError();
    }
});
