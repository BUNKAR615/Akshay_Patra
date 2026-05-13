export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../lib/prisma";
import { withRole } from "../../../../lib/withRole";
import { ok, fail, forbidden, serverError } from "../../../../lib/api-response";
import { resolveAllScopeBranches } from "../../../../lib/auth/resolveScopeBranch";

/**
 * GET /api/committee/results
 *
 * Branch-scope semantics:
 *   - ?branchId=<id>  → return winners for that specific branch (must be in
 *                       the committee member's CommitteeBranchAssignment;
 *                       ADMIN may target any branch).
 *   - omitted / empty / "ALL" → Total mode: every branch the user is
 *                       assigned to (ADMIN sees every branch with results).
 *
 * Source of truth for COMMITTEE branch scope is the
 * CommitteeBranchAssignment table — `user.department.branchId` is NOT
 * consulted (that was the multi-branch leak path).
 */
export const GET = withRole(["COMMITTEE", "ADMIN"], async (request, { user }) => {
    try {
        const { searchParams } = new URL(request.url);
        const quarterId = searchParams.get("quarterId");
        const requestedBranchId = (searchParams.get("branchId") || "").trim();
        const isTotal = !requestedBranchId || requestedBranchId.toUpperCase() === "ALL";

        // Get quarter (active or specific)
        let quarter;
        if (quarterId) {
            quarter = await prisma.quarter.findUnique({ where: { id: quarterId } });
        } else {
            quarter = await prisma.quarter.findFirst({ where: { status: "ACTIVE" } });
            if (!quarter) quarter = await prisma.quarter.findFirst({ orderBy: { createdAt: "desc" } });
        }
        if (!quarter) return fail("No quarter found");

        // Resolve the committee member's assigned branches (drives Total
        // mode and validates a specific-branch focus).
        let assignedBranchIds = [];
        if (user.role !== "ADMIN") {
            const rows = await resolveAllScopeBranches({ userId: user.userId, role: "COMMITTEE" });
            assignedBranchIds = rows.map((r) => r.id);
            if (assignedBranchIds.length === 0) {
                return forbidden("You are not assigned to any branch. Please contact your administrator.");
            }
        }

        // Build the `where.branchId` filter.
        const where = { quarterId: quarter.id };
        if (!isTotal) {
            // Non-admin: branch must be in the assignment set.
            if (user.role !== "ADMIN" && !assignedBranchIds.includes(requestedBranchId)) {
                return forbidden("You are not authorized for this branch.");
            }
            where.branchId = requestedBranchId;
        } else if (user.role !== "ADMIN") {
            // Total mode for a committee member — scope to their assigned branches.
            where.branchId = { in: assignedBranchIds };
        }
        // ADMIN + Total: no branch filter, returns every branch with results.

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

        // `assignedBranches` drives the dashboard's Total + per-branch
        // dropdown so it stays stable even for branches that don't yet have
        // results in this quarter. For ADMIN we fall back to the set of
        // branches that DO have results (no global "every-branch" listing
        // here — that would balloon the response).
        let assignedBranches;
        if (user.role === "ADMIN") {
            assignedBranches = branches.map((b) => ({
                id: b.branchId,
                name: b.branchName,
                branchType: b.branchType,
            }));
        } else {
            const rows = await resolveAllScopeBranches({ userId: user.userId, role: "COMMITTEE" });
            assignedBranches = rows.map((b) => ({ id: b.id, name: b.name, branchType: b.branchType }));
        }

        return ok({
            quarter: { id: quarter.id, name: quarter.name, status: quarter.status },
            branches,
            results,
            assignedBranches,
            mode: isTotal ? "TOTAL" : "BRANCH",
            total: results.length,
        });
    } catch (err) {
        console.error("[COMMITTEE-RESULTS] Error:", err.message);
        return serverError();
    }
});
