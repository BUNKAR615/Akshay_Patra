import prisma from "../prisma";

/**
 * roleAssignmentRules — shared governance checks for the Organizational
 * Structure roles (Branch Manager, Cluster Manager, HR Personnel, Committee).
 *
 * These are used by the four /api/admin/branches/[branchId]/{bm,cm,hr,
 * committee}-assign routes. The per-role uniqueness rules already enforced
 * elsewhere are NOT duplicated here:
 *   - BM: one-per-branch + one-branch-per-user  → lib/auth/bmAssignment.js
 *   - CM: one-per-branch                        → cm-assign route (inline)
 *
 * This module adds the cross-role and capacity rules:
 *   - Rule A: a person may actively hold only ONE evaluator role (BM/CM/HR).
 *             COMMITTEE is excluded — it may coexist with an evaluator role.
 *   - Rule D: a branch may have at most 3 HR personnel.
 *   - Rule E: the committee may have at most 3 members (global).
 */

const ROLE_LABELS = {
    BRANCH_MANAGER: "Branch Manager",
    CLUSTER_MANAGER: "Cluster Manager",
    HR: "HR Personnel",
    COMMITTEE: "Committee member",
};

const MAX_HR_PER_BRANCH = 1;
const MAX_COMMITTEE_MEMBERS = 3;

/**
 * Rule A — one active EVALUATOR role at a time (BM / CM / HR).
 *
 * Rejects assigning `userId` to `targetRole` when the user already holds a
 * *different* BM/CM/HR assignment. Holding the same role on another branch
 * (CM/HR are legitimately multi-branch) is allowed.
 *
 * COMMITTEE is intentionally EXCLUDED from this mutual-exclusion check:
 * committee membership is allowed to coexist with an evaluator role, so a
 * person can be (e.g.) both Cluster Manager and Committee member and pick which
 * to act as at login. The committee-assign route preserves the evaluator role
 * when electing a role-holder; this rule lets the reverse (assigning an
 * evaluator role to a sitting committee member) work too.
 *
 * @param {string} userId
 * @param {"BRANCH_MANAGER"|"CLUSTER_MANAGER"|"HR"|"COMMITTEE"} targetRole
 * @returns {Promise<{ok: true} | {ok: false, message: string}>}
 */
export async function assertSingleActiveRole(userId, targetRole) {
    if (!userId) return { ok: false, message: "userId is required" };

    const [bm, cm, hr] = await Promise.all([
        prisma.branchManagerAssignment.findUnique({ where: { bmUserId: userId }, select: { id: true } }),
        prisma.clusterManagerBranchAssignment.findFirst({ where: { cmUserId: userId }, select: { id: true } }),
        prisma.hrBranchAssignment.findFirst({ where: { hrUserId: userId }, select: { id: true } }),
    ]);

    const held = [];
    if (bm) held.push("BRANCH_MANAGER");
    if (cm) held.push("CLUSTER_MANAGER");
    if (hr) held.push("HR");

    const conflicting = held.find((r) => r !== targetRole);
    if (conflicting) {
        return {
            ok: false,
            message: `This person is already assigned as ${ROLE_LABELS[conflicting]} and cannot also be a ${ROLE_LABELS[targetRole]}. Remove the existing ${ROLE_LABELS[conflicting]} role first.`,
        };
    }
    return { ok: true };
}

/**
 * Rule D — a branch may have at most 3 HR personnel.
 *
 * Re-assigning an HR who already serves this branch is a no-op and always
 * allowed (so the upsert stays idempotent).
 *
 * @param {string} branchId
 * @param {string} hrUserId
 * @returns {Promise<{ok: true} | {ok: false, message: string}>}
 */
export async function assertHrCapacity(branchId, hrUserId) {
    const rows = await prisma.hrBranchAssignment.findMany({
        where: { branchId },
        select: { hrUserId: true },
    });
    const distinct = new Set(rows.map((r) => r.hrUserId));
    if (distinct.has(hrUserId)) return { ok: true };
    if (distinct.size >= MAX_HR_PER_BRANCH) {
        return {
            ok: false,
            message: `This branch already has the maximum of ${MAX_HR_PER_BRANCH} HR personnel. Remove one before adding another.`,
        };
    }
    return { ok: true };
}

/**
 * Committee eligibility — any existing employee may join the committee.
 *
 * Per the Organizational-Structure spec, committee members can be chosen from
 * the current employee list (or added manually). A normal employee is therefore
 * eligible; the only check left here is that the user actually exists. The
 * single gate that still applies is the 3-member capacity (see
 * assertCommitteeCapacity).
 *
 * @param {string} userId
 * @returns {Promise<{ok: true} | {ok: false, message: string}>}
 */
export async function assertCommitteeEligible(userId) {
    if (!userId) return { ok: false, message: "userId is required" };

    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true },
    });
    if (!user) return { ok: false, message: "User not found" };

    return { ok: true };
}

/**
 * Rule E — the committee may have at most 3 members (counted globally,
 * because the committee is the same across all branches).
 *
 * Re-assigning an existing committee member is a no-op and always allowed.
 *
 * @param {string} memberUserId
 * @returns {Promise<{ok: true} | {ok: false, message: string}>}
 */
export async function assertCommitteeCapacity(memberUserId) {
    const rows = await prisma.committeeBranchAssignment.findMany({
        select: { memberUserId: true },
    });
    const distinct = new Set(rows.map((r) => r.memberUserId));
    if (distinct.has(memberUserId)) return { ok: true };
    if (distinct.size >= MAX_COMMITTEE_MEMBERS) {
        return {
            ok: false,
            message: `The committee already has the maximum of ${MAX_COMMITTEE_MEMBERS} members. Remove one before adding another.`,
        };
    }
    return { ok: true };
}
