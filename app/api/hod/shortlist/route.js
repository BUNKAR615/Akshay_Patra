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

        // Prefer per-employee HOD assignments (new flow). Fall back to department-level.
        const empAssignments = await prisma.employeeHodAssignment.findMany({
            where: { hodUserId: user.userId, quarterId: quarter.id },
            select: { employeeId: true },
        });
        const assignedEmployeeIds = empAssignments.map(a => a.employeeId);

        // Department-level assignments (legacy / fallback)
        const hodAssignments = await prisma.hodAssignment.findMany({
            where: { hodUserId: user.userId, quarterId: quarter.id },
            include: { department: { select: { id: true, name: true, branchId: true } } }
        });

        if (assignedEmployeeIds.length === 0 && hodAssignments.length === 0) {
            return ok({ employees: [], message: "No employees assigned to you for this quarter" });
        }

        // Build the shortlist query. If per-employee assignments exist, use those only.
        const whereClause = {
            quarterId: quarter.id,
            collarType: "BLUE_COLLAR",
        };
        if (assignedEmployeeIds.length > 0) {
            whereClause.userId = { in: assignedEmployeeIds };
        } else {
            const deptIds = hodAssignments.map(a => a.departmentId);
            const branchId = hodAssignments[0].department.branchId;
            whereClause.branchId = branchId;
            whereClause.user = { departmentId: { in: deptIds } };
        }

        const shortlisted = await prisma.branchShortlistStage1.findMany({
            where: whereClause,
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
                mySubmittedScore: ev ? ev.hodNormalized : null,
                mySubmittedRawScore: ev ? ev.hodRawScore : null,
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
