// ════════════════════════════════════════════════════════════════════════
//  Employee-sheet ordering — single source of truth for the order a branch
//  employee sheet is presented in (spec rule 7).
//
//  Every branch employee sheet begins with its role-holders, in this order:
//    1. Branch Manager
//    2. Cluster Manager
//    3. HR Personnel
//    4. Committee Members
//  followed by HODs, then all regular employees. Within one rank, rows are
//  ordered by name.
//
//  Kept pure (no DB / no Prisma) so it can be reused by every surface that
//  renders an employee sheet — the branch employee list, exports and reports —
//  and unit-tested in isolation.
// ════════════════════════════════════════════════════════════════════════

const SHEET_ROLE_RANK = {
    BRANCH_MANAGER: 0,
    CLUSTER_MANAGER: 1,
    HR: 2,
    COMMITTEE: 3,
    HOD: 4,
};

// EMPLOYEE / SUPERVISOR / ADMIN / anything else → regular-employee tier.
const DEFAULT_RANK = 5;

/**
 * Rank a row by the MOST senior role it wears (lower = nearer the top).
 * Accepts a single role string or an array of roles (e.g. `displayRoles` in a
 * given branch). A row that holds several roles sorts by its most senior one.
 *
 * @param {string|string[]} roles
 * @returns {number}
 */
export function sheetRoleRank(roles) {
    const list = Array.isArray(roles) ? roles : [roles];
    let best = DEFAULT_RANK;
    for (const r of list) {
        const rank = SHEET_ROLE_RANK[r];
        if (rank !== undefined && rank < best) best = rank;
    }
    return best;
}

/**
 * Array.sort comparator for employee-sheet rows. Prefers each row's
 * branch-relative `displayRoles` (what the person is shown as in THIS branch);
 * falls back to the base `role` when no display roles were computed. Ties break
 * on name (locale-aware, ascending).
 *
 * @param {{ displayRoles?: string[], role?: string, name?: string }} a
 * @param {{ displayRoles?: string[], role?: string, name?: string }} b
 * @returns {number}
 */
export function compareForSheet(a, b) {
    const ra = sheetRoleRank(a?.displayRoles?.length ? a.displayRoles : a?.role);
    const rb = sheetRoleRank(b?.displayRoles?.length ? b.displayRoles : b?.role);
    if (ra !== rb) return ra - rb;
    return String(a?.name || "").localeCompare(String(b?.name || ""));
}

export default compareForSheet;
