export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../../lib/prisma";
import { withRole } from "../../../../../lib/withRole";
import { ok, notFound, fail, serverError } from "../../../../../lib/api-response";

/**
 * POST /api/admin/quarters/close
 */
export const POST = withRole(["ADMIN"], async (request, { user }) => {
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

        console.log("Saved to DB (Quarter Closed):", closed);

        await prisma.auditLog.create({
            data: { userId: user.userId, action: "QUARTER_CLOSED", details: { quarterId: closed.id, name: closed.name } },
        });

        return ok({ message: `Quarter "${closed.name}" closed successfully`, quarter: closed });
    } catch (err) {
        console.error("Close quarter error:", err);
        return serverError();
    }
});
