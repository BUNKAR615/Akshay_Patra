export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../../lib/prisma";
import { withRole } from "../../../../../lib/withRole";
import { ok, fail, serverError } from "../../../../../lib/api-response";
import { resolveScopeBranch } from "../../../../../lib/auth/resolveScopeBranch";

/**
 * GET /api/branch-manager/hod/blue-collar-pool
 *   - No `departmentId` → list every BLUE_COLLAR department in the BM's branch,
 *     plus the count of employees in each.
 *   - `?departmentId=...` → list every employee in that BC department, with
 *     their CURRENT HOD assignment (if any) so the UI can show
 *     "Currently under: <HOD name>" and prompt before reassigning.
 *
 * Big branches only — small branches do not have HODs.
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

        if (!departmentId) {
            // Mode 1 — list BC departments in the branch with employee counts.
            // The counts shown here are STAGE-1 SHORTLISTED counts (matching
            // Mode 2's listing). Spec: "Inside each blue-collar department,
            // show only employees who have passed Stage 1 according to the
            // Stage 1 formula." Showing the raw employee count would
            // mislead the BM — they'd open a dept expecting N people and
            // find only the Stage-1 subset.
            const depts = await prisma.department.findMany({
                where: { branchId, collarType: "BLUE_COLLAR" },
                select: { id: true, name: true, collarType: true },
                orderBy: { name: "asc" },
            });
            const deptIds = depts.map((d) => d.id);
            // Stage 1 shortlist for this branch + active quarter, narrowed
            // to BC users in the BC departments above.
            const stage1Rows = deptIds.length > 0
                ? await prisma.branchShortlistStage1.findMany({
                    where: {
                        branchId,
                        quarterId: quarter.id,
                        user: { departmentId: { in: deptIds }, role: "EMPLOYEE" },
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
                    id: d.id, name: d.name, collarType: d.collarType,
                    employeeCount: countByDept.get(d.id) || 0,
                })),
            });
        }

        // Mode 2 — employees in a specific BC department who have PASSED
        // STAGE 1 (per spec). We read the Stage-1 shortlist for this
        // branch+quarter and intersect with the department's BC employees.
        const dept = await prisma.department.findUnique({
            where: { id: departmentId },
            select: { id: true, name: true, branchId: true, collarType: true },
        });
        if (!dept || dept.branchId !== branchId) return fail("Department not in your branch");
        if (dept.collarType !== "BLUE_COLLAR") return fail("Department is not a blue-collar department");

        const stage1 = await prisma.branchShortlistStage1.findMany({
            where: {
                branchId,
                quarterId: quarter.id,
                user: {
                    departmentId: dept.id,
                    role: "EMPLOYEE",
                    OR: [{ collarType: "BLUE_COLLAR" }, { collarType: null }],
                },
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
            department: { id: dept.id, name: dept.name, collarType: dept.collarType },
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
