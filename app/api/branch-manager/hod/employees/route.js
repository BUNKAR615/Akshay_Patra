export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { z } from "zod";
import prisma from "../../../../../lib/prisma";
import { withRole } from "../../../../../lib/withRole";
import { ok, fail, serverError } from "../../../../../lib/api-response";
import { resolveScopeBranch } from "../../../../../lib/auth/resolveScopeBranch";

const postSchema = z.object({
    hodUserId: z.string().min(1, "hodUserId is required"),
    employeeIds: z.array(z.string().min(1)).min(1, "Pick at least one employee"),
});

const deleteSchema = z.object({
    employeeId: z.string().min(1, "employeeId is required"),
});

/**
 * Per-employee HOD assignment endpoint (BIG branches only).
 *
 *   GET    /api/branch-manager/hod/employees?hodUserId=...
 *          → list BC employees currently under this HOD in the active quarter.
 *   POST   /api/branch-manager/hod/employees
 *          body { hodUserId, employeeIds: string[] }
 *          → upsert EmployeeHodAssignment per employee. The
 *            @@unique([employeeId, quarterId]) constraint guarantees
 *            "one HOD per BC employee at a time" — re-assigning silently moves
 *            an employee from their previous HOD to this one.
 *   DELETE /api/branch-manager/hod/employees
 *          body { employeeId }
 *          → remove the employee's EmployeeHodAssignment for this quarter
 *            (the BM shortlist endpoint will then pick them up as orphaned).
 */

async function ensureBigBranchScope(user) {
    const { branchId, branch } = await resolveScopeBranch(user);
    if (!branchId) return { error: fail("Could not determine your branch") };
    if (branch?.branchType !== "BIG") return { error: fail("HOD employee assignment is only available for big branches") };
    return { branchId, branch };
}

async function getActiveQuarterId() {
    const q = await prisma.quarter.findFirst({ where: { status: "ACTIVE" }, select: { id: true } });
    return q?.id || null;
}

async function assertHodInBranch(hodUserId, branchId) {
    const hodUser = await prisma.user.findUnique({
        where: { id: hodUserId },
        select: { id: true, name: true, branchId: true, department: { select: { branchId: true } } },
    });
    if (!hodUser) return { error: fail("HOD user not found") };
    const userBranchId = hodUser.branchId || hodUser.department?.branchId || null;
    if (!userBranchId || userBranchId !== branchId) {
        return { error: fail(`${hodUser.name} is not in your branch`) };
    }
    return { hodUser };
}

export const GET = withRole(["BRANCH_MANAGER"], async (request, { user }) => {
    try {
        const scope = await ensureBigBranchScope(user);
        if (scope.error) return scope.error;

        const { searchParams } = new URL(request.url);
        const hodUserId = (searchParams.get("hodUserId") || "").trim();
        if (!hodUserId) return fail("hodUserId query param is required");

        const hodCheck = await assertHodInBranch(hodUserId, scope.branchId);
        if (hodCheck.error) return hodCheck.error;

        const quarterId = await getActiveQuarterId();
        if (!quarterId) return fail("No active quarter");

        const rows = await prisma.employeeHodAssignment.findMany({
            where: { hodUserId, quarterId },
            include: {
                employee: {
                    select: {
                        id: true, name: true, empCode: true, designation: true, collarType: true,
                        department: { select: { id: true, name: true } },
                    },
                },
            },
            orderBy: { assignedAt: "desc" },
        });

        return ok({
            hodUserId,
            employees: rows.map((r) => ({
                id: r.employee.id,
                name: r.employee.name,
                empCode: r.employee.empCode,
                designation: r.employee.designation || "",
                departmentId: r.employee.department?.id || null,
                departmentName: r.employee.department?.name || "",
                assignedAt: r.assignedAt,
            })),
            total: rows.length,
        });
    } catch (err) {
        console.error("[HOD-EMPLOYEES-GET] Error:", err.message);
        return serverError();
    }
});

