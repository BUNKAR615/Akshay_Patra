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

        // ── Gather all employee data ──
        const employees = await prisma.user.findMany({
            where: { role: "EMPLOYEE" },
            select: { id: true, name: true, departmentId: true, department: { select: { name: true } } },
            orderBy: { name: "asc" },
        });

        const report = [];

        for (const emp of employees) {
            const selfA = await prisma.selfAssessment.findUnique({
                where: { userId_quarterId: { userId: emp.id, quarterId } },
                select: { normalizedScore: true, submittedAt: true },
            });

            if (!selfA) continue; // Didn't participate

            const supEval = await prisma.supervisorEvaluation.findFirst({
                where: { employeeId: emp.id, quarterId },
                select: { supervisorNormalized: true, selfContribution: true, supervisorContribution: true, stage2CombinedScore: true },
            });

            const bmEval = await prisma.branchManagerEvaluation.findFirst({
                where: { employeeId: emp.id, quarterId },
                select: { bmNormalized: true, selfContribution: true, supervisorContribution: true, bmContribution: true, stage3CombinedScore: true },
            });

            const cmEval = await prisma.clusterManagerEvaluation.findFirst({
                where: { employeeId: emp.id, quarterId },
                select: { cmNormalized: true, selfContribution: true, supervisorContribution: true, bmContribution: true, cmContribution: true, finalScore: true },
            });

            // Determine highest stage
            let stageReached = 1;
            const s1 = await prisma.shortlistStage1.findFirst({ where: { userId: emp.id, quarterId } });
            const s2 = await prisma.shortlistStage2.findFirst({ where: { userId: emp.id, quarterId } });
            const s3 = await prisma.shortlistStage3.findFirst({ where: { userId: emp.id, quarterId } });
            const best = await prisma.bestEmployee.findFirst({ where: { userId: emp.id, quarterId } });

            if (s1) stageReached = 1;
            if (supEval) stageReached = 2;
            if (s2) stageReached = 2;
            if (bmEval) stageReached = 3;
            if (s3) stageReached = 3;
            if (cmEval) stageReached = 4;
            if (best) stageReached = 4;

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
                isBestEmployee: !!best,
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
