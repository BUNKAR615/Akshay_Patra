import prisma from "../prisma";

/**
 * Resolve the branch scope for a role-scoped user (BM/CM/HR/COMMITTEE).
 *
 * The JWT branchId is the source of truth — it was either auto-set by the
 * login route (when the user has a single branch assignment) or chosen by
 * the user via the multi-branch picker (`/api/auth/select-branch`).
 *
 * For multi-branch staff (CM/HR/COMMITTEE), we VERIFY the JWT branchId
 * actually belongs to that user's assignment table. This protects against
 * stale JWTs and forged claims — if the assignment was removed mid-session,
 * the request 403s instead of silently leaking another branch's data.
 *
 * @param {{ userId: string, role: string, branchId?: string }} user
 *        — the context object exposed by withRole().
 * @returns {Promise<{ branchId: string, branch: { id: string, name: string, branchType: string } | null }>}
 */
export async function resolveScopeBranch(user) {
    if (!user?.userId) return { branchId: "", branch: null };

    const role = user.role;

    if (role === "BRANCH_MANAGER") {
        // BM is one-per-user: derive from the assignment table directly.
        const row = await prisma.branchManagerAssignment.findUnique({
            where: { bmUserId: user.userId },
            select: { branch: { select: { id: true, name: true, branchType: true } } },
        });
        if (!row?.branch) return { branchId: "", branch: null };
        return { branchId: row.branch.id, branch: row.branch };
    }

    if (role === "CLUSTER_MANAGER" || role === "HR" || role === "COMMITTEE") {
        // Multi-branch roles: trust the JWT branchId only if it's actually
        // listed in the user's assignment table. No "first / most recent"
        // fallback — that was the source of the branch-leak bug.
        if (!user.branchId) return { branchId: "", branch: null };

        let row = null;
        if (role === "CLUSTER_MANAGER") {
            row = await prisma.clusterManagerBranchAssignment.findUnique({
                where: { cmUserId_branchId: { cmUserId: user.userId, branchId: user.branchId } },
                select: { branch: { select: { id: true, name: true, branchType: true } } },
            });
        } else if (role === "HR") {
            row = await prisma.hrBranchAssignment.findUnique({
                where: { hrUserId_branchId: { hrUserId: user.userId, branchId: user.branchId } },
                select: { branch: { select: { id: true, name: true, branchType: true } } },
            });
        } else if (role === "COMMITTEE") {
            row = await prisma.committeeBranchAssignment.findUnique({
                where: { memberUserId_branchId: { memberUserId: user.userId, branchId: user.branchId } },
                select: { branch: { select: { id: true, name: true, branchType: true } } },
            });
        }
        if (!row?.branch) return { branchId: "", branch: null };
        return { branchId: row.branch.id, branch: row.branch };
    }

    // Department-scoped roles (HOD/EMPLOYEE) — JWT branchId carries the
    // department's branch. Just confirm the branch exists.
    if (user.branchId) {
        const branch = await prisma.branch.findUnique({
            where: { id: user.branchId },
            select: { id: true, name: true, branchType: true },
        });
        if (branch) return { branchId: branch.id, branch };
    }
    return { branchId: "", branch: null };
}

/**
 * For multi-branch roles (CM/HR/Committee), return every branch the user is
 * assigned to. BMs only ever have one. Used by:
 *   - The branch picker at login.
 *   - `/api/auth/me` to tell the dashboard whether to show a "Switch branch" link.
 */
export async function resolveAllScopeBranches(user) {
    if (!user?.userId) return [];

    const role = user.role;
    if (role === "BRANCH_MANAGER") {
        const row = await prisma.branchManagerAssignment.findUnique({
            where: { bmUserId: user.userId },
            select: { branch: { select: { id: true, name: true, branchType: true } } },
        });
        return row?.branch ? [row.branch] : [];
    }
    if (role === "CLUSTER_MANAGER") {
        const rows = await prisma.clusterManagerBranchAssignment.findMany({
            where: { cmUserId: user.userId },
            select: { branch: { select: { id: true, name: true, branchType: true } } },
            orderBy: { assignedAt: "asc" },
        });
        return rows.map((r) => r.branch).filter(Boolean);
    }
    if (role === "HR") {
        const rows = await prisma.hrBranchAssignment.findMany({
            where: { hrUserId: user.userId },
            select: { branch: { select: { id: true, name: true, branchType: true } } },
            orderBy: { assignedAt: "asc" },
        });
        return rows.map((r) => r.branch).filter(Boolean);
    }
    if (role === "COMMITTEE") {
        const rows = await prisma.committeeBranchAssignment.findMany({
            where: { memberUserId: user.userId },
            select: { branch: { select: { id: true, name: true, branchType: true } } },
            orderBy: { assignedAt: "asc" },
        });
        return rows.map((r) => r.branch).filter(Boolean);
    }
    return [];
}

export default resolveScopeBranch;
