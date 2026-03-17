import prisma from "../../../../lib/prisma";
import { withRole } from "../../../../lib/withRole";
import { ok, notFound, serverError } from "../../../../lib/api-response";

/**
 * GET /api/admin/quarter-progress
 * Returns a strict, comprehensive JSON payload describing real-time
 * progress of an active or recent quarter by department.
 */
export const GET = withRole(["ADMIN"], async () => {
    try {
        // 1. Find Current/Latest Quarter
        let quarter = await prisma.quarter.findFirst({ where: { status: "ACTIVE" } });
        if (!quarter) {
            quarter = await prisma.quarter.findFirst({ orderBy: { createdAt: "desc" } });
        }
        if (!quarter) return notFound("No quarters exist yet");

        const qId = quarter.id;

        // 2. Fetch Base Structural Data (Parallel)
        const [
            departments,
            allUsers,
            bestEmployeeDoc
        ] = await Promise.all([
            prisma.department.findMany({ select: { id: true, name: true } }),
            prisma.user.findMany({ where: { role: "EMPLOYEE" }, select: { id: true, name: true, departmentId: true } }),
            prisma.bestEmployee.findUnique({
                where: { quarterId: qId },
                include: { user: { select: { id: true, name: true } } }
            })
        ]);

        // 3. Department to Employee mapping
        const deptEmployees = {};
        for (const u of allUsers) {
            if (!deptEmployees[u.departmentId]) deptEmployees[u.departmentId] = [];
            deptEmployees[u.departmentId].push(u);
        }

        // 4. Fetch Progress Metrics for Quarter (Parallel Batch)
        const [
            selfAssessments,
            stage1Shortlists,
            supervisorEvals,
            stage2Shortlists,
            bmEvals,
            stage3Shortlists,
            cmEvals
        ] = await Promise.all([
            // S1 submissions
            prisma.selfAssessment.findMany({
                where: { quarterId: qId },
                select: { userId: true, user: { select: { name: true } } }
            }),
            // S1 passes (Top 10)
            prisma.shortlistStage1.findMany({
                where: { quarterId: qId },
                select: { departmentId: true, user: { select: { name: true } } }
            }),
            // S2 evals (Supervisor)
            prisma.supervisorEvaluation.findMany({
                where: { quarterId: qId },
                select: { employeeId: true }
            }),
            // S2 passes (Top 5)
            prisma.shortlistStage2.findMany({
                where: { quarterId: qId },
                select: { departmentId: true, user: { select: { name: true } } }
            }),
            // S3 evals (BM)
            prisma.branchManagerEvaluation.findMany({
                where: { quarterId: qId },
                select: { employeeId: true }
            }),
            // S3 passes (Top 3)
            prisma.shortlistStage3.findMany({
                where: { quarterId: qId },
                select: { departmentId: true, user: { select: { name: true } } }
            }),
            // S4 evals (CM)
            prisma.clusterManagerEvaluation.findMany({
                where: { quarterId: qId },
                select: { employeeId: true }
            })
        ]);

        // Helper: Convert array of relations to quick Set dictionaries for O(1) matching
        const saSet = new Set(selfAssessments.map(s => s.userId));
        const supSet = new Set(supervisorEvals.map(s => s.employeeId));
        const bmSet = new Set(bmEvals.map(s => s.employeeId));
        const cmSet = new Set(cmEvals.map(s => s.employeeId));

        let overallTotalEmployees = 0;
        let overallSubmitted = 0;
        const resultDepartments = [];

        // 5. Construct Per-Department Breakdown via looping
        for (const dept of departments) {
            const did = dept.id;
            const emps = deptEmployees[did] || [];
            const totalEmps = emps.length;

            overallTotalEmployees += totalEmps;

            // Basic Stage 1 Calculation
            const submittedEmps = emps.filter(e => saSet.has(e.id));
            const saCount = submittedEmps.length;
            overallSubmitted += saCount;

            const s1List = stage1Shortlists.filter(s => s.departmentId === did);
            const s2List = stage2Shortlists.filter(s => s.departmentId === did);
            const s3List = stage3Shortlists.filter(s => s.departmentId === did);

            // Compute Stage Metrics
            const s1Total = s1List.length > 0 ? s1List.length : (saCount > 0 ? Math.min(saCount, 10) : 0);

            // Evaluated logic relies on knowing who made it to the shortlist
            const s2EvalsDone = emps.filter(e => supSet.has(e.id)).length;
            const s2Total = s2List.length > 0 ? s2List.length : (s2EvalsDone > 0 ? Math.min(s2EvalsDone, 5) : 0);

            const s3EvalsDone = emps.filter(e => bmSet.has(e.id)).length;
            const s3Total = s3List.length > 0 ? s3List.length : (s3EvalsDone > 0 ? Math.min(s3EvalsDone, 3) : 0);

            const s4EvalsDone = emps.filter(e => cmSet.has(e.id)).length;

            // Small Dept Rule mapping
            let smallDeptRule = null;
            if (totalEmps > 0) {
                if (totalEmps <= 3) smallDeptRule = "CASE1";
                else if (totalEmps <= 6) smallDeptRule = "CASE2";
                else if (totalEmps <= 10) smallDeptRule = "CASE3";
                else smallDeptRule = "CASE4";
            }

            // Did someone from this department win?
            const deptWinner = bestEmployeeDoc?.departmentId === did ? { id: bestEmployeeDoc.user.id, name: bestEmployeeDoc.user.name } : null;

            resultDepartments.push({
                departmentId: did,
                departmentName: dept.name,
                totalEmployees: totalEmps,
                stage1: {
                    submitted: saCount,
                    total: totalEmps,
                    percentage: totalEmps > 0 ? Math.round((saCount / totalEmps) * 100) : 0,
                    shortlisted: s1Total,
                    submittedNames: submittedEmps.map(e => e.name) // Extended payload for accordion
                },
                stage2: {
                    evaluated: s2EvalsDone,
                    total: s1Total, // Total expecting evaluations is the S1 shortlist size
                    shortlisted: s2Total,
                    shortlistNames: s1List.map(s => s.user.name) // S1 passed
                },
                stage3: {
                    evaluated: s3EvalsDone,
                    total: s2Total,
                    shortlisted: s3Total,
                    shortlistNames: s2List.map(s => s.user.name) // S2 passed
                },
                stage4: {
                    evaluated: s4EvalsDone,
                    total: s3Total,
                    shortlistNames: s3List.map(s => s.user.name) // S3 passed
                },
                winner: deptWinner,
                smallDeptRule
            });
        }

        const overallPercentage = overallTotalEmployees > 0
            ? Math.round((overallSubmitted / overallTotalEmployees) * 100)
            : 0;

        // 6. Return Payload Matching Client Expectation
        return ok({
            quarter: {
                id: quarter.id,
                name: quarter.name,
                status: quarter.status,
                startDate: quarter.startDate,
                endDate: quarter.endDate,
                questionCount: quarter.questionCount
            },
            departments: resultDepartments.sort((a, b) => a.departmentName.localeCompare(b.departmentName)),
            overallStats: {
                totalEmployees: overallTotalEmployees,
                totalSubmitted: overallSubmitted,
                overallPercentage,
                quarterWinner: bestEmployeeDoc ? {
                    id: bestEmployeeDoc.user.id,
                    name: bestEmployeeDoc.user.name,
                    department: departments.find(d => d.id === bestEmployeeDoc.departmentId)?.name || ""
                } : null
            }
        });

    } catch (err) {
        console.error("Quarter progress API error:", err);
        return serverError("Failed to build quarter progress report");
    }
});
