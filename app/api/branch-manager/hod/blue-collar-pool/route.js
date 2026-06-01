export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../../lib/prisma";
import { withRole } from "../../../../../lib/withRole";
import { ok, fail, serverError } from "../../../../../lib/api-response";
import { resolveScopeBranch } from "../../../../../lib/auth/resolveScopeBranch";

/**
 * GET /api/branch-manager/hod/blue-collar-pool
 *   - No `departmentId` → list EVERY department in the BM's branch (departments
 *     are not collar-tagged), each with a count of its blue-collar employees who
 *     have cleared Stage 1.
 *   - `?departmentId=...` → list the blue-collar, Stage-1-cleared employees in
 *     that department, with their CURRENT HOD assignment (if any) so the UI can
 *     show "Currently under: <HOD name>" and prompt before reassigning.
 *
 * Collar is read from the employee's own stored category (User.collarType);
 * white-collar employees are never included. Big branches only — small branches
 * do not have HODs.
 */
export const GET = withRole(["BRANCH_MANAGER"], async (request, { user }) => {
    try {
        const { branchId, branch } = await resolveScopeBranch(user);
        if (!branchId) return fail("Could not determine your branch");
        if (branch?.branchType !== "BIG") return fail("Blue-collar pool is only available for big branches");

        const quarter = await prisma.quarter.findFirst({ where: { status: "ACTIVE" }, select: { id: true } });
        if (!quarter) return fail("No active quarter");

        const { searchParams } = new URL(request.url);
        const departmentId = (searchParams.get("departmentId") || "").trim();

        // Blue-collar = the employee's own stored category. We include
        // unclassified (null) employees too — they are not white-collar, so
        // they belong in the blue-collar queue — but never WHITE_COLLAR ones.
        const blueCollarUserFilter = {
            role: "EMPLOYEE",
            OR: [{ collarType: "BLUE_COLLAR" }, { collarType: null }],
        };

        if (!departmentId) {
            // Mode 1 — list EVERY department in the branch (no collar gate), each
            // with the count of its blue-collar employees who cleared Stage 1.
            // The count matches Mode 2's listing exactly so the BM isn't misled.
            // A department with only white-collar staff simply shows a count of 0
            // but stays in the list (spec: show all departments).
            const depts = await prisma.department.findMany({
                where: { branchId },
                select: { id: true, name: true },
                orderBy: { name: "asc" },
            });
            const deptIds = depts.map((d) => d.id);
            const stage1Rows = deptIds.length > 0
                ? await prisma.branchShortlistStage1.findMany({
                    where: {
                        branchId,
                        quarterId: quarter.id,
                        user: { departmentId: { in: deptIds }, ...blueCollarUserFilter },
                    },
                    select: { user: { select: { departmentId: true } } },
                })
                : [];
            const countByDept = new Map();
            for (const r of stage1Rows) {
                const d = r.user?.departmentId;
                if (!d) continue;
                countByDept.set(d, (countByDept.get(d) || 0) + 1);
            }
            return ok({
                departments: depts.map((d) => ({
                    id: d.id, name: d.name,
                    employeeCount: countByDept.get(d.id) || 0,
                })),
            });
        }

        // Mode 2 — blue-collar employees in a specific department who have
        // PASSED STAGE 1 (per spec). Any department may be opened; we read the
        // Stage-1 shortlist for this branch+quarter and intersect with the
        // department's blue-collar employees. White-collar staff never appear.
        const dept = await prisma.department.findUnique({
            where: { id: departmentId },
            select: { id: true, name: true, branchId: true },
        });
        if (!dept || dept.branchId !== branchId) return fail("Department not in your branch");

        const stage1 = await prisma.branchShortlistStage1.findMany({
            where: {
                branchId,
                quarterId: quarter.id,
                user: { departmentId: dept.id, ...blueCollarUserFilter },
            },
            select: {
                user: {
                    select: { id: true, name: true, empCode: true, designation: true, collarType: true },
                },
            },
            orderBy: { user: { name: "asc" } },
        });
        const employees = stage1.map((s) => s.user).filter(Boolean);

        const employeeIds = employees.map((e) => e.id);
        const empHodRows = employeeIds.length > 0
            ? await prisma.employeeHodAssignment.findMany({
                where: { quarterId: quarter.id, employeeId: { in: employeeIds } },
                select: {
                    employeeId: true,
                    hodUserId: true,
                    hod: { select: { id: true, name: true, empCode: true } },
                },
            })
            : [];
        const hodByEmp = new Map(empHodRows.map((r) => [r.employeeId, r]));

        return ok({
            department: { id: dept.id, name: dept.name },
            employees: employees.map((e) => {
                const cur = hodByEmp.get(e.id);
                return {
                    id: e.id,
                    name: e.name,
                    empCode: e.empCode,
                    designation: e.designation || "",
                    currentHod: cur
                        ? { id: cur.hod.id, name: cur.hod.name, empCode: cur.hod.empCode }
                        : null,
                };
            }),
        });
    } catch (err) {
        console.error("[HOD-BC-POOL] Error:", err.message);
        return serverError();
    }
});
