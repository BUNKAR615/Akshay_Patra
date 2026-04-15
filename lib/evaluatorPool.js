/**
 * Evaluator pool helpers — resolves the full set of evaluators assigned to
 * a department for a given role, and detects when every (evaluator, employee)
 * pair has submitted their evaluation. Used to safely trigger the next
 * shortlist stage when 2+ evaluators are mapped to the same department
 * (otherwise each finishing evaluator would overwrite the prior's shortlist).
 */

/**
 * Returns the unique userIds of every evaluator assigned to `departmentId`
 * under `role`. Combines DepartmentRoleMapping with primary-dept users so
 * supervisors/branch-managers that still live only on user.departmentId/role
 * are counted. Pure role-only users (no dept) are ignored.
 */
export async function getEvaluatorPool(tx, departmentId, role) {
    const mapped = await tx.departmentRoleMapping.findMany({
        where: { departmentId, role },
        select: { userId: true },
    });
    const ids = new Set(mapped.map((m) => m.userId));

    // Legacy path: primary departmentId + primary role holders also evaluate.
    // Only meaningful for BRANCH_MANAGER users still linked directly to a department
    // (BM/CM should normally live in DRM).
    if (role === "BRANCH_MANAGER") {
        const primaries = await tx.user.findMany({
            where: { departmentId, role },
            select: { id: true },
        });
        primaries.forEach((u) => ids.add(u.id));
    }

    return [...ids];
}
