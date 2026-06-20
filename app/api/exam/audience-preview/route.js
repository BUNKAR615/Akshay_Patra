export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { withRole } from "../../../../lib/withRole";
import { ok, serverError } from "../../../../lib/api-response";
import { computeAudience } from "../../../../lib/examAudience";

/**
 * GET /api/exam/audience-preview?mode=...&branchId=...&departmentId=...&randomCount=...
 * Computes recipient count + breakdown for the builder's live preview WITHOUT
 * requiring a persisted exam. (Static segment — resolves ahead of /api/exam/[id].)
 */
export const GET = withRole(["ADMIN"], async (request) => {
    try {
        const url = new URL(request.url);
        const { count, label, breakdown } = await computeAudience({
            mode: (url.searchParams.get("mode") || "all").toLowerCase(),
            branchId: url.searchParams.get("branchId"),
            departmentId: url.searchParams.get("departmentId"),
            randomCount: url.searchParams.get("randomCount") != null ? Number(url.searchParams.get("randomCount")) : null,
        });
        return ok({ count, label, breakdown });
    } catch (err) {
        console.error("[GET /api/exam/audience-preview] error:", err);
        return serverError();
    }
});
