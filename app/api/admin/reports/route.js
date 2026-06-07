export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../lib/prisma";
import { withRole } from "../../../../lib/withRole";
import { ok, fail, notFound, serverError } from "../../../../lib/api-response";

/**
 * GET /api/admin/reports
 *
 * Admin-only, CROSS-BRANCH live reporting dataset for the Reports tab.
 *
 * This is the global generalization of
 * /api/admin/branches/[branchId]/export/ongoing — it returns the SAME
 * per-employee evaluation row shape (all 4 stages + winner flag + current
 * stage) but for EVERY branch at once, plus filter-dropdown metadata
 * (branches, departments, roles, evaluators). The client derives every
 * report type + filter from this single payload.
 *
 * Quarter resolution: `?quarterId=` → that quarter (archive view); otherwise
 * the ACTIVE quarter; otherwise the most recent.
 *
 * NOTE on blind-scoring: like the ongoing-export route, this deliberately
 * exposes live scores to ADMIN even while the quarter is ACTIVE so admin can
 * report on evaluation progress mid-quarter.
 */
export const GET = withRole(["ADMIN"], async (request) => {
    try {
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

        // Every EMPLOYEE-role user across all branches (the evaluatee universe).
        const employees = await prisma.user.findMany({
            where: { role: "EMPLOYEE" },
            select: {
                id: true, empCode: true, name: true, designation: true, collarType: true,
                department: {
                    select: {
                        id: true, name: true,
                        branch: { select: { id: true, name: true, branchType: true } },
                    },
                },
            },
            orderBy: [{ department: { branch: { name: "asc" } } }, { department: { name: "asc" } }, { name: "asc" }],
        });
        const employeeIds = employees.map(e => e.id);

        // Filter-dropdown metadata is useful even when there are zero employees.
        const [branchesMeta, departmentsMeta] = await Promise.all([
            prisma.branch.findMany({ select: { id: true, name: true, branchType: true }, orderBy: { name: "asc" } }),
            prisma.department.findMany({
                select: { id: true, name: true, branch: { select: { name: true } } },
                orderBy: { name: "asc" },
            }),
        ]);

        if (employeeIds.length === 0) {
            return ok({
                quarter: { id: quarter.id, name: quarter.name, status: quarter.status, startDate: quarter.startDate, endDate: quarter.endDate },
                employees: [],
                branches: branchesMeta,
                departments: departmentsMeta.map(d => ({ id: d.id, name: d.name, branch: d.branch?.name || null })),
                evaluators: [],
                exportedAt: new Date().toISOString(),
            });
        }

        const userPick = { select: { id: true, name: true, empCode: true } };

        const [
            selfA, s1List, bmEvals, hodEvals, s2List, cmEvals, s3List, hrEvals, s4List, winners,
        ] = await Promise.all([
            prisma.selfAssessment.findMany({
                where: { quarterId, userId: { in: employeeIds } },
                select: { userId: true, normalizedScore: true, rawScore: true, submittedAt: true },
            }),
            prisma.branchShortlistStage1.findMany({
                where: { quarterId, userId: { in: employeeIds } },
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
                where: { quarterId, userId: { in: employeeIds } },
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
                where: { quarterId, userId: { in: employeeIds } },
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
                where: { quarterId, userId: { in: employeeIds } },
                select: { userId: true, rank: true, hrScore: true, combinedScore: true },
            }).catch(() => []),
            prisma.branchBestEmployee.findMany({
                where: { quarterId, userId: { in: employeeIds } },
                select: { userId: true, collarType: true, finalScore: true },
            }).catch(() => []),
        ]);

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

        // Collect distinct evaluators seen across every stage (for the filter).
        const evaluatorMap = new Map(); // key: `${id}|${stage}`
        const addEvaluator = (u, stage) => {
            if (!u?.id) return;
            const key = `${u.id}|${stage}`;
            if (!evaluatorMap.has(key)) {
                evaluatorMap.set(key, { id: u.id, name: u.name || "", empCode: u.empCode || "", stage });
            }
        };
        bmEvals.forEach(r => addEvaluator(r.manager, "Stage 2 (BM)"));
        hodEvals.forEach(r => addEvaluator(r.hod, "Stage 2 (HOD)"));
        cmEvals.forEach(r => addEvaluator(r.cluster, "Stage 3 (CM)"));
        hrEvals.forEach(r => addEvaluator(r.hr, "Stage 4 (HR)"));

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
                branchId: emp.department?.branch?.id || null,
                branchName: emp.department?.branch?.name || "—",
                branchType: emp.department?.branch?.branchType || null,
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
            employees: rows,
            branches: branchesMeta,
            departments: departmentsMeta.map(d => ({ id: d.id, name: d.name, branch: d.branch?.name || null })),
            evaluators: Array.from(evaluatorMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
            exportedAt: new Date().toISOString(),
        });
    } catch (err) {
        console.error("[ADMIN-REPORTS] Error:", err.message);
        return serverError();
    }
});
