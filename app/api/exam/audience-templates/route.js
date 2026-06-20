export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import prisma from "../../../../lib/prisma";
import { withRole } from "../../../../lib/withRole";
import { ok, created, serverError, validateBody } from "../../../../lib/api-response";
import { audienceTemplateSchema } from "../../../../lib/examValidators";

/**
 * GET /api/exam/audience-templates — reusable saved audiences (shared across
 * admins), most-recently-updated first.
 */
export const GET = withRole(["ADMIN"], async () => {
    try {
        const templates = await prisma.audienceTemplate.findMany({
            orderBy: { updatedAt: "desc" },
            take: 50,
        });
        return ok({ templates });
    } catch (err) {
        console.error("[GET /api/exam/audience-templates] error:", err);
        return serverError();
    }
});

/**
 * POST /api/exam/audience-templates — save the current audience as a template.
 */
export const POST = withRole(["ADMIN"], async (request, { user }) => {
    try {
        const { data, error } = await validateBody(request, audienceTemplateSchema);
        if (error) return error;
        const template = await prisma.audienceTemplate.create({
            data: {
                name: data.name,
                createdById: user.userId,
                mode: data.mode,
                filters: data.filters ?? undefined,
                employeeIds: data.employeeIds || [],
                count: data.count ?? (data.employeeIds || []).length,
            },
        });
        return created({ template });
    } catch (err) {
        console.error("[POST /api/exam/audience-templates] error:", err);
        return serverError();
    }
});
