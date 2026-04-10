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

        // Only the top winner per branch (highest finalScore)
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
            orderBy: [{ branch: { name: "asc" } }, { finalScore: "desc" }]
        });

        // Keep only the top winner per branch
        const topPerBranch = new Map();
        for (const be of bestEmployees) {
            if (!topPerBranch.has(be.branchId)) topPerBranch.set(be.branchId, be);
        }

        // Build per-stage breakdown for each top winner
        const results = [];
        for (const be of topPerBranch.values()) {
            results.push({
                name: be.user.name,
                empCode: be.user.empCode,
                designation: be.user.designation,
                department: be.user.department?.name,
                collarType: be.collarType,
                branch: be.branch.name,
                branchType: be.branch.branchType,
                stages: [
                    { stage: 1, name: "Self Assessment", score: be.selfScore, weightPct: 30 },
                    { stage: 2, name: "BM / HOD Evaluation", score: be.evaluatorScore, weightPct: 25 },
                    { stage: 3, name: "Cluster Manager", score: be.cmScore, weightPct: 25 },
                    { stage: 4, name: "HR Evaluation", score: be.hrScore, weightPct: 20 },
                ],
                attendancePct: be.attendancePct,
                workingHours: be.workingHours,
                referenceSheetUrl: be.referenceSheetUrl,
                finalScore: be.finalScore,
            });
        }

        return ok({
            quarter: { id: quarter.id, name: quarter.name, status: quarter.status },
            results,
            total: results.length
        });
    } catch (err) {
        console.error("[COMMITTEE-RESULTS] Error:", err.message);
        return serverError();
    }
});
