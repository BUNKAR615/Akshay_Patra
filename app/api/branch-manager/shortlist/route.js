export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../lib/prisma";
import { withRole } from "../../../../lib/withRole";
import { ok, notFound, fail, serverError } from "../../../../lib/api-response";
import { resolveScopeBranch } from "../../../../lib/auth/resolveScopeBranch";

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

/**
 * GET /api/branch-manager/shortlist
 * Branch-wide Stage 2 evaluation queue for the Branch Manager.
 *
 * Rules (per Project_Documentation.md §7):
 *   - BIG branches: BM evaluates WHITE_COLLAR employees PLUS any BLUE_COLLAR
 *     employees who do not currently have an active EmployeeHodAssignment
 *     (orphaned BCs — e.g. after the BM removed their HOD). Per the HOD spec:
 *     "When an HOD is removed, all blue-collar employees under that HOD must
 *     automatically go back to the Branch Manager."
 *   - SMALL branches: BM evaluates every Stage 1 shortlisted employee
 *     regardless of collar type.
 *
 * Returns the shuffled list for blind evaluation and flags which employees
 * the current BM has already evaluated.
 */
export const GET = withRole(["BRANCH_MANAGER"], async (request, { user }) => {
    try {
        const activeQuarter = await prisma.quarter.findFirst({
            where: { status: "ACTIVE" },
            select: { id: true, name: true },
        });
        if (!activeQuarter) return notFound("No active quarter found");

        const { branch } = await resolveScopeBranch(user);
        if (!branch) return fail("No branch is assigned to this Branch Manager. Please contact admin.");

        const stage1 = await prisma.branchShortlistStage1.findMany({
            where: { branchId: branch.id, quarterId: activeQuarter.id },
            select: {
                userId: true,
                collarType: true,
                user: {
                    select: {
                        id: true,
                        name: true,
                        empCode: true,
                        designation: true,
                        collarType: true,
                        department: { select: { id: true, name: true } },
                    },
                },
            },
        });

        // BIG branches: BC employees only count as the BM's responsibility when
        // they're orphaned (no active EmployeeHodAssignment). HOD-covered BCs
        // are filtered out so the BM doesn't double-evaluate them.
        let assignedBcIds = new Set();
        if (branch.branchType === "BIG") {
            const empHodRows = await prisma.employeeHodAssignment.findMany({
                where: {
                    quarterId: activeQuarter.id,
                    employee: { department: { branchId: branch.id } },
                },
                select: { employeeId: true },
            });
            assignedBcIds = new Set(empHodRows.map((r) => r.employeeId));
        }

        const candidates = stage1.filter((s) => {
            if (branch.branchType === "BIG") {
                // Collar from the employee's stored category. The live
                // User.collarType (sourced from the uploaded sheet) is the
                // source of truth and ALWAYS wins; the Stage-1 snapshot is only
                // a fallback for the rare case where User.collarType is null.
                // Stage logic must never override the sheet — never the dept.
                const collar = s.user.collarType || s.collarType;
                if (collar === "WHITE_COLLAR") return true;
                // Blue-collar (or unknown) — only include orphaned ones (no active HOD).
                return !assignedBcIds.has(s.userId);
            }
            return true;
        });

        const evaluated = await prisma.branchManagerEvaluation.findMany({
            where: {
                managerId: user.userId,
                quarterId: activeQuarter.id,
                employeeId: { in: candidates.map((c) => c.userId) },
            },
            select: { employeeId: true, bmNormalized: true, bmRawScore: true, submittedAt: true },
        });
        const evalMap = new Map(evaluated.map((e) => [e.employeeId, e]));

        const employees = shuffleArray(candidates.map((s) => {
            const ev = evalMap.get(s.userId);
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
                    ? { id: s.user.department.id, name: s.user.department.name }
                    : null,
                alreadyEvaluated: !!ev,
                isEvaluated: !!ev,
                // Scores are intentionally NOT returned — only the Committee
                // may see evaluation scores. The boolean flags above are
                // enough for the dashboard's "Done" state.
            };
        }));

        return ok({
            quarter: activeQuarter,
            branch,
            totalShortlisted: candidates.length,
            evaluatedCount: evaluated.length,
            remainingCount: candidates.length - evaluated.length,
            employees,
        });
    } catch (err) {
        console.error("BM shortlist error:", err);
        return serverError();
    }
});
