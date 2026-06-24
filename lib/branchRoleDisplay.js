// ════════════════════════════════════════════════════════════════════════
//  Branch-relative role display — single source of truth for how an employee
//  is presented inside ONE branch's employee list.
//
//  An employee always has exactly one ORIGINAL (home) branch — their
//  department's branch (or, for departmentless role-holders, their scoped
//  branch). A role-holder (BM / CM / HR / Committee / HOD) may additionally
//  serve OTHER branches via the assignment tables. The list therefore shows a
//  person differently depending on which branch you're looking at:
//
//    • In their HOME branch  → base employment role + every role they are
//                              assigned here (e.g. EMPLOYEE + CLUSTER_MANAGER).
//    • In ANOTHER branch     → only the role(s) they are assigned to here
//                              (e.g. CLUSTER_MANAGER). The branch field still
//                              shows their original/home branch.
//
//  Kept pure (no DB / no Prisma) so it can be unit-tested with sample cases
//  such as "Amit Keshwa" — see tests/branchRoleDisplay.test.ts.
// ════════════════════════════════════════════════════════════════════════

/**
 * @param {object} args
 * @param {string}  args.viewingBranchId - branch whose list is being rendered
 * @param {string}  args.baseRole        - User.role (base employment role)
 * @param {{id:string,name:string}|null} args.originalBranch - home branch ({id,name}) or null
 * @param {string[]} [args.assignedRoles] - roles this user holds IN the viewing branch
 * @returns {{ isHomeBranch: boolean, displayRoles: string[] }}
 */
export function resolveBranchDisplayRoles({ viewingBranchId, baseRole, originalBranch, assignedRoles = [] }) {
    const isHomeBranch = !!originalBranch && originalBranch.id === viewingBranchId;
    let displayRoles;
    if (isHomeBranch) {
        // Home branch: base employment first, then any role-holder hats worn here.
        displayRoles = [...new Set([baseRole, ...assignedRoles])];
    } else {
        // Visiting another branch only as a role-holder: show those role(s) only.
        // Fall back to the base role defensively if no assignment was supplied.
        displayRoles = assignedRoles.length ? [...new Set(assignedRoles)] : [baseRole];
    }
    return { isHomeBranch, displayRoles };
}
