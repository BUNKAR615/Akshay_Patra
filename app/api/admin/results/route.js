export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../lib/prisma";
import { withRole } from "../../../../lib/withRole";
import { ok, notFound, fail, serverError } from "../../../../lib/api-response";

/**
 * GET /api/admin/results
 * Returns full score breakdowns for all evaluated employees
 * ONLY if the active/latest quarter is CLOSED.
 */
export const GET = withRole(["ADMIN"], async () => {
    try {
        // Find the most recent quarter
        let quarter = await prisma.quarter.findFirst({ orderBy: { createdAt: "desc" } });
        if (!quarter) return notFound("No quarters exist yet");

        if (quarter.status !== "CLOSED") {
            return fail("Results are only available after the quarter is closed.", 403);
        }

        const qId = quarter.id;

        // Fetch all necessary data
        const [
            departments,
            users,
            selfEvals,
            supEvals,
            bmEvals,
            cmEvals,
            bestEmployees
        ] = await Promise.all([
            prisma.department.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
            prisma.user.findMany({ where: { role: "EMPLOYEE" }, select: { id: true, name: true, departmentId: true } }),
            prisma.selfAssessment.findMany({ where: { quarterId: qId } }),
            prisma.supervisorEvaluation.findMany({ where: { quarterId: qId } }),
            prisma.branchManagerEvaluation.findMany({ where: { quarterId: qId } }),
            prisma.clusterManagerEvaluation.findMany({ where: { quarterId: qId } }),
            prisma.bestEmployee.findMany({ where: { quarterId: qId } })
        ]);

        // Build dictionaries
        const userMap = new Map(users.map(u => [u.id, u]));
        const selfMap = new Map(selfEvals.map(e => [e.userId, e]));
        const supMap = new Map(supEvals.map(e => [e.employeeId, e]));
        const bmMap = new Map(bmEvals.map(e => [e.employeeId, e]));
        const cmMap = new Map(cmEvals.map(e => [e.employeeId, e]));
        const bestEmpMap = new Map(bestEmployees.map(e => [e.departmentId, e]));

        // Group into departments
        const results = departments.map(dept => {
            const deptUsers = users.filter(u => u.departmentId === dept.id);
            const winner = bestEmpMap.get(dept.id);

            // Only include employees who have at least submitted a self-assessment
            const employees = deptUsers
                .filter(u => selfMap.has(u.id))
                .map(u => {
                    const self = selfMap.get(u.id);
                    const sup = supMap.get(u.id);
                    const bm = bmMap.get(u.id);
                    const cm = cmMap.get(u.id);

                    return {
                        id: u.id,
                        name: u.name,
                        self: self ? self.normalizedScore : null,
                        sup: sup ? sup.supervisorNormalized : null,
                        bm: bm ? bm.bmNormalized : null,
                        cm: cm ? cm.cmNormalized : null,
                        final: cm ? cm.finalScore : null
                    };
                })
                .sort((a, b) => {
                    // Sort by final score descending, falling back to earlier stage scores
                    if (b.final !== a.final) return (b.final || 0) - (a.final || 0);
                    if (b.cm !== a.cm) return (b.cm || 0) - (a.cm || 0);
                    if (b.bm !== a.bm) return (b.bm || 0) - (a.bm || 0);
                    if (b.sup !== a.sup) return (b.sup || 0) - (a.sup || 0);
                    return (b.self || 0) - (a.self || 0);
                });

            return {
                id: dept.id,
                name: dept.name,
                employees,
                winner: winner && userMap.has(winner.userId) ? {
                    id: winner.userId,
                    name: userMap.get(winner.userId).name,
                    finalScore: winner.finalScore
                } : null
            };
        });

        // Filter out departments with no evaluated employees
        const activeResults = results.filter(d => d.employees.length > 0);

        return ok({
            quarter: {
                id: quarter.id,
                name: quarter.name,
                status: quarter.status
            },
            departments: activeResults
        });

    } catch (err) {
        console.error("Admin results error:", err);
        return serverError();
    }
});
