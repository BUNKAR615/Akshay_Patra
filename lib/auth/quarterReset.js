import prisma from "../prisma";

/**
 * Reset HOD operational state at the end of a quarter — WITHOUT destroying
 * the per-quarter HOD assignment history.
 *
 * Spec (Project requirements §4 "Quarterly reset"):
 *   - At the start of every new quarter, the full evaluation starts again.
 *   - Old-quarter HOD access must stop immediately when the new quarter starts.
 *   - Previous HOD assignments are de-activated, but their historical records
 *     are preserved so that archived quarter views remain queryable.
 *
 * This function is used by:
 *   - app/api/admin/quarters/close/route.js  (clean up the quarter being closed)
 *   - app/api/admin/quarters/start/route.js  (defensive sweep across closed
 *     quarters whose live-state cleanup may have failed previously).
 *
 * What it does (idempotent):
 *   1. Removes DepartmentRoleMapping rows with role="HOD" for users who have
 *      NO remaining HodAssignment in an ACTIVE quarter.
 *   2. Clears `passwordHod` for the same set (secondary HOD login is closed).
 *   3. Reverts `role: "HOD"` → "EMPLOYEE" for the same set (a user who is
 *      still BM / CM / HR / Committee / Admin keeps that primary role).
 *
 * What it explicitly does NOT do (preservation rules):
 *   - Does NOT delete HodAssignment or EmployeeHodAssignment rows. These
 *     rows are quarter-scoped via `quarterId` and constitute the archive
 *     record of "who was HOD where during which quarter". Deleting them
 *     erases the past-quarter HOD↔department / HOD↔employee history that
 *     the archive view must show.
 *   - Does NOT touch evaluation tables (HodEvaluation, BranchShortlistStage2,
 *     ClusterManagerEvaluation, etc.).
 *   - Does NOT delete the Quarter row.
 *
 * @param {string|string[]} quarterIds — the quarter(s) being closed/swept.
 * @returns {Promise<{
 *   removedHodAssignments: number,                    // always 0 (kept for caller compat)
 *   removedEmployeeHodAssignments: number,            // always 0 (kept for caller compat)
 *   releasedEmployeeIds: string[],                    // emp ids whose HodAssignment row no longer applies to an active quarter
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

    // ── Snapshot the per-quarter HOD assignment rows BEFORE any state change.
    //    These rows are NOT deleted (they are the archived history); we only
    //    need their user / department ids to figure out whose live HOD
    //    plumbing to deactivate below.
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

    // ── For every user with a HodAssignment in the quarter(s) being closed,
    //    decide whether to strip their live HOD plumbing entirely. The rule:
    //    if they have NO HodAssignment in an ACTIVE quarter, demote them.
    //    Past-quarter HodAssignment rows are preserved as archive history.
    let removedDepartmentRoleMappings = 0;
    const demotedUserIds = [];
    let passwordHodClearedCount = 0;

    if (affectedHodUserIds.length > 0) {
        // "Still HOD anywhere live" = has at least one HodAssignment whose
        // quarter is ACTIVE. Past (CLOSED) quarter assignments don't count.
        const remaining = await prisma.hodAssignment.groupBy({
            by: ["hodUserId"],
            where: {
                hodUserId: { in: affectedHodUserIds },
                quarter: { status: "ACTIVE" },
            },
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
        // HodAssignment / EmployeeHodAssignment rows are intentionally preserved
        // as archive history; counts remain in the response shape for caller
        // compatibility but are always 0.
        removedHodAssignments: 0,
        removedEmployeeHodAssignments: 0,
        releasedEmployeeIds,
        removedDepartmentRoleMappings,
        demotedUserIds,
        passwordHodClearedCount,
    };
}

export default resetHodStateForQuarters;
