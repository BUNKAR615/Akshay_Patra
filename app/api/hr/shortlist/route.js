export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../lib/prisma";
import { withRole } from "../../../../lib/withRole";
import { ok, fail, serverError } from "../../../../lib/api-response";

/**
 * GET /api/hr/shortlist
 * HR sees Stage 3 candidates for their branch to evaluate.
 */
export const GET = withRole(["HR", "ADMIN"], async (request, { user }) => {
    try {
        const quarter = await prisma.quarter.findFirst({ where: { status: "ACTIVE" } });
        if (!quarter) return fail("No active quarter");

        // Get branch from query or user
        const { searchParams } = new URL(request.url);
        let branchId = searchParams.get("branchId");

        if (!branchId) {
            const hrUser = await prisma.user.findUnique({
                where: { id: user.userId },
                select: { department: { select: { branchId: true } } }
            });
            branchId = hrUser?.department?.branchId;
        }
        if (!branchId) return fail("Could not determine branch");

        const branch = await prisma.branch.findUnique({
            where: { id: branchId },
            select: { id: true, name: true, branchType: true }
        });

        // Get Stage 3 shortlisted employees
        const shortlisted = await prisma.branchShortlistStage3.findMany({
            where: { branchId, quarterId: quarter.id },
            include: {
                user: {
                    select: {
                        id: true, name: true, empCode: true, designation: true, collarType: true,
                        department: { select: { name: true } }
                    }
                }
            },
            orderBy: [{ collarType: "asc" }, { rank: "asc" }]
        });

        // Check which employees HR has already evaluated
        const evaluations = await prisma.hrEvaluation.findMany({
            where: { hrUserId: user.userId, quarterId: quarter.id },
            select: { employeeId: true, attendancePct: true, workingHours: true, referenceSheetUrl: true, hrScore: true, notes: true }
        });
        const evalMap = new Map(evaluations.map(e => [e.employeeId, e]));

        const employees = shortlisted.map(s => {
            const ev = evalMap.get(s.user.id);
            return {
                ...s.user,
                collarType: s.collarType,
                selfScore: s.selfScore,
                evaluatorScore: s.evaluatorScore,
                cmScore: s.cmScore,
                combinedScore: s.combinedScore,
                rank: s.rank,
                hrEvaluated: !!ev,
                attendancePct: ev?.attendancePct ?? null,
                workingHours: ev?.workingHours ?? null,
                referenceSheetUrl: ev?.referenceSheetUrl ?? null,
                hrNotes: ev?.notes ?? null,
            };
        });

        return ok({
            employees,
            branch,
            quarterId: quarter.id,
            totalEvaluated: evaluations.length,
            totalToEvaluate: shortlisted.length
        });
    } catch (err) {
        console.error("[HR-SHORTLIST] Error:", err.message);
        return serverError();
    }
});
