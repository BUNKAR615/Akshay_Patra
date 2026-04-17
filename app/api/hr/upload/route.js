export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

import { put } from "@vercel/blob";
import crypto from "node:crypto";

import prisma from "../../../../lib/prisma";
import { withRole } from "../../../../lib/withRole";
import { ok, fail, serverError } from "../../../../lib/api-response";
import { getClientIp } from "../../../../lib/http";

/**
 * POST /api/hr/upload
 *
 * Accepts a PDF file from the HR dashboard and uploads it to Vercel Blob.
 * The returned URL is pasted into the HR evaluation payload by the client;
 * we do NOT modify the existing /api/hr/evaluate shape.
 *
 * FormData fields:
 *   - file: File (application/pdf, <= 10MB)
 *   - kind: "attendance" | "punctuality" | "reference"
 *
 * Requires BLOB_READ_WRITE_TOKEN in the environment (Vercel sets this
 * automatically once a Blob store is linked to the project).
 */
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_KINDS = new Set(["attendance", "punctuality", "reference"]);

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
        if (file.size > MAX_BYTES) {
            return fail(`File exceeds ${MAX_BYTES / (1024 * 1024)}MB limit`, 413);
        }
        if (file.type !== "application/pdf") {
            return fail("Only application/pdf is accepted", 415);
        }

        const safeName = String(file.name || "upload.pdf").replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `hr/${kind}/${crypto.randomUUID()}-${safeName}`;
        const blob = await put(path, file, {
            access: "public",
            addRandomSuffix: false,
            contentType: "application/pdf",
        });

        await prisma.auditLog.create({
            data: {
                userId: user.userId,
                action: "HR_UPLOAD",
                ipAddress: getClientIp(request),
                details: { kind, size: file.size, url: blob.url },
            },
        }).catch(() => {});

        return ok({ url: blob.url });
    } catch (err) {
        console.error("[HR_UPLOAD] Error:", err?.code, err?.message);
        return serverError();
    }
});