export const POST = withRole(["BRANCH_MANAGER"], async (request, { user }) => {
    try {
        const scope = await ensureBigBranchScope(user);
        if (scope.error) return scope.error;

        const body = await request.json().catch(() => ({}));
        const parsed = postSchema.safeParse(body);
        if (!parsed.success) return fail(parsed.error.errors[0].message);
        const { hodUserId, employeeIds } = parsed.data;

        const hodCheck = await assertHodInBranch(hodUserId, scope.branchId);
        if (hodCheck.error) return hodCheck.error;

        // The HOD must currently have at least one HodAssignment row in this
        // quarter (i.e. they are actually nominated). Without this guard, BMs
        // could attach BC employees to a never-nominated user.
        const quarterId = await getActiveQuarterId();
        if (!quarterId) return fail("No active quarter");
        const hasNomination = await prisma.hodAssignment.findFirst({
            where: { hodUserId, branchId: scope.branchId, quarterId },
            select: { id: true },
        });
        if (!hasNomination) return fail("This user is not currently nominated as HOD. Nominate them first.");

        // Validate every candidate employee: belongs to BM's branch AND is not
        // white-collar. Collar is the employee's own stored category — never
        // inferred from the department. White-collar employees may never be
        // assigned to an HOD; unclassified (null) employees belong to the
        // blue-collar queue, matching the blue-collar-pool listing.
        const uniqueEmpIds = Array.from(new Set(employeeIds));
        const employees = await prisma.user.findMany({
            where: { id: { in: uniqueEmpIds } },
            select: {
                id: true, name: true, collarType: true, branchId: true,
                department: { select: { branchId: true } },
            },
        });
        if (employees.length !== uniqueEmpIds.length) return fail("One or more employees not found");

        for (const e of employees) {
            const empBranchId = e.branchId || e.department?.branchId || null;
            if (empBranchId !== scope.branchId) return fail(`${e.name} is not in your branch`);
            if (e.collarType === "WHITE_COLLAR") {
                return fail(`${e.name} is a white-collar employee — only blue-collar employees can be assigned to an HOD`);
            }
            if (e.id === hodUserId) {
                return fail("HOD cannot be assigned to themselves");
            }
        }

        // Snapshot any previous HOD owners (so we can audit-log moves).
        const previous = await prisma.employeeHodAssignment.findMany({
            where: { employeeId: { in: uniqueEmpIds }, quarterId },
            select: { employeeId: true, hodUserId: true },
        });
        const prevByEmp = new Map(previous.map((p) => [p.employeeId, p.hodUserId]));

        // Upsert in a single transaction so partial failures do not split state.
        await prisma.$transaction(
            uniqueEmpIds.map((employeeId) =>
                prisma.employeeHodAssignment.upsert({
                    where: { employeeId_quarterId: { employeeId, quarterId } },
                    update: { hodUserId, assignedBy: user.userId, assignedAt: new Date() },
                    create: { hodUserId, employeeId, quarterId, assignedBy: user.userId },
                })
            )
        );

        await prisma.auditLog.create({
            data: {
                userId: user.userId,
                action: "HOD_EMPLOYEES_ASSIGNED",
                details: {
                    hodUserId,
                    branchId: scope.branchId,
                    quarterId,
                    moves: uniqueEmpIds.map((id) => ({
                        employeeId: id,
                        fromHodUserId: prevByEmp.get(id) || null,
                        toHodUserId: hodUserId,
                    })),
                },
            },
        }).catch(() => { });

        return ok({
            message: `${uniqueEmpIds.length} employee${uniqueEmpIds.length === 1 ? "" : "s"} assigned to ${hodCheck.hodUser.name}.`,
            assignedCount: uniqueEmpIds.length,
        });
    } catch (err) {
        console.error("[HOD-EMPLOYEES-POST] Error:", err.message);
        return serverError();
    }
});

export const DELETE = withRole(["BRANCH_MANAGER"], async (request, { user }) => {
    try {
        const scope = await ensureBigBranchScope(user);
        if (scope.error) return scope.error;

        const body = await request.json().catch(() => ({}));
        const parsed = deleteSchema.safeParse(body);
        if (!parsed.success) return fail(parsed.error.errors[0].message);
        const { employeeId } = parsed.data;

        const quarterId = await getActiveQuarterId();
        if (!quarterId) return fail("No active quarter");

        const employee = await prisma.user.findUnique({
            where: { id: employeeId },
            select: { id: true, name: true, branchId: true, department: { select: { branchId: true } } },
        });
        if (!employee) return fail("Employee not found");
        const empBranchId = employee.branchId || employee.department?.branchId || null;
        if (empBranchId !== scope.branchId) return fail(`${employee.name} is not in your branch`);

        const existing = await prisma.employeeHodAssignment.findUnique({
            where: { employeeId_quarterId: { employeeId, quarterId } },
            select: { id: true, hodUserId: true },
        });
        if (!existing) {
            return ok({ message: `${employee.name} was not assigned to any HOD.`, removed: false });
        }

        await prisma.employeeHodAssignment.delete({ where: { id: existing.id } });

        await prisma.auditLog.create({
            data: {
                userId: user.userId,
                action: "HOD_EMPLOYEE_UNASSIGNED",
                details: {
                    employeeId,
                    employeeName: employee.name,
                    fromHodUserId: existing.hodUserId,
                    branchId: scope.branchId,
                    quarterId,
                },
            },
        }).catch(() => { });

        return ok({
            message: `${employee.name} returned to your evaluation queue.`,
            removed: true,
            fromHodUserId: existing.hodUserId,
        });
    } catch (err) {
        console.error("[HOD-EMPLOYEES-DELETE] Error:", err.message);
        return serverError();
    }
});
