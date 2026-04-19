export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../lib/prisma";
import { withRole } from "../../../../lib/withRole";
import { ok, notFound, fail, serverError } from "../../../../lib/api-response";

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
 *   - BIG branches: BM evaluates only WHITE_COLLAR employees.
 *     BLUE_COLLAR is evaluated by HODs.
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

        const bmUser = await prisma.user.findUnique({
            where: { id: user.userId },
            select: {
                department: {
                    select: {
                        branchId: true,
                        branch: { select: { id: true, name: true, branchType: true } },
                    },
                },
            },
        });
        const branch = bmUser?.department?.branch;
        if (!branch) return fail("Branch not found for this Branch Manager");

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
                        department: { select: { id: true, name: true, collarType: true } },
                    },
                },
            },
        });

        const candidates = stage1.filter((s) => {
            if (branch.branchType === "BIG") {
                const collar = s.collarType || s.user.collarType || s.user.department?.collarType;
                return collar === "WHITE_COLLAR";
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
            const collar = s.collarType || s.user.collarType || s.user.department?.collarType || null;
            return {
                userId: s.userId,
                id: s.user.id,
                name: s.user.name,
                empCode: s.user.empCode,
                designation: s.user.designation || "",
                collarType: collar,
                department: s.user.department
                    ? { id: s.user.department.id, name: s.user.department.name, collarType: s.user.department.collarType }
                    : null,
                alreadyEvaluated: !!ev,
                isEvaluated: !!ev,
                mySubmittedScore: ev ? ev.bmNormalized : null,
                mySubmittedRawScore: ev ? ev.bmRawScore : null,
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
