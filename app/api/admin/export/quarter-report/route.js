export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../../lib/prisma";
import { withRole } from "../../../../../lib/withRole";
import { ok, fail, notFound, serverError } from "../../../../../lib/api-response";

/**
 * GET /api/admin/export/quarter-report?quarterId=...
 *
 * Returns a comprehensive JSON report of the quarter:
 * - All employee scores at each stage
 * - Department-level aggregates
 * - Winner details
 */
export const GET = withRole(["ADMIN"], async (request) => {
    try {
        const { searchParams } = new URL(request.url);
        let quarterId = searchParams.get("quarterId");

        // Default to active quarter, or latest
        if (!quarterId) {
            const q = await prisma.quarter.findFirst({ where: { status: "ACTIVE" } })
                || await prisma.quarter.findFirst({ orderBy: { createdAt: "desc" } });
            if (!q) return notFound("No quarters exist");
            quarterId = q.id;
        }

        const quarter = await prisma.quarter.findUnique({ where: { id: quarterId } });
        if (!quarter) return notFound("Quarter not found");

        // BLIND SCORING: Only allow full export for closed quarters
        if (quarter.status === "ACTIVE") {
            return fail("Cannot export scores for an active quarter. Blind scoring rules prevent access to numeric performance data until the quarter is closed.");
        }

        const departments = await prisma.department.findMany({
            select: { id: true, name: true },
            orderBy: { name: "asc" },
        });

        // ── Gather all employee data via batch queries (no N+1) ──
        const [
            employees,
            selfAssessments,
            supEvals,
            bmEvals,
            cmEvals,
            shortlist1s,
            shortlist2s,
            shortlist3s,
            bestEmpList,
        ] = await Promise.all([
            prisma.user.findMany({
                where: { role: "EMPLOYEE" },
                select: { id: true, name: true, departmentId: true, department: { select: { name: true } } },
                orderBy: { name: "asc" },
            }),
            prisma.selfAssessment.findMany({
                where: { quarterId },
                select: { userId: true, normalizedScore: true, submittedAt: true },
            }),
            prisma.supervisorEvaluation.findMany({
                where: { quarterId },
                select: { employeeId: true, supervisorNormalized: true, selfContribution: true, supervisorContribution: true, stage2CombinedScore: true },
            }),
            prisma.branchManagerEvaluation.findMany({
                where: { quarterId },
                select: { employeeId: true, bmNormalized: true, selfContribution: true, supervisorContribution: true, bmContribution: true, stage3CombinedScore: true },
            }),
            prisma.clusterManagerEvaluation.findMany({
                where: { quarterId },
                select: { employeeId: true, cmNormalized: true, selfContribution: true, supervisorContribution: true, bmContribution: true, cmContribution: true, finalScore: true },
            }),
            prisma.shortlistStage1.findMany({ where: { quarterId }, select: { userId: true } }),
            prisma.shortlistStage2.findMany({ where: { quarterId }, select: { userId: true } }),
            prisma.shortlistStage3.findMany({ where: { quarterId }, select: { userId: true } }),
            prisma.bestEmployee.findMany({ where: { quarterId }, select: { userId: true } }),
        ]);

        // Build lookup maps
        const selfMap = new Map(selfAssessments.map(s => [s.userId, s]));
        const supMap = new Map(supEvals.map(e => [e.employeeId, e]));
        const bmMap = new Map(bmEvals.map(e => [e.employeeId, e]));
        const cmMap = new Map(cmEvals.map(e => [e.employeeId, e]));
        const s1Set = new Set(shortlist1s.map(s => s.userId));
        const s2Set = new Set(shortlist2s.map(s => s.userId));
        const s3Set = new Set(shortlist3s.map(s => s.userId));
        const bestSet = new Set(bestEmpList.map(s => s.userId));

        const report = [];

        for (const emp of employees) {
            const selfA = selfMap.get(emp.id);
            if (!selfA) continue; // Didn't participate

            const supEval = supMap.get(emp.id) || null;
            const bmEval = bmMap.get(emp.id) || null;
            const cmEval = cmMap.get(emp.id) || null;

            let stageReached = 1;
            if (s1Set.has(emp.id)) stageReached = 1;
            if (supEval || s2Set.has(emp.id)) stageReached = 2;
            if (bmEval || s3Set.has(emp.id)) stageReached = 3;
            if (cmEval || bestSet.has(emp.id)) stageReached = 4;

            const activeEval = cmEval || bmEval || supEval;
            report.push({
                employeeName: emp.name,
                department: emp.department.name,
                departmentId: emp.departmentId,
                selfNorm: selfA.normalizedScore,
                submittedAt: selfA.submittedAt,
                selfContrib: activeEval?.selfContribution || null,
                supContrib: activeEval?.supervisorContribution || null,
                bmContrib: activeEval?.bmContribution || null,
                cmContrib: cmEval?.cmContribution || null,
                finalScore: cmEval?.finalScore || bmEval?.stage3CombinedScore || supEval?.stage2CombinedScore || selfA.normalizedScore,
                stageReached,
                isBestEmployee: bestSet.has(emp.id),
            });
        }

        // ── Department aggregates ──
        const departmentSummary = departments.map((dept) => {
            const deptEmployees = report.filter((r) => r.departmentId === dept.id);
            const totalInDept = employees.filter((e) => e.departmentId === dept.id).length;
            const participated = deptEmployees.length;
            const avgSelfScore = participated > 0
                ? deptEmployees.reduce((s, r) => s + r.selfNorm, 0) / participated
                : 0;

            return {
                department: dept.name,
                totalEmployees: totalInDept,
                participated,
                participationRate: totalInDept > 0 ? Math.round((participated / totalInDept) * 100) : 0,
                averageSelfScore: Math.round(avgSelfScore * 10) / 10,
            };
        });

        // ── Winners (one per department) ──
        const bestEmployees = await prisma.bestEmployee.findMany({
            where: { quarterId },
            include: {
                user: { select: { id: true, name: true } },
                department: { select: { name: true } },
            },
        });

        return ok({
            quarter: { id: quarter.id, name: quarter.name, status: quarter.status, startDate: quarter.startDate, endDate: quarter.endDate },
            totalParticipants: report.length,
            totalEmployees: employees.length,
            departmentSummary,
            employees: report,
            winners: bestEmployees.map(be => ({
                name: be.user.name,
                department: be.department.name,
                selfScore: be.selfScore,
                supervisorScore: be.supervisorScore,
                bmScore: be.bmScore,
                cmScore: be.cmScore,
                finalScore: be.finalScore,
            })),
            // Backward compat
            winner: bestEmployees.length > 0 ? {
                name: bestEmployees[0].user.name,
                department: bestEmployees[0].department.name,
                selfScore: bestEmployees[0].selfScore,
                supervisorScore: bestEmployees[0].supervisorScore,
                bmScore: bestEmployees[0].bmScore,
                cmScore: bestEmployees[0].cmScore,
                finalScore: bestEmployees[0].finalScore,
            } : null,
            exportedAt: new Date().toISOString(),
        });
    } catch (err) {
        console.error("Quarter report error:", err);
        return serverError();
    }
});
