export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../lib/prisma";
import { withRole } from "../../../../lib/withRole";
import { ok, fail, forbidden, serverError } from "../../../../lib/api-response";
import { resolveAllScopeBranches } from "../../../../lib/auth/resolveScopeBranch";
import { buildBranchWinners } from "../../../../lib/branchWinners";

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
        // Cache the resolved scope rows — they're reused below to build the
        // dashboard's branch dropdown, so we avoid resolving the same set twice.
        let scopeRows = null;
        if (user.role !== "ADMIN") {
            scopeRows = await resolveAllScopeBranches({ userId: user.userId, role: "COMMITTEE" });
            assignedBranchIds = scopeRows.map((r) => r.id);
            if (assignedBranchIds.length === 0) {
                return forbidden("You are not assigned to any branch. Please contact your administrator.");
            }
        }

        // Build the branch filter.
        let branchWhere = {};
        if (!isTotal) {
            // Non-admin: branch must be in the assignment set.
            if (user.role !== "ADMIN" && !assignedBranchIds.includes(requestedBranchId)) {
                return forbidden("You are not authorized for this branch.");
            }
            branchWhere = { branchId: requestedBranchId };
        } else if (user.role !== "ADMIN") {
            // Total mode for a committee member — scope to their assigned branches.
            branchWhere = { branchId: { in: assignedBranchIds } };
        }
        // ADMIN + Total: no branch filter, returns every branch with results.

        const { branches, results } = await buildBranchWinners({ quarter, branchWhere });

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
            const rows = scopeRows || await resolveAllScopeBranches({ userId: user.userId, role: "COMMITTEE" });
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
