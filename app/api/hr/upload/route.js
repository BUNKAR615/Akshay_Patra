export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

import prisma from "../../../../lib/prisma";
import { withRole } from "../../../../lib/withRole";
import { ok, fail, serverError } from "../../../../lib/api-response";
import { getClientIp } from "../../../../lib/http";

/**
 * POST /api/hr/upload
 *
 * Accepts a file from the HR dashboard, stores its bytes in Postgres (Neon)
 * as an HrUpload row, and returns a relative URL ("/api/hr/file/<id>") that the
 * client saves on the HR evaluation. The bytes are streamed back by the
 * matching GET /api/hr/file/[id] route.
 *
 * Storing in the database (rather than the filesystem or an external blob
 * store) means uploads work on Vercel's read-only serverless filesystem with
 * no extra configuration.
 *
 * Per-kind file rules:
 *   - kind="reference"                 → Excel only (.xlsx / .xls), ≤ 300 KB
 *   - kind="attendance"|"punctuality"  → PDF only (application/pdf), ≤ 1 MB
 */
const MAX_PDF_BYTES = 1 * 1024 * 1024;         // 1 MB — attendance / punctuality
const MAX_REF_BYTES = 300 * 1024;              // 300 KB — Excel reference attachment
const ALLOWED_KINDS = new Set(["attendance", "punctuality", "reference"]);
const EXCEL_MIME_TYPES = new Set([
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
    "application/vnd.ms-excel",                                          // .xls
]);
const EXCEL_EXTENSION_RE = /\.(xlsx|xls)$/i;

export const POST = withRole(["HR", "ADMIN"], async (request, { user }) => {
    try {
        const form = await request.formData();
        const file = form.get("file");
        const kind = String(form.get("kind") || "").toLowerCase();

        if (!file || typeof file === "string") {
            return fail("Missing file", 400);
        }
        if (!ALLOWED_KINDS.has(kind)) {
            return fail(`kind must be one of: ${[...ALLOWED_KINDS].join(", ")}`, 400);
        }

        // Per-kind validation — Excel + 300 KB for the reference attachment;
        // PDF + 1 MB for the attendance / punctuality proofs.
        let storedContentType;
        if (kind === "reference") {
            if (file.size > MAX_REF_BYTES) {
                return fail("Excel file must be 300 KB or smaller", 413);
            }
            const isExcelMime = EXCEL_MIME_TYPES.has(file.type);
            const isExcelExt = EXCEL_EXTENSION_RE.test(file.name || "");
            if (!isExcelMime && !isExcelExt) {
                return fail("Reference sheet must be an Excel file (.xlsx or .xls)", 415);
            }
            storedContentType = file.type
                || (/\.xls$/i.test(file.name || "") ? "application/vnd.ms-excel"
                                                   : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        } else {
            if (file.size > MAX_PDF_BYTES) {
                return fail(`File exceeds ${MAX_PDF_BYTES / (1024 * 1024)}MB limit`, 413);
            }
            if (file.type !== "application/pdf") {
                return fail("Only application/pdf is accepted", 415);
            }
            storedContentType = "application/pdf";
        }

        // Persist the bytes in Postgres and hand back a stable, role-gated URL.
        const buffer = Buffer.from(await file.arrayBuffer());
        const record = await prisma.hrUpload.create({
            data: {
                kind,
                contentType: storedContentType,
                size: buffer.length,
                data: buffer,
                uploadedById: user.userId,
            },
            select: { id: true },
        });
        const url = `/api/hr/file/${record.id}`;

        await prisma.auditLog.create({
            data: {
                userId: user.userId,
                action: "HR_UPLOAD",
                ipAddress: getClientIp(request),
                details: { kind, size: buffer.length, url },
            },
        }).catch(() => {});

        return ok({ url });
    } catch (err) {
        console.error("[HR_UPLOAD] Error:", err?.code, err?.message, err?.stack);
        return serverError();
    }
});
