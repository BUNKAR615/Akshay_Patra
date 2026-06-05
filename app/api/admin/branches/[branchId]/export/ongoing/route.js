export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../../../../lib/prisma";
import { withRole } from "../../../../../../../lib/withRole";
import { ok, fail, notFound, serverError } from "../../../../../../../lib/api-response";
import { requireBranchScope } from "../../../../../../../lib/auth/requireBranchScope";
import { resolveBranch } from "../../../../../../../lib/resolveBranch";

/**
 * GET /api/admin/branches/[branchId]/export/ongoing
 *
 * Admin-only branch-scoped export of the ONGOING evaluation pipeline.
 *
 * Returns per-employee evaluation status for the active quarter:
 *  - Stage 1 (self-assessment) — submitted flag, raw + normalized scores, S1 shortlist rank
 *  - Stage 2 (BM + HOD)        — evaluator name, raw + normalized + combined score
 *                                 (BM evaluates white-collar; HOD evaluates blue-collar in BIG branches)
 *  - Stage 3 (CM)              — evaluator name, raw + normalized + final score
 *  - Stage 4 (HR)              — HR scorer name, hr score, attendance / hours, combined
 *  - currentStage              — highest stage that has a record/shortlist for this employee
 *  - isWinner                  — true if in BranchBestEmployee
 *
 * SCOPE: every query is filtered by branchId. Employees are sourced via
 *        `department.branchId === branchId` plus assignment-table joins are
 *        not needed (this is purely about EVALUATEES, not evaluators).
 *
 * NOTE on blind-scoring policy: the existing /api/admin/export/quarter-report
 * blocks score export for an ACTIVE quarter (blind-scoring rule). This route
 * is the deliberate admin-side override scoped to a single branch — it is
 * required so admin can audit evaluation progress mid-quarter. Branch-scoped
 * only; no cross-branch leak.
 */
