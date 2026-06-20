export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import prisma from "../../../../../lib/prisma";
import { withRole } from "../../../../../lib/withRole";
import { ok, notFound, serverError, validateBody } from "../../../../../lib/api-response";
import { audienceSchema } from "../../../../../lib/examValidators";
import { computeAudience } from "../../../../../lib/examAudience";

function modeArgs(mode, q) {
    return {
        mode,
        branchId: q.branchId || null,
        departmentId: q.departmentId || null,
        randomCount: q.randomCount != null ? Number(q.randomCount) : null,
    };
}

/**
 * GET /api/exam/:id/audience?mode=...&branchId=...&departmentId=...&randomCount=...
 * Live preview — computes recipient count + breakdown WITHOUT persisting.
 */
export const GET = withRole(["ADMIN"], async (request) => {
    try {
        const url = new URL(request.url);
        const mode = (url.searchParams.get("mode") || "all").toLowerCase();
        const q = {
            branchId: url.searchParams.get("branchId"),
            departmentId: url.searchParams.get("departmentId"),
            randomCount: url.searchParams.get("randomCount"),
        };
        const { count, label, breakdown } = await computeAudience(modeArgs(mode, q));
        return ok({ count, label, breakdown });
    } catch (err) {
        console.error("[GET /api/exam/:id/audience] error:", err);
        return serverError();
    }
});

/**
 * PUT /api/exam/:id/audience — persist the audience filter. When
 * `materialize` is true (e.g. on publish), creates ExamInvite rows for the
 * resolved recipients (idempotent — skips duplicates).
 */
export const PUT = withRole(["ADMIN"], async (request, { params, user }) => {
    try {
        const { id } = await params;
        const exam = await prisma.exam.findUnique({ where: { id } });
        if (!exam) return notFound("Exam not found");

        const { data, error } = await validateBody(request, audienceSchema);
        if (error) return error;

        const mode = data.mode.toLowerCase();
        const resolved = await computeAudience({
            mode,
            branchId: data.branchId || null,
            departmentId: data.departmentId || null,
            randomCount: data.randomCount ?? null,
            customRules: data.customRules ?? null,
        });

        const audience = await prisma.examAudience.upsert({
            where: { examId: id },
            update: {
                mode: data.mode,
                branchId: data.branchId || null,
                departmentId: data.departmentId || null,
                role: data.role || null,
                randomCount: data.randomCount ?? null,
                customRules: data.customRules ?? undefined,
                recipients: resolved.count,
            },
            create: {
                examId: id,
                mode: data.mode,
                branchId: data.branchId || null,
                departmentId: data.departmentId || null,
                role: data.role || null,
                randomCount: data.randomCount ?? null,
                customRules: data.customRules ?? undefined,
                recipients: resolved.count,
            },
        });

        let invited = 0;
        const materialize = new URL(request.url).searchParams.get("materialize") === "1";
        if (materialize && resolved.employeeIds.length) {
            const result = await prisma.examInvite.createMany({
                data: resolved.employeeIds.map((employeeId) => ({ examId: id, employeeId })),
                skipDuplicates: true,
            });
            invited = result.count;
            await prisma.auditLog.create({
                data: { userId: user.userId, action: "EXAM_INVITES_CREATED", details: { examId: id, created: invited, total: resolved.employeeIds.length } },
            });
        }

        return ok({ audience, count: resolved.count, label: resolved.label, breakdown: resolved.breakdown, invited });
    } catch (err) {
        console.error("[PUT /api/exam/:id/audience] error:", err);
        return serverError();
    }
});
