export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../lib/prisma";
import { withRole } from "../../../../lib/withRole";
import { ok, fail, serverError } from "../../../../lib/api-response";
import { resolveScopeBranch } from "../../../../lib/auth/resolveScopeBranch";

/**
 * GET /api/branch-manager/stats
 * Returns per-branch counts for the active quarter for the BM dashboard.
 *
 * Response:
 * {
 *   branchId, branchName,
 *   totalEmployees, totalWhiteCollar, totalBlueCollar,
 *   stage1: { submitted, total },
 *   stage2: { shortlisted, evaluatedByBm, totalBcEvaluated, evaluationsCompleted, pending },
 *   bmEvaluatedCount, hodBreakdown: [{ hodUserId, hodName, assigned, evaluated }]
 * }
 */
export const GET = withRole(["BRANCH_MANAGER", "ADMIN"], async (request, { user }) => {
    try {
        const quarter = await prisma.quarter.findFirst({ where: { status: "ACTIVE" } });
        if (!quarter) return fail("No active quarter");

        // BM's branch — JWT first, then BranchManagerAssignment fallback.
        const { branch } = await resolveScopeBranch(user);
        if (!branch) return fail("No branch is assigned to this user. Please contact admin.");

        // All branch-scoped counts/lists below are independent once the quarter
        // and branch are known — run them concurrently so the BM dashboard isn't
        // gated on ~6 serial Neon round-trips.
        const branchEmpFilter = { OR: [{ branchId: branch.id }, { department: { branchId: branch.id } }] };
        const [
            allEmployees,
            selfSubs,
            stage1Rows,
            stage2Rows,
            bmEvaluations,
            branchBmEvals,
            hodEvals,
            hodEmpAssignments,
        ] = await Promise.all([
            // All employees in this branch (role EMPLOYEE).
            // Match the admin branch-summary filter so BM counts stay in sync.
            prisma.user.findMany({
                where: { role: "EMPLOYEE", ...branchEmpFilter },
                select: { id: true, collarType: true },
            }),
            // Stage 1: self assessment submissions (same branch predicate as allEmployees)
            prisma.selfAssessment.count({
                where: { quarterId: quarter.id, user: branchEmpFilter },
            }),
            // Stage 1 (branch) shortlisted = those that passed the cutoff -> go to Stage 2 pool
            prisma.branchShortlistStage1.findMany({
                where: { branchId: branch.id, quarterId: quarter.id },
                select: { userId: true, collarType: true },
            }),
            // Stage 2 shortlist (post BM/HOD evaluation) — separate from Stage 1 count.
            prisma.branchShortlistStage2.findMany({
                where: { branchId: branch.id, quarterId: quarter.id },
                select: { collarType: true },
            }),
            // Stage 2: this BM's own evaluations (WC + orphaned BC in big branches).
            prisma.branchManagerEvaluation.findMany({
                where: { managerId: user.userId, quarterId: quarter.id },
                select: { employeeId: true },
            }),
            // Every BM-type evaluation in the branch — includes department POA
            // delegates — for the branch-wide completion count.
            prisma.branchManagerEvaluation.findMany({
                where: { quarterId: quarter.id, employee: { department: { branchId: branch.id } } },
                select: { employeeId: true },
            }),
            // HOD evaluations for BC in this branch
            prisma.hodEvaluation.findMany({
                where: { quarterId: quarter.id, employee: { department: { branchId: branch.id } } },
                select: { hodId: true, employeeId: true, hod: { select: { id: true, name: true, empCode: true } } },
            }),
            // HOD assignments
            prisma.employeeHodAssignment.findMany({
                where: { quarterId: quarter.id, employee: { department: { branchId: branch.id } } },
                select: { hodUserId: true, employeeId: true },
            }),
        ]);

        // Collar is the employee's own stored category — departments are not
        // collar-tagged. Unclassified employees count as blue-collar.
        const getCollar = (e) => e.collarType || "BLUE_COLLAR";
        const totalEmployees = allEmployees.length;
        const totalWhiteCollar = allEmployees.filter(e => getCollar(e) === "WHITE_COLLAR").length;
        const totalBlueCollar = allEmployees.filter(e => getCollar(e) === "BLUE_COLLAR").length;

        const stage1Count = stage1Rows.length;
        const stage1Wc = stage1Rows.filter(r => r.collarType === "WHITE_COLLAR").length;
        const stage1Bc = stage1Rows.filter(r => r.collarType === "BLUE_COLLAR").length;

        const stage2Count = stage2Rows.length;
        const stage2Wc = stage2Rows.filter(r => r.collarType === "WHITE_COLLAR").length;
        const stage2Bc = stage2Rows.filter(r => r.collarType === "BLUE_COLLAR").length;

        // Branch-wide Stage 2 progress uses the SAME rule as the admin pipeline
        // (/api/admin/quarter-progress): distinct Stage 1 cohort members scored
        // by a BM-type evaluator or an HOD. Raw row counts drifted from admin
        // (POA delegates' evaluations missing, pruned employees still counted).
        const cohort = new Set(stage1Rows.map(r => r.userId));
        const inCohort = (rows) => new Set(rows.map(r => r.employeeId).filter(id => cohort.has(id)));
        const bmDoneIds = inCohort(branchBmEvals);
        const hodDoneIds = inCohort(hodEvals);
        const completedIds = new Set([...bmDoneIds, ...hodDoneIds]);

        const bmEvaluatedCount = inCohort(bmEvaluations).size;
        const totalBcEvaluated = hodDoneIds.size;

        // "Assigned" = the HOD's coverage (lib/hodCoverage): employees linked
        // to them plus any they already evaluated, so assigned ≥ evaluated and
        // an evaluated employee is never shown as unassigned.
        const coverage = new Map(hodEmpAssignments.map(a => [a.employeeId, a.hodUserId]));
        for (const e of hodEvals) coverage.set(e.employeeId, e.hodId);
        const byHodAssign = new Map();
        for (const [employeeId, hodUserId] of coverage) {
            if (!byHodAssign.has(hodUserId)) byHodAssign.set(hodUserId, new Set());
            byHodAssign.get(hodUserId).add(employeeId);
        }
        const byHodEval = new Map();
        for (const e of hodEvals) {
            if (!byHodEval.has(e.hodId)) byHodEval.set(e.hodId, { set: new Set(), name: e.hod?.name, empCode: e.hod?.empCode });
            byHodEval.get(e.hodId).set.add(e.employeeId);
        }

        // Get HOD names for any HOD with assignments but no evals yet
        const allHodIds = new Set([...byHodAssign.keys(), ...byHodEval.keys()]);
        const hodUsers = await prisma.user.findMany({
            where: { id: { in: Array.from(allHodIds) } },
            select: { id: true, name: true, empCode: true },
        });
        const hodUserMap = new Map(hodUsers.map(u => [u.id, u]));

        const hodBreakdown = Array.from(allHodIds).map((hodId) => {
            const hu = hodUserMap.get(hodId);
            return {
                hodUserId: hodId,
                hodName: hu?.name || "—",
                hodEmpCode: hu?.empCode || "",
                assigned: byHodAssign.get(hodId)?.size || 0,
                evaluated: byHodEval.get(hodId)?.set.size || 0,
            };
        }).sort((a, b) => a.hodName.localeCompare(b.hodName));

        return ok({
            branchId: branch.id,
            branchName: branch.name,
            branchType: branch.branchType,
            totalEmployees,
            totalWhiteCollar,
            totalBlueCollar,
            totalParticipated: selfSubs,
            stage1: {
                submitted: selfSubs,
                total: totalEmployees,
                shortlisted: stage1Count,
                shortlistedWhite: stage1Wc,
                shortlistedBlue: stage1Bc,
            },
            stage2: {
                shortlisted: stage2Count,
                shortlistedWhite: stage2Wc,
                shortlistedBlue: stage2Bc,
                evaluatedByBm: bmDoneIds.size,
                totalBcEvaluated,
                evaluationsCompleted: completedIds.size,
                pending: Math.max(0, stage1Count - completedIds.size),
            },
            bmEvaluatedCount,
            hodBreakdown,
        });
    } catch (err) {
        console.error("[BM-STATS] Error:", err.message);
        return serverError();
    }
});