export const GET = withRole(["ADMIN"], async (request, { params, user }) => {
    try {
        const { branchId: slugOrId, error } = requireBranchScope(user, params);
        if (error) return error;

        const branch = await resolveBranch(slugOrId);
        if (!branch) return notFound("Branch not found");
        const branchId = branch.id;

        // Resolve quarter: explicit `?quarterId=` → that quarter (archive view);
        // otherwise active quarter, fall back to most recent.
        const { searchParams } = new URL(request.url);
        const requestedQuarterId = searchParams.get("quarterId");
        let quarter = null;
        if (requestedQuarterId) {
            quarter = await prisma.quarter.findUnique({ where: { id: requestedQuarterId } });
            if (!quarter) return notFound("Quarter not found");
        } else {
            quarter = await prisma.quarter.findFirst({ where: { status: "ACTIVE" } });
            if (!quarter) {
                quarter = await prisma.quarter.findFirst({ orderBy: { createdAt: "desc" } });
            }
        }
        if (!quarter) return fail("No quarters exist yet");
        const quarterId = quarter.id;

        // Branch-scoped employee universe: EMPLOYEE-role users whose dept is in this branch.
        const employees = await prisma.user.findMany({
            where: {
                role: "EMPLOYEE",
                department: { branchId },
            },
            select: {
                id: true, empCode: true, name: true, designation: true, collarType: true,
                department: { select: { id: true, name: true } },
            },
            orderBy: [{ department: { name: "asc" } }, { name: "asc" }],
        });
        const employeeIds = employees.map(e => e.id);

        if (employeeIds.length === 0) {
            return ok({
                quarter: { id: quarter.id, name: quarter.name, status: quarter.status },
                branch: { id: branch.id, name: branch.name, branchType: branch.branchType },
                employees: [],
                exportedAt: new Date().toISOString(),
            });
        }

        const userPick = { select: { id: true, name: true, empCode: true } };

        // All evaluation tables: scope strictly to (employeeId IN branchEmployees, quarterId).
        // BranchShortlist* models already carry branchId so we filter on that directly.
        const [
            selfA, s1List, bmEvals, hodEvals, s2List, cmEvals, s3List, hrEvals, s4List, winners,
        ] = await Promise.all([
            prisma.selfAssessment.findMany({
                where: { quarterId, userId: { in: employeeIds } },
                select: { userId: true, normalizedScore: true, rawScore: true, submittedAt: true },
            }),
            prisma.branchShortlistStage1.findMany({
                where: { quarterId, branchId },
                select: { userId: true, rank: true, selfScore: true, collarType: true },
            }),
            prisma.branchManagerEvaluation.findMany({
                where: { quarterId, employeeId: { in: employeeIds } },
                select: {
                    employeeId: true, submittedAt: true,
                    bmRawScore: true, bmNormalized: true, bmContribution: true,
                    selfContribution: true, stage3CombinedScore: true,
                    manager: userPick,
                },
            }),
            prisma.hodEvaluation.findMany({
                where: { quarterId, employeeId: { in: employeeIds } },
                select: {
                    employeeId: true, submittedAt: true,
                    hodRawScore: true, hodNormalized: true, hodContribution: true,
                    selfContribution: true, stage2CombinedScore: true,
                    hod: userPick,
                },
            }),
            prisma.branchShortlistStage2.findMany({
                where: { quarterId, branchId },
                select: { userId: true, rank: true, selfScore: true, evaluatorScore: true, combinedScore: true, collarType: true },
            }),
            prisma.clusterManagerEvaluation.findMany({
                where: { quarterId, employeeId: { in: employeeIds } },
                select: {
                    employeeId: true, submittedAt: true,
                    cmRawScore: true, cmNormalized: true, cmContribution: true,
                    finalScore: true, cluster: userPick,
                },
            }),
            prisma.branchShortlistStage3.findMany({
                where: { quarterId, branchId },
                select: { userId: true, rank: true, cmScore: true, combinedScore: true },
            }),
            prisma.hrEvaluation.findMany({
                where: { quarterId, employeeId: { in: employeeIds } },
                select: {
                    employeeId: true, submittedAt: true,
                    hrScore: true, attendancePct: true, workingHours: true,
                    stage4CombinedScore: true, hr: userPick,
                },
            }).catch(() => []),
            prisma.branchShortlistStage4.findMany({
                where: { quarterId, branchId },
                select: { userId: true, rank: true, hrScore: true, combinedScore: true },
            }).catch(() => []),
            prisma.branchBestEmployee.findMany({
                where: { quarterId, branchId },
                select: { userId: true, collarType: true, finalScore: true },
            }).catch(() => []),
        ]);

        // Build O(1) lookup maps keyed on user/employee id.
        const selfMap = new Map(selfA.map(r => [r.userId, r]));
        const s1Map = new Map(s1List.map(r => [r.userId, r]));
        const bmMap = new Map(bmEvals.map(r => [r.employeeId, r]));
        const hodMap = new Map(hodEvals.map(r => [r.employeeId, r]));
        const s2Map = new Map(s2List.map(r => [r.userId, r]));
        const cmMap = new Map(cmEvals.map(r => [r.employeeId, r]));
        const s3Map = new Map(s3List.map(r => [r.userId, r]));
        const hrMap = new Map(hrEvals.map(r => [r.employeeId, r]));
        const s4Map = new Map(s4List.map(r => [r.userId, r]));
        const winnerSet = new Set(winners.map(w => w.userId));

        const rows = employees.map(emp => {
            const s = selfMap.get(emp.id) || null;
            const s1 = s1Map.get(emp.id) || null;
            const bm = bmMap.get(emp.id) || null;
            const hod = hodMap.get(emp.id) || null;
            const s2 = s2Map.get(emp.id) || null;
            const cm = cmMap.get(emp.id) || null;
            const s3 = s3Map.get(emp.id) || null;
            const hr = hrMap.get(emp.id) || null;
            const s4 = s4Map.get(emp.id) || null;
            const isWinner = winnerSet.has(emp.id);

            // Highest stage reached (a stage counts if there's a shortlist row OR an eval).
            let currentStage = 0;
            if (s) currentStage = 1;
            if (s1) currentStage = 1;
            if (bm || hod || s2) currentStage = 2;
            if (cm || s3) currentStage = 3;
            if (hr || s4) currentStage = 4;
            if (isWinner) currentStage = 5;

            return {
                userId: emp.id,
                empCode: emp.empCode || "",
                name: emp.name,
                department: emp.department?.name || "—",
                designation: emp.designation || "",
                collarType: emp.collarType || null,

                stage1: {
                    submitted: !!s,
                    rawScore: s?.rawScore ?? null,
                    normalizedScore: s?.normalizedScore ?? null,
                    submittedAt: s?.submittedAt ?? null,
                    shortlisted: !!s1,
                    shortlistRank: s1?.rank ?? null,
                    shortlistSelfScore: s1?.selfScore ?? null,
                },
                stage2: {
                    bmEval: bm ? {
                        evaluatorEmpCode: bm.manager?.empCode || "",
                        evaluatorName: bm.manager?.name || "",
                        rawScore: bm.bmRawScore,
                        normalizedScore: bm.bmNormalized,
                        evaluatorContribution: bm.bmContribution,
                        selfContribution: bm.selfContribution,
                        combinedScore: bm.stage3CombinedScore,
                        submittedAt: bm.submittedAt,
                    } : null,
                    hodEval: hod ? {
                        evaluatorEmpCode: hod.hod?.empCode || "",
                        evaluatorName: hod.hod?.name || "",
                        rawScore: hod.hodRawScore,
                        normalizedScore: hod.hodNormalized,
                        evaluatorContribution: hod.hodContribution,
                        selfContribution: hod.selfContribution,
                        combinedScore: hod.stage2CombinedScore,
                        submittedAt: hod.submittedAt,
                    } : null,
                    shortlisted: !!s2,
                    shortlistRank: s2?.rank ?? null,
                    shortlistEvaluatorScore: s2?.evaluatorScore ?? null,
                    shortlistCombinedScore: s2?.combinedScore ?? null,
                },
                stage3: {
                    cmEval: cm ? {
                        evaluatorEmpCode: cm.cluster?.empCode || "",
                        evaluatorName: cm.cluster?.name || "",
                        rawScore: cm.cmRawScore,
                        normalizedScore: cm.cmNormalized,
                        evaluatorContribution: cm.cmContribution,
                        finalScore: cm.finalScore,
                        submittedAt: cm.submittedAt,
                    } : null,
                    shortlisted: !!s3,
                    shortlistRank: s3?.rank ?? null,
                    shortlistCmScore: s3?.cmScore ?? null,
                    shortlistCombinedScore: s3?.combinedScore ?? null,
                },
                stage4: {
                    hrEval: hr ? {
                        evaluatorEmpCode: hr.hr?.empCode || "",
                        evaluatorName: hr.hr?.name || "",
                        hrScore: hr.hrScore,
                        attendancePct: hr.attendancePct,
                        // `workingHours` column now persists the punctuality %; expose
                        // it under a clear alias while keeping the legacy key.
                        workingHours: hr.workingHours,
                        punctualityPct: hr.workingHours,
                        combinedScore: hr.stage4CombinedScore,
                        submittedAt: hr.submittedAt,
                    } : null,
                    shortlisted: !!s4,
                    shortlistRank: s4?.rank ?? null,
                    shortlistHrScore: s4?.hrScore ?? null,
                    shortlistCombinedScore: s4?.combinedScore ?? null,
                },
                isWinner,
                currentStage,
            };
        });

        return ok({
            quarter: {
                id: quarter.id,
                name: quarter.name,
                status: quarter.status,
                startDate: quarter.startDate,
                endDate: quarter.endDate,
            },
            branch: {
                id: branch.id,
                name: branch.name,
                slug: branch.slug,
                branchType: branch.branchType,
            },
            employees: rows,
            exportedAt: new Date().toISOString(),
        });
    } catch (err) {
        console.error("[BRANCH-ONGOING-EXPORT] Error:", err.message);
        return serverError();
    }
});
