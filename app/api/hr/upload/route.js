export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

import { put } from "@vercel/blob";
import crypto from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import nodePath from "node:path";

import prisma from "../../../../lib/prisma";
import { withRole } from "../../../../lib/withRole";
import { ok, fail, serverError } from "../../../../lib/api-response";
import { getClientIp } from "../../../../lib/http";

/**
 * POST /api/hr/upload
 *
 * Accepts a file from the HR dashboard and uploads it to Vercel Blob.
 * The returned URL is pasted into the HR evaluation payload by the client;
 * we do NOT modify the existing /api/hr/evaluate shape.
 *
 * Per-kind file rules:
 *   - kind="reference"             → Excel only (.xlsx / .xls), ≤ 300 KB
 *   - kind="attendance"|"punctuality" → PDF only (application/pdf), ≤ 10 MB
 *     (these inputs are not exposed in the current HR UI but the route
 *      keeps them so a future re-introduction does not need a backend change)
 *
 * Storage strategy:
 *   - When BLOB_READ_WRITE_TOKEN is present (Vercel deployment with a Blob
 *     store linked), uploads go to Vercel Blob and the public Blob URL is
 *     returned.
 *   - Otherwise (local `npm run dev`, self-hosted Docker / VM), the file is
 *     written under `public/uploads/hr/<kind>/` and a relative URL is
 *     returned. Next.js serves that via its static handler. This avoids the
 *     500 that would otherwise come from `put()` throwing on a missing
 *     token, while leaving the production path untouched.
 */
const MAX_PDF_BYTES = 10 * 1024 * 1024;        // 10 MB — attendance / punctuality
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

        // Per-kind validation — Excel + 300 KB for the reference attachment
        // shown on the HR page; PDFs preserved for the dormant kinds.
        let storedContentType;
        let defaultBaseName;
        if (kind === "reference") {
            if (file.size > MAX_REF_BYTES) {
                return fail("Excel file must be 300 KB or smaller", 413);
            }
            const isExcelMime = EXCEL_MIME_TYPES.has(file.type);
            const isExcelExt = EXCEL_EXTENSION_RE.test(file.name || "");
            if (!isExcelMime && !isExcelExt) {
                return fail("Reference sheet must be an Excel file (.xlsx or .xls)", 415);
            }
            // Preserve the actual MIME when the browser provided one; fall
            // back to a sensible Excel default by extension otherwise.
            storedContentType = file.type
                || (/\.xls$/i.test(file.name || "") ? "application/vnd.ms-excel"
                                                   : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
            defaultBaseName = "upload.xlsx";
        } else {
            if (file.size > MAX_PDF_BYTES) {
                return fail(`File exceeds ${MAX_PDF_BYTES / (1024 * 1024)}MB limit`, 413);
            }
            if (file.type !== "application/pdf") {
                return fail("Only application/pdf is accepted", 415);
            }
            storedContentType = "application/pdf";
            defaultBaseName = "upload.pdf";
        }

        const safeName = String(file.name || defaultBaseName).replace(/[^a-zA-Z0-9._-]/g, "_");
        const filename = `${crypto.randomUUID()}-${safeName}`;
        const blobKey = `hr/${kind}/${filename}`;

        // Branch on Vercel Blob availability. The Blob token is auto-injected
        // by Vercel for projects with a linked Blob store; everywhere else
        // (local dev, self-hosted) it isn't, so we write to the local
        // filesystem under public/ and return a relative URL.
        let url;
        if (process.env.BLOB_READ_WRITE_TOKEN) {
            const blob = await put(blobKey, file, {
                access: "public",
                addRandomSuffix: false,
                contentType: storedContentType,
            });
            url = blob.url;
        } else {
            const dir = nodePath.join(process.cwd(), "public", "uploads", "hr", kind);
            await mkdir(dir, { recursive: true });
            const buffer = Buffer.from(await file.arrayBuffer());
            await writeFile(nodePath.join(dir, filename), buffer);
            url = `/uploads/hr/${kind}/${filename}`;
        }

        await prisma.auditLog.create({
            data: {
                userId: user.userId,
                action: "HR_UPLOAD",
                ipAddress: getClientIp(request),
                details: { kind, size: file.size, url },
            },
        }).catch(() => {});

        return ok({ url });
    } catch (err) {
        console.error("[HR_UPLOAD] Error:", err?.code, err?.message, err?.stack);
        return serverError();
    }
});
