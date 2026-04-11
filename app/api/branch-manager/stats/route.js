export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../lib/prisma";
import { withRole } from "../../../../lib/withRole";
import { ok, fail, serverError } from "../../../../lib/api-response";

/**
 * GET /api/branch-manager/stats
 * Returns per-branch counts for the active quarter for the BM dashboard.
 *
 * Response:
 * {
 *   branchId, branchName,
 *   totalEmployees, totalWhiteCollar, totalBlueCollar,
 *   stage1: { submitted, total },
 *   stage2: { shortlisted, evaluatedByBm, evaluatedByHods, totalBcEvaluated },
 *   bmEvaluatedCount, hodBreakdown: [{ hodUserId, hodName, assigned, evaluated }]
 * }
 */
export const GET = withRole(["BRANCH_MANAGER", "ADMIN"], async (request, { user }) => {
    try {
        const quarter = await prisma.quarter.findFirst({ where: { status: "ACTIVE" } });
        if (!quarter) return fail("No active quarter");

        // BM's branch
        const bmUser = await prisma.user.findUnique({
            where: { id: user.userId },
            select: { department: { select: { branchId: true, branch: { select: { id: true, name: true, branchType: true } } } } },
        });
        const branch = bmUser?.department?.branch;
        if (!branch) return fail("Branch not found for user");

        // All employees in this branch (role EMPLOYEE, not evaluators)
        const allEmployees = await prisma.user.findMany({
            where: {
                role: "EMPLOYEE",
                departmentRoles: { none: {} },
                department: { branchId: branch.id },
            },
            select: { id: true, collarType: true, department: { select: { collarType: true } } },
        });

        const getCollar = (e) => e.collarType || e.department?.collarType || "BLUE_COLLAR";
        const totalEmployees = allEmployees.length;
        const totalWhiteCollar = allEmployees.filter(e => getCollar(e) === "WHITE_COLLAR").length;
        const totalBlueCollar = allEmployees.filter(e => getCollar(e) === "BLUE_COLLAR").length;

        // Stage 1: self assessment submissions
        const selfSubs = await prisma.selfAssessment.count({
            where: {
                quarterId: quarter.id,
                user: { department: { branchId: branch.id } },
            },
        });

        // Stage 1 (branch) shortlisted = those that passed the cutoff -> go to Stage 2 pool
        const stage1Rows = await prisma.branchShortlistStage1.findMany({
            where: { branchId: branch.id, quarterId: quarter.id },
            select: { userId: true, collarType: true },
        });
        const stage1Count = stage1Rows.length;
        const stage1Wc = stage1Rows.filter(r => r.collarType === "WHITE_COLLAR").length;
        const stage1Bc = stage1Rows.filter(r => r.collarType === "BLUE_COLLAR").length;

        // Stage 2: BM evaluates WC; HODs evaluate BC
        // BM evaluations count (for WC in this branch)
        const bmEvaluations = await prisma.branchManagerEvaluation.findMany({
            where: {
                bmId: user.userId,
                quarterId: quarter.id,
            },
            select: { employeeId: true },
        });
        const bmEvaluatedCount = bmEvaluations.length;

        // HOD evaluations for BC in this branch
        const hodEvals = await prisma.hodEvaluation.findMany({
            where: {
                quarterId: quarter.id,
                employee: { department: { branchId: branch.id } },
            },
            select: { hodId: true, employeeId: true, hod: { select: { id: true, name: true, empCode: true } } },
        });
        const totalBcEvaluated = hodEvals.length;

        // HOD assignments
        const hodEmpAssignments = await prisma.employeeHodAssignment.findMany({
            where: {
                quarterId: quarter.id,
                employee: { department: { branchId: branch.id } },
            },
            select: { hodUserId: true, employeeId: true },
        });

        const byHodAssign = new Map();
        for (const a of hodEmpAssignments) {
            if (!byHodAssign.has(a.hodUserId)) byHodAssign.set(a.hodUserId, new Set());
            byHodAssign.get(a.hodUserId).add(a.employeeId);
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
                shortlisted: stage1Count,
                shortlistedWhite: stage1Wc,
                shortlistedBlue: stage1Bc,
                evaluatedByBm: bmEvaluatedCount,
                totalBcEvaluated,
                evaluationsCompleted: bmEvaluatedCount + totalBcEvaluated,
            },
            bmEvaluatedCount,
            hodBreakdown,
        });
    } catch (err) {
        console.error("[BM-STATS] Error:", err.message);
        return serverError();
    }
});
