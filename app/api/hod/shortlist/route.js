export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../lib/prisma";
import { withRole } from "../../../../lib/withRole";
import { ok, fail, serverError } from "../../../../lib/api-response";

/**
 * GET /api/hod/shortlist
 * HOD sees blue collar employees assigned to them for evaluation.
 */
export const GET = withRole(["HOD"], async (request, { user }) => {
    try {
        const quarter = await prisma.quarter.findFirst({ where: { status: "ACTIVE" } });
        if (!quarter) return fail("No active quarter");

        // The BM's per-employee links are the only grant — exactly the list the
        // BM dashboard shows under this HOD (no department-level fallback; see
        // lib/hodCoverage).
        const [empAssignments, hodAssignments] = await Promise.all([
            prisma.employeeHodAssignment.findMany({
                where: { hodUserId: user.userId, quarterId: quarter.id },
                select: { employeeId: true },
            }),
            // Nominated departments — display only.
            prisma.hodAssignment.findMany({
                where: { hodUserId: user.userId, quarterId: quarter.id },
                include: { department: { select: { id: true, name: true, branchId: true } } }
            }),
        ]);
        const assignedEmployeeIds = empAssignments.map(a => a.employeeId);

        if (assignedEmployeeIds.length === 0) {
            return ok({ employees: [], message: "No employees assigned to you for this quarter" });
        }

        const shortlisted = await prisma.branchShortlistStage1.findMany({
            // No collar filter on the Stage-1 snapshot: the assign route already
            // refuses white-collar employees, and unclassified (null) ones are
            // blue-collar everywhere else (BM queue, Stage 2 promotion).
            where: { quarterId: quarter.id, userId: { in: assignedEmployeeIds } },
            include: {
                user: {
                    select: { id: true, name: true, empCode: true, designation: true, departmentId: true,
                        department: { select: { name: true } } }
                }
            },
            orderBy: { rank: "asc" }
        });

        // Check which employees HOD has already evaluated
        const evaluations = await prisma.hodEvaluation.findMany({
            where: { hodId: user.userId, quarterId: quarter.id },
            select: { employeeId: true, hodNormalized: true, hodRawScore: true }
        });
        const evalMap = new Map(evaluations.map(e => [e.employeeId, e]));

        const employees = shortlisted.map(s => {
            const ev = evalMap.get(s.user.id);
            return {
                ...s.user,
                selfScore: s.selfScore,
                rank: s.rank,
                evaluated: !!ev,
                isEvaluated: !!ev,
                // Scores are intentionally NOT returned — only the Committee
                // may see evaluation scores.
            };
        });

        const evaluatedIds = new Set(evaluations.map(e => e.employeeId));

        return ok({
            employees,
            departments: hodAssignments.map(a => a.department),
            quarterId: quarter.id,
            totalEvaluated: evaluatedIds.size,
            totalToEvaluate: employees.length
        });
    } catch (err) {
        console.error("[HOD-SHORTLIST] Error:", err.message);
        return serverError();
    }
});
