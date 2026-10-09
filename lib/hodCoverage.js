/**
 * Single source of truth for which BIG-branch blue-collar employees belong to
 * an HOD (rather than the Branch Manager) in Stage 2.
 *
 * An employee is HOD-covered for a quarter when EITHER:
 *   - the BM attached them to an HOD (EmployeeHodAssignment), or
 *   - an HOD has already submitted their Stage 2 evaluation. A finished HOD
 *     evaluation never falls back to the BM queue, even if the link is later
 *     removed — otherwise the BM page would show "pending" for an employee the
 *     admin pipeline already counts as evaluated.
 *
 * There is deliberately NO department-level fallback (HodAssignment on the
 * employee's department). That implicit grant let an HOD evaluate a whole
 * department while the BM dashboard showed the HOD with nobody assigned.
 *
 * @returns {Promise<Map<string, string>>} employeeId → hodUserId
 */
export async function loadHodCoverage(db, { quarterId, branchIds }) {
    if (!branchIds || branchIds.length === 0) return new Map();
    const inBranches = { department: { branchId: { in: branchIds } } };
    const [links, evals] = await Promise.all([
        db.employeeHodAssignment.findMany({
            where: { quarterId, employee: inBranches },
            select: { employeeId: true, hodUserId: true },
        }),
        db.hodEvaluation.findMany({
            where: { quarterId, employee: inBranches },
            select: { employeeId: true, hodId: true },
        }),
    ]);
    const coverage = new Map();
    for (const l of links) coverage.set(l.employeeId, l.hodUserId);
    // The HOD who actually evaluated wins over a later re-link.
    for (const e of evals) coverage.set(e.employeeId, e.hodId);
    return coverage;
}
