export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { z } from "zod";
import prisma from "../../../../lib/prisma";
import { withRole } from "../../../../lib/withRole";
import { ok, fail, serverError } from "../../../../lib/api-response";

/**
 * /api/admin/employee-hod-assignments
 *
 * Admin tooling for per-employee HOD assignments (Blue Collar Stage 2 flow).
 * Backs the "HOD Assignments" tab in /dashboard/admin.
 *
 * GET    → { employees, hods } for the active quarter.
 * POST   → { assignments: [{ employeeId, hodUserId }] }  upserts rows.
 * DELETE → ?employeeId=...  removes the row for active quarter.
 */

async function getActiveQuarter() {
    return prisma.quarter.findFirst({ where: { status: "ACTIVE" } });
}

export const GET = withRole(["ADMIN"], async () => {
    try {
        const quarter = await getActiveQuarter();

        // Users eligible for the two views:
        //   - BLUE_COLLAR: employees assignable to HODs.
        //   - WHITE_COLLAR: employees evaluated directly by the BM (display-only in UI).
        // Include EMPLOYEE and HOD roles so white-collar HODs are also listed (per UI note).
        const users = await prisma.user.findMany({
            where: { role: { in: ["EMPLOYEE", "HOD"] } },
            select: {
                id: true,
                empCode: true,
                name: true,
                collarType: true,
                department: {
                    select: { id: true, name: true, branchId: true, branch: { select: { name: true } } },
                },
            },
            orderBy: [{ name: "asc" }],
        });

        // Current HOD list — for the sidebar.
        const hodUsers = await prisma.user.findMany({
            where: { role: "HOD" },
            select: {
                id: true,
                empCode: true,
                name: true,
                department: {
                    select: { branch: { select: { name: true } } },
                },
            },
            orderBy: [{ name: "asc" }],
        });

        // Per-employee assignment lookup (active quarter only).
        let assignmentsByEmp = new Map();
        let assignedCountByHod = new Map();
        let evaluatedCountByHod = new Map();

        if (quarter) {
            const assignments = await prisma.employeeHodAssignment.findMany({
                where: { quarterId: quarter.id },
                select: { employeeId: true, hodUserId: true },
            });
            for (const a of assignments) {
                assignmentsByEmp.set(a.employeeId, a.hodUserId);
                assignedCountByHod.set(a.hodUserId, (assignedCountByHod.get(a.hodUserId) || 0) + 1);
            }

            const evals = await prisma.hodEvaluation.groupBy({
                by: ["hodId"],
                where: { quarterId: quarter.id },
                _count: { _all: true },
            });
            for (const e of evals) evaluatedCountByHod.set(e.hodId, e._count._all);
        }

        const employees = users.map((u) => ({
            id: u.id,
            empCode: u.empCode || "",
            name: u.name,
            collarType: u.collarType || null,
            department: u.department?.name || "—",
            departmentId: u.department?.id || "",
            branch: u.department?.branch?.name || "—",
            branchId: u.department?.branchId || "",
            assignedHodId: assignmentsByEmp.get(u.id) || null,
        }));

        const hods = hodUsers.map((h) => ({
            id: h.id,
            empCode: h.empCode || "",
            name: h.name,
            branchName: h.department?.branch?.name || null,
            assignedCount: assignedCountByHod.get(h.id) || 0,
            evaluatedCount: evaluatedCountByHod.get(h.id) || 0,
        }));

        return ok({
            employees,
            hods,
            quarter: quarter ? { id: quarter.id, name: quarter.name } : null,
        });
    } catch (err) {
        console.error("[EMP-HOD-ASSIGN GET] Error:", err.message);
        return serverError();
    }
});

const postSchema = z.object({
    assignments: z
        .array(
            z.object({
                employeeId: z.string().min(1),
                hodUserId: z.string().min(1),
            }),
        )
        .min(1, "Provide at least one assignment"),
});

export const POST = withRole(["ADMIN"], async (request, { user }) => {
    try {
        const body = await request.json().catch(() => null);
        const parsed = postSchema.safeParse(body);
        if (!parsed.success) return fail(parsed.error.errors[0].message);
        const { assignments } = parsed.data;

        const quarter = await getActiveQuarter();
        if (!quarter) return fail("No active quarter. Start a quarter before assigning HODs.");

        // Validate all referenced users exist and have the right roles.
        const empIds = [...new Set(assignments.map((a) => a.employeeId))];
        const hodIds = [...new Set(assignments.map((a) => a.hodUserId))];

        const [emps, hods] = await Promise.all([
            prisma.user.findMany({ where: { id: { in: empIds } }, select: { id: true, role: true } }),
            prisma.user.findMany({ where: { id: { in: hodIds } }, select: { id: true, role: true, name: true } }),
        ]);

        const empMap = new Map(emps.map((e) => [e.id, e]));
        const hodMap = new Map(hods.map((h) => [h.id, h]));

        for (const { employeeId, hodUserId } of assignments) {
            if (!empMap.has(employeeId)) return fail(`Employee ${employeeId} not found`);
            if (!hodMap.has(hodUserId)) return fail(`HOD ${hodUserId} not found`);
            if (hodMap.get(hodUserId).role !== "HOD")
                return fail(`User ${hodMap.get(hodUserId).name} is not an HOD`);
        }

        // Upsert each (unique by [employeeId, quarterId]).
        const upserts = assignments.map(({ employeeId, hodUserId }) =>
            prisma.employeeHodAssignment.upsert({
                where: { employeeId_quarterId: { employeeId, quarterId: quarter.id } },
                update: { hodUserId, assignedBy: user.userId, assignedAt: new Date() },
                create: { employeeId, hodUserId, quarterId: quarter.id, assignedBy: user.userId },
            }),
        );
        const saved = await prisma.$transaction(upserts);

        prisma.auditLog
            .create({
                data: {
                    userId: user.userId,
                    action: "EMPLOYEE_HOD_ASSIGNED",
                    details: { count: saved.length, quarterId: quarter.id },
                },
            })
            .catch(() => {});

        return ok({ savedCount: saved.length });
    } catch (err) {
        console.error("[EMP-HOD-ASSIGN POST] Error:", err.message);
        return serverError();
    }
});

export const DELETE = withRole(["ADMIN"], async (request, { user }) => {
    try {
        const employeeId = new URL(request.url).searchParams.get("employeeId");
        if (!employeeId) return fail("employeeId is required");

        const quarter = await getActiveQuarter();
        if (!quarter) return fail("No active quarter.");

        const existing = await prisma.employeeHodAssignment.findUnique({
            where: { employeeId_quarterId: { employeeId, quarterId: quarter.id } },
            select: { id: true, hodUserId: true },
        });
        if (!existing) return fail("No assignment found for this employee in the active quarter.");

        await prisma.employeeHodAssignment.delete({
            where: { employeeId_quarterId: { employeeId, quarterId: quarter.id } },
        });

        prisma.auditLog
            .create({
                data: {
                    userId: user.userId,
                    action: "EMPLOYEE_HOD_UNASSIGNED",
                    details: { employeeId, hodUserId: existing.hodUserId, quarterId: quarter.id },
                },
            })
            .catch(() => {});

        return ok({ removed: 1 });
    } catch (err) {
        console.error("[EMP-HOD-ASSIGN DELETE] Error:", err.message);
        return serverError();
    }
});
