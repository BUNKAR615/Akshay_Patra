export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import prisma from "../../../../../lib/prisma";
import { withRole } from "../../../../../lib/withRole";
import { ok, notFound, serverError, validateBody } from "../../../../../lib/api-response";
import { audienceTemplateUpdateSchema } from "../../../../../lib/examValidators";

/**
 * PATCH /api/exam/audience-templates/:id — rename or update a saved audience.
 */
export const PATCH = withRole(["ADMIN"], async (request, { params }) => {
    try {
        const { id } = await params;
        const existing = await prisma.audienceTemplate.findUnique({ where: { id } });
        if (!existing) return notFound("Template not found");

        const { data, error } = await validateBody(request, audienceTemplateUpdateSchema);
        if (error) return error;

        const patch = { ...data };
        if (data.filters !== undefined) patch.filters = data.filters ?? undefined;
        if (data.employeeIds && data.count == null) patch.count = data.employeeIds.length;

        const template = await prisma.audienceTemplate.update({ where: { id }, data: patch });
        return ok({ template });
    } catch (err) {
        console.error("[PATCH /api/exam/audience-templates/:id] error:", err);
        return serverError();
    }
});

/**
 * DELETE /api/exam/audience-templates/:id — remove a saved audience.
 */
export const DELETE = withRole(["ADMIN"], async (request, { params }) => {
    try {
        const { id } = await params;
        const existing = await prisma.audienceTemplate.findUnique({ where: { id } });
        if (!existing) return notFound("Template not found");
        await prisma.audienceTemplate.delete({ where: { id } });
        return ok({ message: "Template deleted" });
    } catch (err) {
        console.error("[DELETE /api/exam/audience-templates/:id] error:", err);
        return serverError();
    }
});
