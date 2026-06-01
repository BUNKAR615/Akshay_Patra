export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../../lib/prisma";
import { withRole } from "../../../../../lib/withRole";
import { ok, fail, serverError } from "../../../../../lib/api-response";
import { resolveScopeBranch } from "../../../../../lib/auth/resolveScopeBranch";

/**
 * GET /api/branch-manager/hod/search?q=...
 * Search candidate HODs by empCode, name, or department name within the BM's branch.
 *
 * Filters:
 *   - Must be in the BM's own branch (branch isolation).
 *   - Must be WHITE_COLLAR by the employee's OWN stored category
 *     (User.collarType) in this branch — never inferred from the department or
 *     another branch. Spec: only white-collar employees may be nominated as
 *     HOD, and the check comes from the employee's stored collar.
 *   - Excludes the BM themselves (a BM cannot nominate themselves).
 */
/**
 * Modes:
 *   - q only            → free-text search across empCode/name/department.
 *   - departmentId only → browse mode: every white-collar employee in that one
 *                         department. ANY department may be picked; a department
 *                         with no white-collar employees simply returns an empty
 *                         candidate list (spec: still selectable, no candidates).
 *   - both              → free-text within the chosen department.
 *   - neither           → first 50 WC candidates in the branch (existing
 *                         empty-query behaviour, preserved for back-compat).
 *
 * Every candidate carries `currentHodDepartments` — the list of departments
 * this employee is already HOD of in the ACTIVE quarter. The dashboard uses
 * that to render an "Already HOD" badge while still keeping the row in the
 * list (spec: "Already-selected HODs should still appear in the list, but
 * their name must show that they are already selected as HOD").
 */
export const GET = withRole(["BRANCH_MANAGER"], async (request, { user }) => {
    try {
        const { searchParams } = new URL(request.url);
        const q = (searchParams.get("q") || "").trim();
        const departmentId = (searchParams.get("departmentId") || "").trim();

        const { branchId } = await resolveScopeBranch(user);
        if (!branchId) return fail("Could not determine your branch");

        // WHITE_COLLAR comes from the employee's OWN stored category only —
        // never inferred from the department (departments are not collar-tagged).
        const whiteCollarFilter = { collarType: "WHITE_COLLAR" };

        const where = {
            AND: [
                { department: { branchId } },
                { id: { not: user.userId } },
                whiteCollarFilter,
            ],
        };

        // Browse-by-department: when the BM clicks a department tile, scope the
        // candidate list to that single department. ANY department in the branch
        // may be browsed (no collar gate) — one with no white-collar employees
        // just yields an empty list. We still confirm the department belongs to
        // the BM's branch (defence in depth — the assign route re-checks too).
        if (departmentId) {
            const dept = await prisma.department.findUnique({
                where: { id: departmentId },
                select: { id: true, branchId: true },
            });
            if (!dept || dept.branchId !== branchId) {
                return fail("Department not in your branch");
            }
            where.AND.push({ departmentId });
        }

        if (q) {
            where.AND.push({
                OR: [
                    { empCode: { contains: q, mode: "insensitive" } },
                    { name: { contains: q, mode: "insensitive" } },
                    { department: { name: { contains: q, mode: "insensitive" } } },
                ],
            });
        }

        const candidates = await prisma.user.findMany({
            where,
            select: {
                id: true,
                name: true,
                empCode: true,
                designation: true,
                collarType: true,
                department: { select: { id: true, name: true } },
            },
            orderBy: [{ department: { name: "asc" } }, { name: "asc" }],
            // Slightly higher cap when browsing a single dept so the BM sees
            // the full list, not a truncated slice.
            take: departmentId ? 200 : 50,
        });

        // Look up active-quarter HOD assignments for the matched candidates
        // so each row knows whether the person is already HOD (and of which
        // department). Empty list → no lookup needed.
        let currentHodByUser = new Map();
        if (candidates.length > 0) {
            const quarter = await prisma.quarter.findFirst({
                where: { status: "ACTIVE" },
                select: { id: true },
            });
            if (quarter) {
                const ids = candidates.map((c) => c.id);
                const rows = await prisma.hodAssignment.findMany({
                    where: { hodUserId: { in: ids }, branchId, quarterId: quarter.id },
                    select: {
                        hodUserId: true,
                        department: { select: { id: true, name: true } },
                    },
                });
                for (const r of rows) {
                    if (!currentHodByUser.has(r.hodUserId)) currentHodByUser.set(r.hodUserId, []);
                    currentHodByUser.get(r.hodUserId).push({ id: r.department?.id, name: r.department?.name });
                }
            }
        }

        return ok({
            candidates: candidates.map(c => ({
                id: c.id,
                name: c.name,
                empCode: c.empCode,
                designation: c.designation || "",
                departmentId: c.department?.id,
                departmentName: c.department?.name,
                effectiveCollar: c.collarType || null,
                // Empty array when not currently HOD — keeps the field
                // shape stable for the dashboard.
                currentHodDepartments: currentHodByUser.get(c.id) || [],
            })),
            total: candidates.length,
        });
    } catch (err) {
        console.error("[HOD-SEARCH] Error:", err.message);
        return serverError();
    }
});
