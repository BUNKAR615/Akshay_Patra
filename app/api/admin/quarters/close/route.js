export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../../lib/prisma";
import { withPermission } from "../../../../../lib/withPermission";
import { ok, notFound, fail, handleApiError } from "../../../../../lib/api-response";
import { resetHodStateForQuarters } from "../../../../../lib/auth/quarterReset";

/**
 * POST /api/admin/quarters/close
 *
 * On close we ALSO wipe HOD state for the quarter being closed:
 *   - HodAssignment rows for this quarter,
 *   - EmployeeHodAssignment rows for this quarter (BC employees return to BM),
 *   - DepartmentRoleMapping HOD rows for users who no longer have any HOD
 *     assignment, plus their passwordHod and (if role==HOD) their role.
 *
 * Spec: "Old-quarter HOD access must stop immediately when the new quarter
 * starts." We do it at CLOSE — even before the next quarter starts — so
 * secondary HOD login is denied the moment the quarter closes. See
 * lib/auth/quarterReset.js for the full contract.
 */
export const POST = withPermission("quarter.edit", async (request, { user }) => {
    try {
        let body = {};
        try { body = await request.json(); } catch { }

        let quarter;
        if (body.quarterId) {
            quarter = await prisma.quarter.findUnique({ where: { id: body.quarterId } });
            if (!quarter) return notFound("Quarter not found");
            if (quarter.status === "CLOSED") return fail("This quarter is already closed");
        } else {
            quarter = await prisma.quarter.findFirst({ where: { status: "ACTIVE" } });
            if (!quarter) return notFound("No active quarter found to close");
        }

        const closed = await prisma.quarter.update({ where: { id: quarter.id }, data: { status: "CLOSED" } });

        // ── Quarterly reset: wipe HOD state for the quarter we just closed.
        //    Failures here are NOT fatal to the close action itself, but we
        //    log them so an admin can re-run the cleanup if needed.
        let hodResetStats = null;
        try {
            hodResetStats = await resetHodStateForQuarters(closed.id);
        } catch (resetErr) {
            console.error("[QUARTER-CLOSE] HOD reset failed (quarter still marked CLOSED):", resetErr);
        }

        // Audit is best-effort: the quarter is already CLOSED, so an audit
        // failure must not turn a successful close into a 500.
        await prisma.auditLog.create({
            data: {
                userId: user.userId,
                action: "QUARTER_CLOSED",
                details: { quarterId: closed.id, name: closed.name, hodReset: hodResetStats },
            },
        }).catch((e) => { console.error("[QUARTER-CLOSE] Audit log failed:", e); });

        return ok({
            message: `Quarter "${closed.name}" closed successfully`,
            quarter: closed,
            hodReset: hodResetStats,
        });
    } catch (err) {
        return handleApiError(err, "QUARTER-CLOSE");
    }
});
