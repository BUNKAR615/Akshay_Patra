import prisma from "../prisma";
import { resolveAllScopeBranches } from "./resolveScopeBranch.js";

/**
 * loginRoles — shared helpers for the two-stage login flow.
 *
 * A single account can legitimately act as more than one role:
 *   - An evaluator (Branch Manager / Cluster Manager / HR) who has ALSO been
 *     elected to the Committee. The evaluator assignment and the committee
 *     assignment coexist (see the committee-assign route), so at login the
 *     user picks which hat to wear via the "Continue as …" screen.
 *   - The legacy Admin + HOD pairing (an ADMIN with an active HOD assignment).
 *
 * `computeOfferedRoles` decides whether the picker is shown; `resolveRoleScope`
 * builds the branch/department scope embedded in the JWT for the chosen role.
 * Both /api/auth/login (single-role + first stage) and /api/auth/select-role
 * (stage two) use these so a picked role yields a token identical to a direct
 * single-role login.
 */

const PURE_EVALUATOR_ROLES = new Set([
    "BRANCH_MANAGER",
    "CLUSTER_MANAGER",
    "HR",
    "COMMITTEE",
]);

/**
 * Given the role a user authenticated as (`resolvedRole`, derived from the
 * password they supplied), return the deduped, ordered list of roles they may
 * act as this session. A list of length > 1 makes the login page render the
 * "Continue as …" picker; length 1 logs them straight in.
 *
 * The assignment tables are the single source of truth — committee/evaluator
 * membership is detected there regardless of the stored `User.role`.
 *
 * Employee-primary logins never get an elevated picker: a normal employee, or a
 * HOD / dual-login-staff member who signed in with their *empCode* password,
 * resolves to "EMPLOYEE" and we return just that. The elevated roles are only
 * unlocked by the staff-format ("Firstname_##") password.
 *
 * @param {{ id: string, passwordHod?: string|null }} user
 * @param {string} resolvedRole
 * @returns {Promise<string[]>}
 */
export async function computeOfferedRoles(user, resolvedRole) {
    if (resolvedRole === "EMPLOYEE") return ["EMPLOYEE"];

    const offered = [resolvedRole];
    const add = (r) => { if (r && !offered.includes(r)) offered.push(r); };

    if (resolvedRole === "COMMITTEE") {
        // A committee member who ALSO holds an evaluator assignment.
        const [bm, cm, hr] = await Promise.all([
            prisma.branchManagerAssignment.findUnique({ where: { bmUserId: user.id }, select: { id: true } }),
            prisma.clusterManagerBranchAssignment.findFirst({ where: { cmUserId: user.id }, select: { id: true } }),
            prisma.hrBranchAssignment.findFirst({ where: { hrUserId: user.id }, select: { id: true } }),
        ]);
        if (bm) add("BRANCH_MANAGER");
        if (cm) add("CLUSTER_MANAGER");
        if (hr) add("HR");
    } else {
        // An evaluator (or admin) who is ALSO a committee member.
        const committee = await prisma.committeeBranchAssignment.findFirst({
            where: { memberUserId: user.id }, select: { id: true },
        });
        if (committee) add("COMMITTEE");
    }

    // Legacy Admin + HOD picker: an ADMIN with an active HOD assignment. Gated
    // on passwordHod existing (both passwords resolve to "Firstname_##").
    if (resolvedRole === "ADMIN" && user.passwordHod) {
        const hod = await prisma.hodAssignment.findFirst({
            where: { hodUserId: user.id, quarter: { status: "ACTIVE" } },
            select: { id: true },
        });
        if (hod) add("HOD");
    }

    return offered;
}

/**
 * Resolve the branch + department scope to embed in the JWT for `role`,
 * role-aware and assignment-table-authoritative.
 *
 * @param {string} userId
 * @param {string} role
 * @param {{ departmentId?: string|null, department?: { branchId?: string|null, branch?: { id: string, name: string, branchType: string }|null }|null }} user
 * @returns {Promise<{ branchId: string, branchType: string, branchName: string, departmentIds: string[] } | { error: string }>}
 */
export async function resolveRoleScope(userId, role, user) {
    let branchId = "";
    let branchType = user?.department?.branch?.branchType || "";
    let branchName = user?.department?.branch?.name || "";
    const departmentIds = (user?.departmentId && !PURE_EVALUATOR_ROLES.has(role)) ? [user.departmentId] : [];

    if (role === "BRANCH_MANAGER") {
        // BM is one-per-user; resolveAllScopeBranches returns their single
        // branch (empty if somehow unassigned — left blank, not an error, to
        // match the historical login behaviour).
        const [bm] = await resolveAllScopeBranches({ userId, role });
        if (bm) {
            branchId = bm.id;
            branchType = bm.branchType;
            branchName = bm.name;
        }
    } else if (role === "CLUSTER_MANAGER" || role === "HR" || role === "COMMITTEE") {
        // Multi-branch staff — the JWT carries the first assignment (stable
        // assignedAt-asc order); the dashboard then drives the in-page
        // Total / per-branch filter.
        const branches = await resolveAllScopeBranches({ userId, role });
        if (branches.length === 0) {
            return { error: "No branch assignment found for this account. Please contact your administrator." };
        }
        branchId = branches[0].id;
        branchType = branches[0].branchType || branchType;
        branchName = branches[0].name || branchName;
    } else if (role === "HOD") {
        // HOD's branch + departments come from their active-quarter
        // HodAssignment rows (all in the same branch).
        const hodAssignments = await prisma.hodAssignment.findMany({
            where: { hodUserId: userId, quarter: { status: "ACTIVE" } },
            select: {
                departmentId: true,
                branch: { select: { id: true, name: true, branchType: true } },
            },
        });
        for (const a of hodAssignments) {
            if (!branchId && a.branch) {
                branchId = a.branch.id;
                branchType = a.branch.branchType;
                branchName = a.branch.name;
            }
            if (!departmentIds.includes(a.departmentId)) departmentIds.push(a.departmentId);
        }
        if (!branchId) branchId = user?.department?.branchId || "";
    } else {
        // EMPLOYEE / ADMIN — department's branch (ADMIN usually has none).
        branchId = user?.department?.branchId || "";
    }

    return { branchId, branchType, branchName, departmentIds };
}
