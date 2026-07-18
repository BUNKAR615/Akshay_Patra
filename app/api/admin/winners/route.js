export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { withPermission } from "../../../../lib/withPermission";
import { ok, fail, notFound, serverError } from "../../../../lib/api-response";
import { resolveWinnersQuarter, buildBranchWinners } from "../../../../lib/branchWinners";

/**
 * GET /api/admin/winners
 *
 * ADMIN-AREA branch winners — the full, cross-branch winner set for the
 * Pipeline tab's "Branch Winners" panel and the per-branch winners drill-down.
 *
 * Guard: `pipeline.winners` (ADMIN role bypasses, as everywhere). This exists
 * because the admin Pipeline view previously reused /api/committee/results,
 * which (correctly, for the committee dashboard) scopes a COMMITTEE caller to
 * their CommitteeBranchAssignment rows and rejects every other non-admin role.
 * An operator (e.g. "HR Admin") holding `pipeline.winners` must always see
 * every branch's winners regardless of their base role or committee
 * assignments — so the admin area now has its own permission-gated route.
 *
 * Query params:
 *   ?quarterId= → that quarter (archive view); default ACTIVE, else latest.
 *   ?branchId=  → only that branch (used by the stage-detail modal).
 *
 * Payload shape matches /api/committee/results (quarter, branches, results,
 * total) so the consuming components work with either source.
 */
export const GET = withPermission("pipeline.winners", async (request) => {
    try {
        const { searchParams } = new URL(request.url);
        const quarterId = searchParams.get("quarterId");
        const branchId = (searchParams.get("branchId") || "").trim();

        const quarter = await resolveWinnersQuarter(quarterId);
        if (!quarter) return quarterId ? notFound("Quarter not found") : fail("No quarter found");

        const branchWhere = branchId ? { branchId } : {};
        const { branches, results } = await buildBranchWinners({ quarter, branchWhere });

        return ok({
            quarter: { id: quarter.id, name: quarter.name, status: quarter.status },
            branches,
            results,
            total: results.length,
        });
    } catch (err) {
        console.error("[ADMIN-WINNERS] Error:", err.message);
        return serverError();
    }
});
