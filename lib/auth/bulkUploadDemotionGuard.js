import prisma from "../prisma";

/**
 * Returns a list of conflict descriptors for any EMPLOYEE/HOD upload row
 * whose empCode is already a current role-holder (BM/CM/HR/Committee in
 * any branch).
 *
 * Why: a bulk re-upload of a branch's Excel must never silently demote a
 * promoted user back to EMPLOYEE/HOD. Without this guard, re-uploading
 * Jaipur's sheet that still lists Rajesh (now CM of Jodhpur) would clobber
 * his role and password.
 *
 * @param {{ empCode: string; rowNum: number }[]} rows  Combined empRows + hodRows.
 * @returns {Promise<{
 *   blocked: { empCode: string; name: string; role: string }[];
 *   offendingRows: string[]; // ["row 12 (1800012)", ...]
 * }>}
 */
export async function findRoleHolderConflicts(rows) {
    const empCodes = rows.map((r) => r.empCode);
    if (empCodes.length === 0) return { blocked: [], offendingRows: [] };

    const roleHoldingUsers = await prisma.user.findMany({
        where: {
            empCode: { in: empCodes },
            OR: [
                { role: { in: ["BRANCH_MANAGER", "CLUSTER_MANAGER", "HR", "COMMITTEE"] } },
                { bmAssignment: { isNot: null } },
                { cmBranchAssignments: { some: {} } },
                { hrBranchAssignments: { some: {} } },
                { committeeBranchAssignments: { some: {} } },
            ],
        },
        select: { empCode: true, name: true, role: true },
    });

    if (roleHoldingUsers.length === 0) return { blocked: [], offendingRows: [] };

    const blockedSet = new Set(roleHoldingUsers.map((u) => u.empCode));
    const offendingRows = rows
        .filter((r) => blockedSet.has(r.empCode))
        .map((r) => `row ${r.rowNum} (${r.empCode})`);

    return { blocked: roleHoldingUsers, offendingRows };
}

/**
 * Builds the human-readable conflict message for `conflict()` responses.
 */
export function buildRoleHolderConflictMessage(blocked, offendingRows) {
    const blockedStr = blocked.map((u) => `${u.empCode} (${u.name}, currently ${u.role})`).join(", ");
    return `Cannot demote current role-holders. The following users are already BM/CM/HR/Committee elsewhere and must be unassigned via Organizational Structure before they can appear in this branch's employee/HOD list: ${blockedStr}. Conflicting rows: ${offendingRows.join(", ")}.`;
}
