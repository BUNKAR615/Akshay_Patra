export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { put } from "@vercel/blob";
import prisma from "../../../../lib/prisma";
import { withRole } from "../../../../lib/withRole";
import { ok, fail, serverError } from "../../../../lib/api-response";

const MIN_PDF_SIZE = 50 * 1024;  // 50KB
const MAX_PDF_SIZE = 300 * 1024; // 300KB

/**
 * POST /api/hr/upload-pdf
 * HR uploads attendance or punctuality PDF for an employee.
 * Validates: application/pdf, 50KB-300KB.
 */
export const POST = withRole(["HR", "ADMIN"], async (request, { user }) => {
    try {
        const formData = await request.formData();
        const file = formData.get("file");
        const employeeId = formData.get("employeeId");
        const pdfType = formData.get("pdfType"); // "attendance" or "punctuality"

        if (!file || !employeeId || !pdfType) {
            return fail("file, employeeId, and pdfType (attendance/punctuality) are required");
        }

        if (!["attendance", "punctuality"].includes(pdfType)) {
            return fail("pdfType must be 'attendance' or 'punctuality'");
        }

        // Validate file type
        if (file.type !== "application/pdf") {
            return fail("Only PDF files are allowed");
        }

        // Validate file size
        const fileSize = file.size;
        if (fileSize < MIN_PDF_SIZE) {
            return fail(`PDF must be at least 50KB. Uploaded: ${Math.round(fileSize / 1024)}KB`);
        }
        if (fileSize > MAX_PDF_SIZE) {
            return fail(`PDF must be at most 300KB. Uploaded: ${Math.round(fileSize / 1024)}KB`);
        }

        const quarter = await prisma.quarter.findFirst({ where: { status: "ACTIVE" } });
        if (!quarter) return fail("No active quarter");

        // Upload to Vercel Blob
        const blobPath = `evaluations/${quarter.id}/${employeeId}/${pdfType}.pdf`;
        const blob = await put(blobPath, file, {
            access: "public",
            contentType: "application/pdf",
        });

        // Update or create HR evaluation with PDF URL
        const updateField = pdfType === "attendance"
            ? { attendancePdfUrl: blob.url, attendancePdfSize: fileSize }
            : { punctualityPdfUrl: blob.url, punctualityPdfSize: fileSize };

        await prisma.hrEvaluation.upsert({
            where: {
                hrUserId_employeeId_quarterId: {
                    hrUserId: user.userId,
                    employeeId,
                    quarterId: quarter.id
                }
            },
            update: updateField,
            create: {
                hrUserId: user.userId,
                employeeId,
                quarterId: quarter.id,
                ...updateField
            }
        });

        await prisma.auditLog.create({
            data: {
                userId: user.userId,
                action: "PDF_UPLOADED",
                details: { employeeId, pdfType, quarterId: quarter.id, size: fileSize, url: blob.url }
            }
        }).catch(() => {});

        return ok({
            message: `${pdfType} PDF uploaded successfully`,
            url: blob.url,
            size: fileSize
        });
    } catch (err) {
        console.error("[UPLOAD-PDF] Error:", err.message, err.stack);
        return serverError();
    }
});
