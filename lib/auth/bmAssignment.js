import prisma from "../prisma";

/**
 * bmAssignment — single source of truth for Branch Manager assignments.
 *
 * Rules enforced (also enforced at the DB level by unique indexes on
 * BranchManagerAssignment.bmUserId and BranchManagerAssignment.branchId):
 *   1. A user can be Branch Manager in only ONE branch.
 *   2. A branch can have only ONE Branch Manager.
 *
 * Spec error messages (must be returned verbatim):
 *   - "This branch already has a Branch Manager assigned."
 *   - "This user is already assigned as Branch Manager in another branch."
 */

export const BM_ERR_BRANCH_TAKEN = "This branch already has a Branch Manager assigned.";
export const BM_ERR_USER_TAKEN = "This user is already assigned as Branch Manager in another branch.";

/**
 * Returns the current BM assignment for a branch, or null.
 * Includes the BM user's basic profile.
 */
export async function getBmForBranch(branchId) {
    if (!branchId) return null;
    return prisma.branchManagerAssignment.findUnique({
        where: { branchId },
        include: {
            bm: { select: { id: true, empCode: true, name: true, mobile: true, role: true } },
        },
    });
}

/**
 * Returns the branch this user is currently assigned to as BM, or null.
 */
export async function getBranchForBm(userId) {
    if (!userId) return null;
    return prisma.branchManagerAssignment.findUnique({
        where: { bmUserId: userId },
        include: {
            branch: { select: { id: true, name: true, slug: true } },
        },
    });
}

/**
 * Validates whether `userId` can be assigned as Branch Manager of `branchId`.
 * Returns:
 *   { ok: true } — caller may proceed (may be a fresh assignment or a no-op
 *                  re-save of the same (user, branch) pair that already exists).
 *   { ok: false, message, code } — caller must reject with the message text.
 *
 * Idempotency: re-saving the SAME user against the SAME branch is treated as
 * `ok: true` so the caller can upsert without surfacing a spurious 409.
 */
export async function assertBmAssignable(userId, branchId) {
    if (!userId) return { ok: false, message: "userId is required", code: "MISSING_USER" };
    if (!branchId) return { ok: false, message: "branchId is required", code: "MISSING_BRANCH" };

    const [byBranch, byUser] = await Promise.all([
        prisma.branchManagerAssignment.findUnique({ where: { branchId } }),
        prisma.branchManagerAssignment.findUnique({ where: { bmUserId: userId } }),
    ]);

    // Branch already has a different BM
    if (byBranch && byBranch.bmUserId !== userId) {
        return { ok: false, message: BM_ERR_BRANCH_TAKEN, code: "BRANCH_TAKEN" };
    }

    // User is already BM in a different branch
    if (byUser && byUser.branchId !== branchId) {
        return { ok: false, message: BM_ERR_USER_TAKEN, code: "USER_TAKEN" };
    }

    return { ok: true };
}

/**
 * Internal: write the BM assignment row + sync legacy fields atomically.
 * Caller must have already passed `assertBmAssignable`.
 *
 * Side-effects (kept in lockstep so legacy dashboards keep working):
 *   - upserts BranchManagerAssignment(branchId)
 *   - sets User.role = "BRANCH_MANAGER" and User.branchId = branchId
 *   - if the user has a departmentId, syncs Department.branchManagerId
 *     and ensures a DepartmentRoleMapping(role=BRANCH_MANAGER) exists
 *
 * Returns the created/updated BranchManagerAssignment row with the BM user
 * profile attached.
 */
export async function applyBmAssignment(tx, { userId, branchId, assignedBy }) {
    const assignment = await tx.branchManagerAssignment.upsert({
        where: { branchId },
        update: { bmUserId: userId, assignedBy, assignedAt: new Date() },
        create: { bmUserId: userId, branchId, assignedBy },
        include: {
            bm: { select: { id: true, empCode: true, name: true, mobile: true, role: true } },
        },
    });

    // Sync the user's role + branchId so existing role-based UI / withRole stay correct.
    const user = await tx.user.update({
        where: { id: userId },
        data: { role: "BRANCH_MANAGER", branchId },
        select: { id: true, departmentId: true },
    });

    // If the BM has a departmentId, also keep the legacy department-level cache aligned.
    if (user.departmentId) {
        const dept = await tx.department.findUnique({
            where: { id: user.departmentId },
            select: { id: true, branchId: true, branchManagerId: true },
        });
        // Only touch the cache if the department actually belongs to this branch.
        if (dept && dept.branchId === branchId) {
            if (dept.branchManagerId !== userId) {
                await tx.department.update({
                    where: { id: dept.id },
                    data: { branchManagerId: userId },
                });
            }
            // Ensure DepartmentRoleMapping exists
            await tx.departmentRoleMapping.upsert({
                where: {
                    userId_departmentId_role: {
                        userId,
                        departmentId: dept.id,
                        role: "BRANCH_MANAGER",
                    },
                },
                update: {},
                create: { userId, departmentId: dept.id, role: "BRANCH_MANAGER" },
            });
        }
    }

    return assignment;
}

/**
 * Internal: remove the BM assignment + clear legacy fields.
 * Returns true if a row was removed, false if there was nothing to remove.
 */
export async function clearBmAssignment(tx, { branchId }) {
    const existing = await tx.branchManagerAssignment.findUnique({
        where: { branchId },
    });
    if (!existing) return false;

    const userId = existing.bmUserId;

    await tx.branchManagerAssignment.delete({ where: { branchId } });

    // Demote the user back to EMPLOYEE so withRole(["BRANCH_MANAGER"]) stops admitting them.
    await tx.user.update({
        where: { id: userId },
        data: { role: "EMPLOYEE" },
    });

    // Clear legacy department cache for any department in this branch where
    // this user is recorded as BM.
    await tx.department.updateMany({
        where: { branchId, branchManagerId: userId },
        data: { branchManagerId: null },
    });

    // Drop legacy DepartmentRoleMapping rows that flagged this user as BM.
    await tx.departmentRoleMapping.deleteMany({
        where: { userId, role: "BRANCH_MANAGER" },
    });

    return true;
}
