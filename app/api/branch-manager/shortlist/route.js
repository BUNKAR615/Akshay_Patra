export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../lib/prisma";
import { withRole } from "../../../../lib/withRole";
import { ok, notFound, fail, serverError } from "../../../../lib/api-response";
import { buildBmQueue } from "../../../../lib/bmEvaluationQueue";

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

/**
 * GET /api/branch-manager/shortlist
 * Stage 2 evaluation queue for the Branch Manager — and for anyone holding a
 * department-level Branch Manager POA (EvaluatorDelegation).
 *
 * Rules (per Project_Documentation.md §7):
 *   - BIG branches: BM evaluates WHITE_COLLAR employees PLUS any BLUE_COLLAR
 *     employees who do not currently have an active EmployeeHodAssignment
 *     (orphaned BCs — e.g. after the BM removed their HOD). Per the HOD spec:
 *     "When an HOD is removed, all blue-collar employees under that HOD must
 *     automatically go back to the Branch Manager."
 *   - SMALL branches: BM evaluates every Stage 1 shortlisted employee
 *     regardless of collar type.
 *   - Department POA: a delegated department is evaluated by its delegate
 *     instead of the branch BM (the delegate's own record stays with the BM).
 *     See lib/bmEvaluationQueue.js.
 *
 * Returns the shuffled list for blind evaluation and flags which employees
 * have already been evaluated.
 */
export const GET = withRole(["BRANCH_MANAGER"], async (request, { user }) => {
    try {
        const activeQuarter = await prisma.quarter.findFirst({
            where: { status: "ACTIVE" },
            select: { id: true, name: true },
        });
        if (!activeQuarter) return notFound("No active quarter found");

        const { bmBranch, delegations, branches, rows } = await buildBmQueue(user.userId, activeQuarter.id);
        if (branches.length === 0) return fail("No branch is assigned to this Branch Manager. Please contact admin.");

        // "Done" means the employee already has a Stage 2 BM-type evaluation
        // this quarter (one evaluation per employee — see the evaluate route).
        const evaluated = rows.length
            ? await prisma.branchManagerEvaluation.findMany({
                where: { quarterId: activeQuarter.id, employeeId: { in: rows.map((c) => c.userId) } },
                select: { employeeId: true },
            })
            : [];
        const evaluatedIds = new Set(evaluated.map((e) => e.employeeId));
        const multiBranch = branches.length > 1;

        const employees = shuffleArray(rows.map((s) => {
            const done = evaluatedIds.has(s.userId);
            // Source-of-truth-first: live User.collarType (from the sheet) wins
            // over the Stage-1 snapshot so the BM page can never show a collar
            // that disagrees with the uploaded sheet.
            const collar = s.user.collarType || s.collarType || null;
            return {
                userId: s.userId,
                id: s.user.id,
                name: s.user.name,
                empCode: s.user.empCode,
                designation: s.user.designation || "",
                collarType: collar,
                department: s.user.department
                    ? {
                        id: s.user.department.id,
                        // Disambiguate same-named departments when the queue
                        // spans branches (e.g. a POA in another branch).
                        name: multiBranch ? `${s.user.department.name} · ${s.branch?.name || ""}` : s.user.department.name,
                    }
                    : null,
                branchId: s.branchId,
                branchName: s.branch?.name || "",
                // true → evaluated under a department POA, not as branch BM.
                delegated: !!s.viaDelegation,
                alreadyEvaluated: done,
                isEvaluated: done,
                // Scores are intentionally NOT returned — only the Committee
                // may see evaluation scores. The boolean flags above are
                // enough for the dashboard's "Done" state.
            };
        }));

        return ok({
            quarter: activeQuarter,
            branch: bmBranch || branches[0],
            // Pure delegate (no branch BM assignment): evaluation-only dashboard.
            delegateOnly: !bmBranch,
            delegations: delegations.map((d) => ({
                id: d.id,
                branchId: d.branchId,
                branchName: d.branch?.name || "",
                departmentId: d.departmentId,
                departmentName: d.department?.name || "",
            })),
            totalShortlisted: employees.length,
            evaluatedCount: employees.filter((e) => e.alreadyEvaluated).length,
            remainingCount: employees.filter((e) => !e.alreadyEvaluated).length,
            employees,
        });
    } catch (err) {
        console.error("BM shortlist error:", err);
        return serverError();
    }
});
