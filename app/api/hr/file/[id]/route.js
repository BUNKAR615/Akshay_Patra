export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../../lib/prisma";
import { withRole } from "../../../../../lib/withRole";
import { fail } from "../../../../../lib/api-response";

/**
 * GET /api/hr/file/[id]
 *
 * Streams a stored HR proof file (attendance / punctuality PDF, or a legacy
 * Excel reference) back to the browser. The bytes live in the HrUpload table
 * (see POST /api/hr/upload). Gated to the roles that view these proofs.
 */
export const GET = withRole(["HR", "COMMITTEE", "ADMIN"], async (request, { params }) => {
    const { id } = await params;
    if (!id) return fail("Missing file id", 400);

    const record = await prisma.hrUpload.findUnique({
        where: { id },
        select: { data: true, contentType: true, size: true },
    });
    if (!record || !record.data) return fail("File not found", 404);

    // Prisma returns Bytes as a Node Buffer; hand it straight to the Response.
    const body = Buffer.from(record.data);
    return new Response(body, {
        status: 200,
        headers: {
            "Content-Type": record.contentType || "application/octet-stream",
            "Content-Length": String(record.size ?? body.length),
            "Content-Disposition": "inline",
            "Cache-Control": "private, max-age=3600",
        },
    });
});
