export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../lib/prisma";
import { withRole } from "../../../../lib/withRole";
import { ok, fail, serverError } from "../../../../lib/api-response";

/**
 * GET /api/admin/employee-hod-assignments?hodUserId=...&branchId=...&departmentId=...&collarType=...
 *
 * Returns two lists:
 *   - hods: [{ id, name, empCode, branchId, branchName, assignedCount, evaluatedCount }]
 *   - employees: blue-collar employees in the given branch (filterable by dept/collar),
 *     each with { id, name, empCode, department, branch, collarType, assignedHodId }
 *
 * The admin uses this to see all HODs in a branch and all BC employees, and to see
 * which are already assigned.
 */
export const GET = withRole(["ADMIN"], async (request) => {
    try {
        const { searchParams } = new URL(request.url);
        const hodUserId = searchParams.get("hodUserId") || "";
        const branchId = searchParams.get("branchId") || "";
        const departmentId = searchParams.get("departmentId") || "";
        const collarType = searchParams.get("collarType") || "";

        const quarter = await prisma.quarter.findFirst({ where: { status: "ACTIVE" } });
        if (!quarter) return fail("No active quarter");

        // 1. Find all HODs (users with HOD role via DepartmentRoleMapping)
        const hodMappings = await prisma.departmentRoleMapping.findMany({
            where: { role: "HOD" },
            select: {
                userId: true,
                department: { select: { id: true, name: true, branchId: true, branch: { select: { id: true, name: true } } } },
                user: { select: { id: true, name: true, empCode: true } },
            },
            distinct: ["userId"],
        });

        let hods = hodMappings
            .filter((m) => (branchId ? m.department.branchId === branchId : true))
            .map((m) => ({
                id: m.user.id,
                name: m.user.name,
                empCode: m.user.empCode,
                departmentId: m.department.id,
                departmentName: m.department.name,
                branchId: m.department.branchId,
                branchName: m.department.branch.name,
            }));

        // Deduplicate HODs by user id (keep first dept)
        const seen = new Set();
        hods = hods.filter((h) => {
            if (seen.has(h.id)) return false;
            seen.add(h.id);
            return true;
        });

        // 2. Count assignments + evaluations per HOD
        const assignCounts = await prisma.employeeHodAssignment.groupBy({
            by: ["hodUserId"],
            where: { quarterId: quarter.id },
            _count: { employeeId: true },
        });
        const assignCountMap = new Map(assignCounts.map((a) => [a.hodUserId, a._count.employeeId]));

        const evalCounts = await prisma.hodEvaluation.groupBy({
            by: ["hodId"],
            where: { quarterId: quarter.id },
            _count: { employeeId: true },
        });
        const evalCountMap = new Map(evalCounts.map((a) => [a.hodId, a._count.employeeId]));

        hods = hods.map((h) => ({
            ...h,
            assignedCount: assignCountMap.get(h.id) || 0,
            evaluatedCount: evalCountMap.get(h.id) || 0,
        }));

        // 3. Employees in the branch. Include all EMPLOYEE-role users and HODs
        // so the admin UI can show both Blue Collar (for assignment) and White
        // Collar (for visibility, includes HODs) in one response.
        const empWhere = {
            OR: [
                { role: "EMPLOYEE", departmentRoles: { none: {} } },
                { departmentRoles: { some: { role: "HOD" } } },
            ],
        };
        if (branchId) empWhere.department = { branchId };
        if (departmentId) empWhere.departmentId = departmentId;
        // collarType filter applied client-side in admin UI to avoid OR conflict

        const employees = await prisma.user.findMany({
            where: empWhere,
            select: {
                id: true,
                empCode: true,
                name: true,
                collarType: true,
                department: {
                    select: {
                        id: true, name: true, collarType: true,
                        branch: { select: { id: true, name: true } },
                    },
                },
            },
            orderBy: [{ department: { name: "asc" } }, { name: "asc" }],
        });

        const assignments = await prisma.employeeHodAssignment.findMany({
            where: { quarterId: quarter.id },
            select: { employeeId: true, hodUserId: true },
        });
        const empToHod = new Map(assignments.map((a) => [a.employeeId, a.hodUserId]));

        const employeeList = employees.map((e) => ({
            id: e.id,
            empCode: e.empCode,
            name: e.name,
            departmentId: e.department?.id || null,
            department: e.department?.name || "—",
            branchId: e.department?.branch?.id || null,
            branch: e.department?.branch?.name || "—",
            collarType: e.collarType || e.department?.collarType || "BLUE_COLLAR",
            assignedHodId: empToHod.get(e.id) || null,
        }));

        // Filter by specific HOD if requested
        const filteredEmployees = hodUserId
            ? employeeList.filter((e) => e.assignedHodId === hodUserId)
            : employeeList;

        return ok({
            quarterId: quarter.id,
            hods,
            employees: filteredEmployees,
            totalEmployees: employeeList.length,
        });
    } catch (err) {
        console.error("[ADMIN-HOD-ASSIGN GET] Error:", err.message);
        return serverError();
    }
});

/**
 * POST /api/admin/employee-hod-assignments
 * Body: { assignments: [{ employeeId, hodUserId }] }  OR  { employeeId, hodUserId }
 * Upserts assignments for the active quarter. Replaces any existing assignment for each employee.
 */
export const POST = withRole(["ADMIN"], async (request, { user }) => {
    try {
        const body = await request.json();
        const raw = Array.isArray(body.assignments) ? body.assignments : [body];
        const items = raw.filter((x) => x && x.employeeId && x.hodUserId);
        if (items.length === 0) return fail("No valid assignments provided");

        const quarter = await prisma.quarter.findFirst({ where: { status: "ACTIVE" } });
        if (!quarter) return fail("No active quarter");

        const results = [];
        for (const it of items) {
            const rec = await prisma.employeeHodAssignment.upsert({
                where: { employeeId_quarterId: { employeeId: it.employeeId, quarterId: quarter.id } },
                create: {
                    employeeId: it.employeeId,
                    hodUserId: it.hodUserId,
                    quarterId: quarter.id,
                    assignedBy: user.userId,
                },
                update: { hodUserId: it.hodUserId, assignedBy: user.userId },
            });
            results.push(rec);
        }

        await prisma.auditLog.create({
            data: {
                userId: user.userId,
                action: "HOD_ASSIGNMENTS_UPDATED",
                details: { count: results.length, quarterId: quarter.id },
            },
        }).catch(() => {});

        return ok({ updated: results.length });
    } catch (err) {
        console.error("[ADMIN-HOD-ASSIGN POST] Error:", err.message);
        return serverError();
    }
});

/**
 * DELETE /api/admin/employee-hod-assignments?employeeId=...
 * Remove an employee's assignment for the active quarter.
 */
export const DELETE = withRole(["ADMIN"], async (request) => {
    try {
        const { searchParams } = new URL(request.url);
        const employeeId = searchParams.get("employeeId") || "";
        if (!employeeId) return fail("employeeId required");

        const quarter = await prisma.quarter.findFirst({ where: { status: "ACTIVE" } });
        if (!quarter) return fail("No active quarter");

        await prisma.employeeHodAssignment.deleteMany({
            where: { employeeId, quarterId: quarter.id },
        });

        return ok({ deleted: true });
    } catch (err) {
        console.error("[ADMIN-HOD-ASSIGN DELETE] Error:", err.message);
        return serverError();
    }
});
