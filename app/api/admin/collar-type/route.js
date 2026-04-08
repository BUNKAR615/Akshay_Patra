export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../lib/prisma";
import { withRole } from "../../../../lib/withRole";
import { ok, fail, serverError, validateBody } from "../../../../lib/api-response";
import { collarTypeSchema } from "../../../../lib/validators";
import { z } from "zod";

const bulkCollarSchema = z.object({
    assignments: z.array(collarTypeSchema).min(1, "At least one assignment required"),
});

/**
 * POST /api/admin/collar-type
 * Admin sets collar type for employees (bulk or single)
 */
export const POST = withRole(["ADMIN"], async (request, { user }) => {
    try {
        const body = await request.json();

        // Support single assignment or bulk
        const assignments = body.assignments || [body];
        const result = bulkCollarSchema.safeParse({ assignments });
        if (!result.success) {
            return fail(result.error.errors[0].message);
        }

        const updates = [];
        for (const item of result.data.assignments) {
            const updated = await prisma.user.update({
                where: { id: item.userId },
                data: { collarType: item.collarType },
                select: { id: true, name: true, empCode: true, collarType: true },
            });
            updates.push(updated);
        }

        await prisma.auditLog.create({
            data: {
                userId: user.userId,
                action: "COLLAR_TYPE_ASSIGNED",
                details: { count: updates.length, assignments: result.data.assignments },
            },
        }).catch(() => {});

        return ok({ updated: updates, count: updates.length });
    } catch (err) {
        console.error("[COLLAR-TYPE] Error:", err.message);
        return serverError();
    }
});
