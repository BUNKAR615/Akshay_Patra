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
            bestEmployeeDocs
        ] = await Promise.all([
            prisma.department.findMany({ select: { id: true, name: true } }),
            prisma.user.findMany({ where: { role: "EMPLOYEE" }, select: { id: true, name: true, departmentId: true } }),
            prisma.bestEmployee.findMany({
                where: { quarterId: qId },
                include: { user: { select: { id: true, name: true } } }
            })
        ]);

        // Build a map of departmentId -> bestEmployee for quick lookup
        const bestEmployeeByDept = {};
        for (const be of bestEmployeeDocs) {
            bestEmployeeByDept[be.departmentId] = be;
        }

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
            const bestEmpForDept = bestEmployeeByDept[did];
            const deptWinner = bestEmpForDept ? { id: bestEmpForDept.user.id, name: bestEmpForDept.user.name } : null;

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

        // 5b. Branch-level stage counts using new BranchShortlist* models
        const [
            branches,
            bStage1,
            bStage2,
            bStage3,
            bStage4,
            hodEvals,
            bmEvalsAll,
            cmEvalsAll,
            hrEvalsAll,
            branchBest,
        ] = await Promise.all([
            prisma.branch.findMany({ select: { id: true, name: true, branchType: true } }),
            prisma.branchShortlistStage1.findMany({ where: { quarterId: qId }, select: { branchId: true, collarType: true } }),
            prisma.branchShortlistStage2.findMany({ where: { quarterId: qId }, select: { branchId: true, collarType: true } }),
            prisma.branchShortlistStage3.findMany({ where: { quarterId: qId }, select: { branchId: true, collarType: true } }),
            prisma.branchShortlistStage4.findMany({ where: { quarterId: qId }, select: { branchId: true, collarType: true } }),
            prisma.hodEvaluation.findMany({ where: { quarterId: qId }, select: { employee: { select: { department: { select: { branchId: true } } } } } }),
            prisma.branchManagerEvaluation.findMany({ where: { quarterId: qId }, select: { employee: { select: { department: { select: { branchId: true } } } } } }),
            prisma.clusterManagerEvaluation.findMany({ where: { quarterId: qId }, select: { employee: { select: { department: { select: { branchId: true } } } } } }),
            prisma.hrEvaluation.findMany({ where: { quarterId: qId }, select: { employee: { select: { department: { select: { branchId: true } } } } } }).catch(() => []),
            prisma.branchBestEmployee.findMany({ where: { quarterId: qId }, select: { branchId: true, collarType: true, user: { select: { id: true, name: true } } } }).catch(() => []),
        ]);

        const countBy = (arr, key) => {
            const m = new Map();
            for (const r of arr) {
                const k = r[key] || r?.employee?.department?.branchId;
                if (!k) continue;
                m.set(k, (m.get(k) || 0) + 1);
            }
            return m;
        };
        const s1Map = countBy(bStage1, "branchId");
        const s1Wc = countBy(bStage1.filter(r => r.collarType === "WHITE_COLLAR"), "branchId");
        const s1Bc = countBy(bStage1.filter(r => r.collarType === "BLUE_COLLAR"), "branchId");
        const s2Map = countBy(bStage2, "branchId");
        const s3Map = countBy(bStage3, "branchId");
        const s4Map = countBy(bStage4, "branchId");
        const hodMap = countBy(hodEvals, "branchId");
        const bmMap = countBy(bmEvalsAll, "branchId");
        const cmMap = countBy(cmEvalsAll, "branchId");
        const hrMap = countBy(hrEvalsAll, "branchId");

        // Total employees per branch
        const usersByBranch = await prisma.user.groupBy({
            by: ["departmentId"],
            where: { role: "EMPLOYEE", departmentRoles: { none: {} } },
            _count: { id: true },
        });
        const deptToBranch = new Map();
        const allDepts = await prisma.department.findMany({ select: { id: true, branchId: true } });
        for (const d of allDepts) deptToBranch.set(d.id, d.branchId);
        const branchEmpCount = new Map();
        for (const u of usersByBranch) {
            const bId = deptToBranch.get(u.departmentId);
            if (!bId) continue;
            branchEmpCount.set(bId, (branchEmpCount.get(bId) || 0) + u._count.id);
        }
        // Self-assessments per branch
        const selfByBranch = new Map();
        for (const sa of selfAssessments) {
            const u = allUsers.find(x => x.id === sa.userId);
            if (!u) continue;
            const bId = deptToBranch.get(u.departmentId);
            if (!bId) continue;
            selfByBranch.set(bId, (selfByBranch.get(bId) || 0) + 1);
        }

        const branchesPayload = branches.map(b => ({
            branchId: b.id,
            branchName: b.name,
            branchType: b.branchType,
            totalEmployees: branchEmpCount.get(b.id) || 0,
            stage1: {
                submitted: selfByBranch.get(b.id) || 0,
                shortlisted: s1Map.get(b.id) || 0,
                shortlistedWhite: s1Wc.get(b.id) || 0,
                shortlistedBlue: s1Bc.get(b.id) || 0,
            },
            stage2: {
                shortlisted: s2Map.get(b.id) || 0,
                evaluatedByBm: bmMap.get(b.id) || 0,
                evaluatedByHod: hodMap.get(b.id) || 0,
            },
            stage3: {
                shortlisted: s3Map.get(b.id) || 0,
                evaluatedByCm: cmMap.get(b.id) || 0,
            },
            stage4: {
                shortlisted: s4Map.get(b.id) || 0,
                evaluatedByHr: hrMap.get(b.id) || 0,
            },
            winners: branchBest
                .filter(w => w.branchId === b.id)
                .map(w => ({ id: w.user.id, name: w.user.name, collarType: w.collarType })),
        })).sort((a, b) => a.branchName.localeCompare(b.branchName));

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
            branches: branchesPayload,
            overallStats: {
                totalEmployees: overallTotalEmployees,
                totalSubmitted: overallSubmitted,
                overallPercentage,
                quarterWinners: bestEmployeeDocs.length > 0
                    ? bestEmployeeDocs.map(be => ({
                        id: be.user.id,
                        name: be.user.name,
                        department: departments.find(d => d.id === be.departmentId)?.name || ""
                    }))
                    : [],
                // Backward compat: first winner
                quarterWinner: bestEmployeeDocs.length > 0 ? {
                    id: bestEmployeeDocs[0].user.id,
                    name: bestEmployeeDocs[0].user.name,
                    department: departments.find(d => d.id === bestEmployeeDocs[0].departmentId)?.name || ""
                } : null
            }
        });

    } catch (err) {
        console.error("Quarter progress API error:", err);
        return serverError("Failed to build quarter progress report");
    }
});
