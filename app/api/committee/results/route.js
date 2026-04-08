export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../lib/prisma";
import { withRole } from "../../../../lib/withRole";
import { ok, fail, serverError } from "../../../../lib/api-response";

/**
 * GET /api/committee/results
 * Committee sees final best employees with PDF links.
 * Small branch: name, empCode, self score, BM score, CM score, attendance PDF, punctuality PDF
 * Big branch: name, empCode, PDFs only (no scoring breakdown)
 */
export const GET = withRole(["COMMITTEE", "ADMIN"], async (request, { user }) => {
    try {
        const { searchParams } = new URL(request.url);
        const quarterId = searchParams.get("quarterId");
        const branchId = searchParams.get("branchId");

        // Get quarter (active or specific)
        let quarter;
        if (quarterId) {
            quarter = await prisma.quarter.findUnique({ where: { id: quarterId } });
        } else {
            quarter = await prisma.quarter.findFirst({ where: { status: "ACTIVE" } });
            if (!quarter) quarter = await prisma.quarter.findFirst({ orderBy: { createdAt: "desc" } });
        }
        if (!quarter) return fail("No quarter found");

        // Get committee member's branch if not provided
        let targetBranchId = branchId;
        if (!targetBranchId && user.role !== "ADMIN") {
            const committeUser = await prisma.user.findUnique({
                where: { id: user.userId },
                select: { department: { select: { branchId: true } } }
            });
            targetBranchId = committeUser?.department?.branchId;
        }

        // Build where clause
        const where = { quarterId: quarter.id };
        if (targetBranchId) where.branchId = targetBranchId;

        const bestEmployees = await prisma.branchBestEmployee.findMany({
            where,
            include: {
                user: {
                    select: {
                        id: true, name: true, empCode: true, designation: true,
                        collarType: true,
                        department: { select: { name: true } }
                    }
                },
                branch: { select: { id: true, name: true, branchType: true } }
            },
            orderBy: [{ branch: { name: "asc" } }, { collarType: "asc" }, { finalScore: "desc" }]
        });

        // Format results based on branch type
        const results = bestEmployees.map(be => {
            const base = {
                name: be.user.name,
                empCode: be.user.empCode,
                designation: be.user.designation,
                department: be.user.department?.name,
                collarType: be.collarType,
                branch: be.branch.name,
                branchType: be.branch.branchType,
                attendancePdfUrl: be.attendancePdfUrl,
                punctualityPdfUrl: be.punctualityPdfUrl,
            };

            if (be.branch.branchType === "SMALL") {
                // Small branch: committee sees scores + PDFs
                return {
                    ...base,
                    selfAssessmentScore: be.selfScore,
                    branchManagerScore: be.evaluatorScore,
                    clusterManagerScore: be.cmScore,
                    finalScore: be.finalScore,
                };
            } else {
                // Big branch: committee sees only PDFs, not scores
                return base;
            }
        });

        // Group by branch
        const byBranch = {};
        for (const r of results) {
            if (!byBranch[r.branch]) byBranch[r.branch] = [];
            byBranch[r.branch].push(r);
        }

        return ok({
            quarter: { id: quarter.id, name: quarter.name, status: quarter.status },
            results,
            byBranch,
            total: results.length
        });
    } catch (err) {
        console.error("[COMMITTEE-RESULTS] Error:", err.message);
        return serverError();
    }
});
