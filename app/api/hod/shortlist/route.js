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

        // Get HOD's department assignments
        const hodAssignments = await prisma.hodAssignment.findMany({
            where: { hodUserId: user.userId, quarterId: quarter.id },
            include: { department: { select: { id: true, name: true, branchId: true } } }
        });

        if (hodAssignments.length === 0) {
            return ok({ employees: [], message: "No departments assigned to you for this quarter" });
        }

        const deptIds = hodAssignments.map(a => a.departmentId);
        const branchId = hodAssignments[0].department.branchId;

        // Get BC Stage 1 shortlisted employees in HOD's departments
        const shortlisted = await prisma.branchShortlistStage1.findMany({
            where: {
                branchId,
                quarterId: quarter.id,
                collarType: "BLUE_COLLAR",
                user: { departmentId: { in: deptIds } }
            },
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
            select: { employeeId: true }
        });
        const evaluatedIds = new Set(evaluations.map(e => e.employeeId));

        const employees = shortlisted.map(s => ({
            ...s.user,
            selfScore: s.selfScore,
            rank: s.rank,
            evaluated: evaluatedIds.has(s.user.id)
        }));

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
