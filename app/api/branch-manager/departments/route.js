export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../lib/prisma";
import { withRole } from "../../../../lib/withRole";
import { ok, notFound, fail, serverError } from "../../../../lib/api-response";
import { resolveScopeBranch } from "../../../../lib/auth/resolveScopeBranch";
import { getUserDelegations } from "../../../../lib/evaluatorDelegation";

/**
 * GET /api/branch-manager/departments
 * Branch-scoped bootstrap for the BM dashboard.
 * Returns the BM's branch, the active quarter, and every department in that
 * branch with employee counts. Evaluation shortlist data lives in
 * /api/branch-manager/shortlist.
 *
 * Department POA: `delegations` lists the departments this user evaluates
 * under a Branch Manager POA. A pure delegate (no branch BM assignment) gets
 * `delegateOnly: true`, `branch` = their first POA branch and `departments` =
 * only their POA departments — the dashboard then hides the branch-management
 * views (HOD management, branch statistics) and shows evaluation only.
 */
export const GET = withRole(["BRANCH_MANAGER"], async (request, { user }) => {
    try {
        const activeQuarter = await prisma.quarter.findFirst({
            where: { status: "ACTIVE" },
            select: { id: true, name: true, startDate: true, endDate: true, status: true },
        });
        if (!activeQuarter) return notFound("No active quarter found");

        const [{ branch }, delegationRows] = await Promise.all([
            resolveScopeBranch(user),
            getUserDelegations(user.userId, "BRANCH_MANAGER"),
        ]);
        const delegations = delegationRows.map((d) => ({
            id: d.id,
            branchId: d.branchId,
            branchName: d.branch?.name || "",
            departmentId: d.departmentId,
            departmentName: d.department?.name || "",
        }));

        if (!branch) {
            if (delegationRows.length === 0) {
                return fail("No branch is assigned to this Branch Manager. Please contact admin.");
            }
            const first = delegationRows[0].branch;
            return ok({
                quarter: activeQuarter,
                branch: first,
                departments: delegationRows.map((d) => ({
                    id: d.departmentId,
                    name: delegationRows.some((o) => o.branchId !== first.id)
                        ? `${d.department?.name || ""} · ${d.branch?.name || ""}`
                        : (d.department?.name || ""),
                    employeeCount: null,
                })),
                delegateOnly: true,
                delegations,
            });
        }

        const [depts, empGroups] = await Promise.all([
            // Departments are NOT collar-tagged — collar is an employee-level
            // attribute only, so we never read or surface a department collar here.
            prisma.department.findMany({
                where: { branchId: branch.id },
                select: { id: true, name: true },
                orderBy: { name: "asc" },
            }),
            prisma.user.groupBy({
                by: ["departmentId"],
                where: { role: "EMPLOYEE", department: { branchId: branch.id } },
                _count: { _all: true },
            }),
        ]);

        const countByDept = new Map(empGroups.map((g) => [g.departmentId, g._count._all]));
        const departments = depts.map((d) => ({
            id: d.id,
            name: d.name,
            employeeCount: countByDept.get(d.id) || 0,
        }));

        return ok({
            quarter: activeQuarter,
            branch,
            departments,
            delegateOnly: false,
            delegations,
        });
    } catch (err) {
        console.error("BM departments error:", err);
        return serverError();
    }
});
