import prisma from "../prisma";

/**
 * Reset HOD state at the end of a quarter.
 *
 * Spec (Project requirements §4 "Quarterly reset"):
 *   - At the start of every new quarter, the full evaluation starts again.
 *   - Previous HOD assignments should be removed automatically.
 *   - When old HODs are removed automatically, their assigned blue-collar
 *     employees must go back to the Branch Manager immediately.
 *   - Do not leave old HOD mappings active after quarter reset.
 *   - Old-quarter HOD access must stop immediately when the new quarter starts.
 *
 * This function is used by:
 *   - app/api/admin/quarters/close/route.js  (clean up the quarter being closed)
 *   - app/api/admin/quarters/start/route.js  (defensive sweep — catches data
 *     from quarters that were closed before this fix landed, e.g. Rishpal's
 *     legacy Q02-2026 HodAssignment).
 *
 * What it removes (atomic transaction):
 *   1. HodAssignment rows for the specified quarter(s).
 *   2. EmployeeHodAssignment rows for the specified quarter(s) — blue-collar
 *      employees become orphaned, which the BM shortlist endpoint already
 *      picks up automatically (see app/api/branch-manager/shortlist/route.js).
 *   3. DepartmentRoleMapping rows with role="HOD" for users who no longer
 *      have ANY active-quarter HodAssignment after the deletes above.
 *
 * What it does to the User table:
 *   - Clears `passwordHod` for users who have NO active HodAssignment
 *     remaining anywhere (so the secondary HOD login is disabled).
 *   - Reverts `role: "HOD"` → "EMPLOYEE" for the same set of users (a user
 *     who is still BM/CM/HR/Committee/Admin keeps that primary role
 *     untouched — only the legacy "promoted to HOD" employees are reverted).
 *
 * What it does NOT do:
 *   - Touch evaluation tables (HodEvaluation, BranchShortlistStage2,
 *     ClusterManagerEvaluation, etc.). Those are historical and must remain
 *     for reporting / audit.
 *   - Delete the Quarter row.
 *
 * @param {string|string[]} quarterIds — the quarter(s) whose HOD state to wipe.
 * @returns {Promise<{
 *   removedHodAssignments: number,
 *   removedEmployeeHodAssignments: number,
 *   releasedEmployeeIds: string[],
 *   removedDepartmentRoleMappings: number,
 *   demotedUserIds: string[],
 *   passwordHodClearedCount: number,
 * }>}
 */
export async function resetHodStateForQuarters(quarterIds) {
    const idsArray = Array.isArray(quarterIds) ? quarterIds : [quarterIds];
    const ids = idsArray.filter((x) => typeof x === "string" && x.length > 0);
    if (ids.length === 0) {
        return {
            removedHodAssignments: 0,
            removedEmployeeHodAssignments: 0,
            releasedEmployeeIds: [],
            removedDepartmentRoleMappings: 0,
            demotedUserIds: [],
            passwordHodClearedCount: 0,
        };
    }

    // ── Snapshot first: we need the user-id set and the released-employee
    //    set BEFORE the deletes, so the demote / passwordHod step below
    //    can target the right users.
    const hodAssignmentSnap = await prisma.hodAssignment.findMany({
        where: { quarterId: { in: ids } },
        select: { hodUserId: true, departmentId: true },
    });
    const empHodSnap = await prisma.employeeHodAssignment.findMany({
        where: { quarterId: { in: ids } },
        select: { employeeId: true },
    });
    const affectedHodUserIds = Array.from(new Set(hodAssignmentSnap.map((r) => r.hodUserId)));
    const affectedDeptIds = Array.from(new Set(hodAssignmentSnap.map((r) => r.departmentId).filter(Boolean)));
    const releasedEmployeeIds = Array.from(new Set(empHodSnap.map((r) => r.employeeId)));

    // ── Wipe HOD assignment rows for the closed quarter(s).
    const [empDel, hodDel] = await prisma.$transaction([
        prisma.employeeHodAssignment.deleteMany({ where: { quarterId: { in: ids } } }),
        prisma.hodAssignment.deleteMany({ where: { quarterId: { in: ids } } }),
    ]);

    // ── For every user that LOST a HodAssignment above, decide whether to
    //    strip their HOD plumbing entirely (no other active-quarter HOD
    //    assignment remaining) or leave it (they're still HOD elsewhere in
    //    an ACTIVE quarter, which can happen during the defensive sweep at
    //    quarter start if multiple quarters were closed but not cleaned).
    let removedDepartmentRoleMappings = 0;
    const demotedUserIds = [];
    let passwordHodClearedCount = 0;

    if (affectedHodUserIds.length > 0) {
        // Users with NO remaining HodAssignment (in any quarter) — those are
        // the ones to fully demote.
        const remaining = await prisma.hodAssignment.groupBy({
            by: ["hodUserId"],
            where: { hodUserId: { in: affectedHodUserIds } },
            _count: { _all: true },
        });
        const stillHodIds = new Set(remaining.map((r) => r.hodUserId));
        const fullyDemotedIds = affectedHodUserIds.filter((id) => !stillHodIds.has(id));

        if (fullyDemotedIds.length > 0) {
            // Remove ONLY the DepartmentRoleMapping rows that correspond to
            // the affected departments — we never want to touch other role
            // mappings (CM / HR / Committee / etc.).
            if (affectedDeptIds.length > 0) {
                const drm = await prisma.departmentRoleMapping.deleteMany({
                    where: {
                        userId: { in: fullyDemotedIds },
                        role: "HOD",
                        departmentId: { in: affectedDeptIds },
                    },
                });
                removedDepartmentRoleMappings = drm.count;
            }

            // Clear passwordHod so the secondary HOD login path is closed
            // immediately. Only touch users currently flagged with role=HOD
            // or with passwordHod set — never an Admin/BM/CM/HR/Committee
            // primary password.
            const cleared = await prisma.user.updateMany({
                where: { id: { in: fullyDemotedIds }, passwordHod: { not: null } },
                data: { passwordHod: null },
            });
            passwordHodClearedCount = cleared.count;

            // Revert role: "HOD" → "EMPLOYEE". We deliberately do NOT touch
            // ADMIN / BRANCH_MANAGER / CLUSTER_MANAGER / HR / COMMITTEE
            // users — they only acted as HOD as a secondary role, their
            // primary role stays.
            const demoted = await prisma.user.updateMany({
                where: { id: { in: fullyDemotedIds }, role: "HOD" },
                data: { role: "EMPLOYEE" },
            });
            if (demoted.count > 0) {
                // updateMany doesn't return affected rows — but the set of
                // ids we passed in is the upper bound; refetch to know
                // exactly which ones flipped. Cheap because count is small.
                const after = await prisma.user.findMany({
                    where: { id: { in: fullyDemotedIds }, role: "EMPLOYEE" },
                    select: { id: true },
                });
                for (const u of after) demotedUserIds.push(u.id);
            }
        }
    }

    return {
        removedHodAssignments: hodDel.count,
        removedEmployeeHodAssignments: empDel.count,
        releasedEmployeeIds,
        removedDepartmentRoleMappings,
        demotedUserIds,
        passwordHodClearedCount,
    };
}

export default resetHodStateForQuarters;
