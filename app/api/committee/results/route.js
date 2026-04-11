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

        // Fetch all branch best employees for target branches
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

        // Group by branch and pick winners per branch type:
        //   BIG   => 1 WC winner + 3 BC winners  (total 4)
        //   SMALL => 3 overall winners (top finalScore)
        const byBranch = new Map();
        for (const be of bestEmployees) {
            if (!byBranch.has(be.branchId)) {
                byBranch.set(be.branchId, {
                    branch: be.branch,
                    wc: [],
                    bc: [],
                    all: [],
                });
            }
            const g = byBranch.get(be.branchId);
            g.all.push(be);
            if (be.collarType === "WHITE_COLLAR") g.wc.push(be);
            else g.bc.push(be);
        }

        const mapEntry = (be) => ({
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
            rank: 0,
        });

        const branches = [];
        for (const g of byBranch.values()) {
            let winners = [];
            if (g.branch.branchType === "BIG") {
                const wc = g.wc.slice(0, 1);
                const bc = g.bc.slice(0, 3);
                winners = [...wc, ...bc].map(mapEntry);
            } else {
                winners = g.all.slice(0, 3).map(mapEntry);
            }
            winners.forEach((w, i) => { w.rank = i + 1; });
            branches.push({
                branchId: g.branch.id,
                branchName: g.branch.name,
                branchType: g.branch.branchType,
                expectedCount: g.branch.branchType === "BIG" ? 4 : 3,
                winners,
            });
        }

        // Flat list (backward compat with existing page)
        const results = branches.flatMap((b) => b.winners);

        return ok({
            quarter: { id: quarter.id, name: quarter.name, status: quarter.status },
            branches,
            results,
            total: results.length
        });
    } catch (err) {
        console.error("[COMMITTEE-RESULTS] Error:", err.message);
        return serverError();
    }
});
