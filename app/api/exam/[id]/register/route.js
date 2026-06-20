export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import prisma from "../../../../../lib/prisma";
import { ok, created, fail, notFound, serverError, validateBody } from "../../../../../lib/api-response";
import { registrationSchema } from "../../../../../lib/examValidators";

// Registration is only open for exams that allow external/open participation
// and are currently live.
function registrationOpen(exam) {
    return exam.status === "ACTIVE" && (exam.participationMode === "INTERNAL_EXTERNAL" || exam.participationMode === "OPEN");
}

/**
 * GET /api/exam/:id/register — PUBLIC. Minimal exam info + which fields the
 * registration form must require. No auth (allow-listed in middleware).
 */
export async function GET(_request, { params }) {
    try {
        const { id } = await params;
        const exam = await prisma.exam.findUnique({
            where: { id },
            select: {
                id: true, title: true, description: true, status: true, participationMode: true,
                externalEmailRequired: true, externalMobileRequired: true, externalEmpCodeRequired: true,
                externalApprovalMode: true,
            },
        });
        if (!exam) return notFound("Exam not found");
        return ok({
            exam: {
                id: exam.id, title: exam.title, description: exam.description,
                emailRequired: exam.externalEmailRequired,
                mobileRequired: exam.externalMobileRequired,
                empCodeRequired: exam.externalEmpCodeRequired,
                approvalMode: exam.externalApprovalMode,
            },
            registrationOpen: registrationOpen(exam),
        });
    } catch (err) {
        console.error("[GET /api/exam/:id/register] error:", err);
        return serverError();
    }
}

/**
 * POST /api/exam/:id/register — PUBLIC. Submit an external registration.
 * Enforces required fields per the exam's settings and rejects duplicate
 * employee codes. Auto-approves when the exam is set to AUTO.
 */
export async function POST(request, { params }) {
    try {
        const { id } = await params;
        const exam = await prisma.exam.findUnique({ where: { id } });
        if (!exam) return notFound("Exam not found");
        if (!registrationOpen(exam)) return fail("Registration is not open for this exam.", 403);

        const { data, error } = await validateBody(request, registrationSchema);
        if (error) return error;

        const empCode = (data.empCode || "").trim();
        const email = (data.email || "").trim();
        const mobile = (data.mobile || "").trim();
        const missing = [];
        if (exam.externalEmpCodeRequired && !empCode) missing.push("employee code");
        if (exam.externalMobileRequired && !mobile) missing.push("mobile number");
        if (exam.externalEmailRequired && !email) missing.push("email");
        if (missing.length) return fail(`Please provide your ${missing.join(", ")}.`, 400);

        // Duplicate registration detection (per exam, by employee code).
        if (empCode) {
            const dup = await prisma.externalRegistrant.findUnique({
                where: { examId_empCode: { examId: id, empCode } },
            });
            if (dup) return fail("This employee code is already registered for this exam.", 409);
        }

        const status = exam.externalApprovalMode === "AUTO" ? "APPROVED" : "PENDING";
        const registrant = await prisma.externalRegistrant.create({
            data: {
                examId: id,
                name: data.name,
                empCode: empCode || `EXT-${Date.now().toString(36)}`,
                email: email || null,
                mobile: mobile || null,
                department: data.department || null,
                branch: data.branch || null,
                designation: data.designation || null,
                status,
            },
            select: { id: true, status: true },
        });

        return created({ registrant, status, autoApproved: status === "APPROVED" });
    } catch (err) {
        if (err?.code === "P2002") return fail("This employee code is already registered for this exam.", 409);
        console.error("[POST /api/exam/:id/register] error:", err);
        return serverError();
    }
}
