export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../../../lib/prisma";
import { withRole } from "../../../../../../lib/withRole";
import { ok, fail, serverError, notFound } from "../../../../../../lib/api-response";
import { branchEvalConfigSchema } from "../../../../../../lib/validators";
import { resolveBranch } from "../../../../../../lib/resolveBranch";

/**
 * GET /api/admin/branches/[id]/eval-config?quarterId=xxx
 * Get branch eval config for a quarter
 */
export const GET = withRole(["ADMIN"], async (request, { params }) => {
    try {
        const { branchId: slugOrId } = await params;
        const resolved = await resolveBranch(slugOrId);
        if (!resolved) return notFound("Branch not found");
        const id = resolved.id;

        const { searchParams } = new URL(request.url);
        const quarterId = searchParams.get("quarterId");

        if (!quarterId) return fail("quarterId is required");

        const config = await prisma.branchEvalConfig.findUnique({
            where: { branchId_quarterId: { branchId: id, quarterId } },
        });

        return ok({ config });
    } catch (err) {
        console.error("[EVAL-CONFIG] GET Error:", err.message);
        return serverError();
    }
});

/**
 * POST /api/admin/branches/[id]/eval-config
 * Create or update branch eval config for a quarter
 */
export const POST = withRole(["ADMIN"], async (request, { params, user }) => {
    try {
        const { branchId: slugOrId } = await params;
        const resolved = await resolveBranch(slugOrId);
        if (!resolved) return notFound("Branch not found");
        const id = resolved.id;

        const body = await request.json();
        body.branchId = id;

        const { data, error } = (() => {
            const result = branchEvalConfigSchema.safeParse(body);
            return result.success
                ? { data: result.data, error: null }
                : { data: null, error: fail(result.error.errors[0].message) };
        })();
        if (error) return error;

        const config = await prisma.branchEvalConfig.upsert({
            where: {
                branchId_quarterId: {
                    branchId: id,
                    quarterId: data.quarterId,
                },
            },
            update: {
                stage1CutoffPct: data.stage1CutoffPct,
                stage2Limit: data.stage2Limit,
                stage3Limit: data.stage3Limit,
                stage4Limit: data.stage4Limit,
            },
            create: {
                branchId: id,
                quarterId: data.quarterId,
                stage1CutoffPct: data.stage1CutoffPct,
                stage2Limit: data.stage2Limit,
                stage3Limit: data.stage3Limit,
                stage4Limit: data.stage4Limit,
            },
        });

        await prisma.auditLog.create({
            data: {
                userId: user.userId,
                action: "BRANCH_EVAL_CONFIG_SET",
                details: { branchId: id, config },
            },
        }).catch(() => {});

        return ok({ config });
    } catch (err) {
        console.error("[EVAL-CONFIG] POST Error:", err.message);
        return serverError();
    }
});
