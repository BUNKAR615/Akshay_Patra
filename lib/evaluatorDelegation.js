import prisma from "./prisma";
import { resolveAllScopeBranches } from "./auth/resolveScopeBranch";

/**
 * Department-scoped evaluator delegation ("Power of Attorney" / POA).
 *
 * Resolution rule, applied independently for each evaluator type:
 *
 *     department POA for (employee's department, type)   — if configured
 *         ↓ otherwise
 *     branch default (BM / CM / HR / Committee assignment tables)
 *
 * Self-protection: a delegate is never the evaluator of their OWN record. When
 * the employee being evaluated is the (only) delegate, the department falls
 * back to the branch default for that employee. Nobody may ever evaluate
 * themselves, delegate or not.
 *
 * A POA is an authority grant only — it never touches the delegate's role,
 * home branch or department, and it is always explicit per branch+department
 * (a Jaipur·Finance POA has no effect on Jodhpur·Finance).
 *
 * The pure helpers below (no DB) hold the whole decision so they can be unit
 * tested; the async wrappers just load rows for them.
 */

/** Evaluator types that can be delegated, in display / login-offer order. */
export const DELEGABLE_TYPES = ["BRANCH_MANAGER", "CLUSTER_MANAGER", "HR", "COMMITTEE"];

/** Types limited to ONE delegate per department. Committee may hold several. */
export const SINGLE_DELEGATE_TYPES = new Set(["BRANCH_MANAGER", "CLUSTER_MANAGER", "HR"]);

export const EVALUATOR_TYPE_LABELS = {
    BRANCH_MANAGER: "Branch Manager",
    CLUSTER_MANAGER: "Cluster Manager",
    HR: "HR Personnel",
    COMMITTEE: "Committee",
};

/** Report label for the capacity an evaluation was submitted in. */
export function evaluatorTypeLabel(type, viaDelegation) {
    const base = EVALUATOR_TYPE_LABELS[type] || type;
    return viaDelegation ? `Delegated ${base}` : base;
}

/**
 * Value stored in EvaluatorDelegation.slotKey. The DB unique index on
 * (departmentId, evaluatorType, slotKey) then allows exactly one BM / CM / HR
 * delegate per department while letting Committee hold several.
 */
export function delegationSlotKey(type, evaluatorUserId) {
    return SINGLE_DELEGATE_TYPES.has(type) ? "SINGLE" : evaluatorUserId;
}

/**
 * Group delegation rows (already filtered to ONE evaluator type) by department.
 * @param {{ departmentId: string, evaluatorUserId: string }[]} rows
 * @returns {Map<string, string[]>} departmentId → delegate user ids
 */
export function buildDelegationIndex(rows) {
    const index = new Map();
    for (const r of rows || []) {
        if (!r?.departmentId || !r?.evaluatorUserId) continue;
        if (!index.has(r.departmentId)) index.set(r.departmentId, []);
        const list = index.get(r.departmentId);
        if (!list.includes(r.evaluatorUserId)) list.push(r.evaluatorUserId);
    }
    return index;
}

/**
 * The delegates who evaluate `employeeId` (in `departmentId`) — every
 * department delegate EXCEPT the employee themselves. An empty result means
 * the branch default evaluates this employee.
 */
export function effectiveDelegates(index, departmentId, employeeId) {
    if (!departmentId) return [];
    const list = index?.get(departmentId) || [];
    return list.filter((id) => id !== employeeId);
}

/**
 * Decide whether `userId` may evaluate `employeeId` for one evaluator type.
 *
 * @param {object} args
 * @param {string} args.userId         - the would-be evaluator
 * @param {string} args.employeeId     - the employee being evaluated
 * @param {string|null} args.departmentId - the employee's home department
 * @param {Map<string,string[]>} args.index - buildDelegationIndex() for the type
 * @param {boolean} args.isBranchDefault - userId holds the branch-level
 *        assignment for the employee's branch (BM / CM / HR / Committee)
 * @returns {{ allowed: boolean, viaDelegation: boolean, delegated: boolean, reason: string|null }}
 *   delegated   — the employee's department is delegated for this type (after
 *                 self-exclusion), i.e. the branch default is overridden.
 *   reason      — "SELF" | "DELEGATED_ELSEWHERE" | "NOT_ASSIGNED" when denied.
 */
export function resolveEvaluatorAccess({ userId, employeeId, departmentId, index, isBranchDefault }) {
    if (!userId || !employeeId) {
        return { allowed: false, viaDelegation: false, delegated: false, reason: "NOT_ASSIGNED" };
    }
    if (userId === employeeId) {
        return { allowed: false, viaDelegation: false, delegated: false, reason: "SELF" };
    }
    const delegates = effectiveDelegates(index, departmentId, employeeId);
    if (delegates.length > 0) {
        const allowed = delegates.includes(userId);
        return { allowed, viaDelegation: allowed, delegated: true, reason: allowed ? null : "DELEGATED_ELSEWHERE" };
    }
    return {
        allowed: !!isBranchDefault,
        viaDelegation: false,
        delegated: false,
        reason: isBranchDefault ? null : "NOT_ASSIGNED",
    };
}

/** Human-readable 403 message for a denied resolveEvaluatorAccess() result. */
export function accessDeniedMessage(type, reason) {
    const label = EVALUATOR_TYPE_LABELS[type] || "evaluator";
    if (reason === "SELF") return "You cannot evaluate yourself.";
    if (reason === "DELEGATED_ELSEWHERE") {
        return `This employee's department has a department-specific ${label} evaluator (Power of Attorney). Only that evaluator can evaluate them.`;
    }
    return `You are not the ${label} evaluator for this employee's branch and department.`;
}

// ═══════════════════════════════════════════════════════════════
//  DB wrappers
// ═══════════════════════════════════════════════════════════════

/**
 * Load the delegation index for one evaluator type across some branches.
 * @param {string} type
 * @param {string[]} branchIds
 * @returns {Promise<Map<string, string[]>>}
 */
export async function loadDelegationIndex(type, branchIds, db = prisma) {
    const ids = (branchIds || []).filter(Boolean);
    if (ids.length === 0) return new Map();
    const rows = await db.evaluatorDelegation.findMany({
        where: { evaluatorType: type, branchId: { in: ids } },
        select: { departmentId: true, evaluatorUserId: true },
    });
    return buildDelegationIndex(rows);
}

/**
 * Every delegation `userId` holds (optionally for one type), with branch and
 * department names — drives dashboard scope and the "you are evaluating under
 * POA for …" banner.
 */
export async function getUserDelegations(userId, type = null, db = prisma) {
    if (!userId) return [];
    return db.evaluatorDelegation.findMany({
        where: { evaluatorUserId: userId, ...(type ? { evaluatorType: type } : {}) },
        select: {
            id: true,
            evaluatorType: true,
            branchId: true,
            departmentId: true,
            branch: { select: { id: true, name: true, branchType: true } },
            department: { select: { id: true, name: true } },
        },
        orderBy: [{ branch: { name: "asc" } }, { department: { name: "asc" } }],
    });
}

/** Distinct evaluator types `userId` holds a POA for, in DELEGABLE_TYPES order. */
export async function getDelegatedTypes(userId, db = prisma) {
    if (!userId) return [];
    const rows = await db.evaluatorDelegation.findMany({
        where: { evaluatorUserId: userId },
        select: { evaluatorType: true },
        distinct: ["evaluatorType"],
    });
    const held = new Set(rows.map((r) => r.evaluatorType));
    return DELEGABLE_TYPES.filter((t) => held.has(t));
}

/** Distinct branches (ordered by name) where `userId` holds a POA of `type`. */
export async function getDelegatedBranches(userId, type, db = prisma) {
    const rows = await getUserDelegations(userId, type, db);
    const seen = new Map();
    for (const r of rows) if (r.branch && !seen.has(r.branch.id)) seen.set(r.branch.id, r.branch);
    return [...seen.values()];
}

/**
 * Every branch `userId` can evaluate in as `type`: branch-default assignments
 * first (unchanged order), then branches reached only through a POA.
 *
 * @returns {Promise<{ branches: {id,name,branchType,viaDelegationOnly:boolean}[], defaultBranchIds: Set<string> }>}
 */
export async function getEvaluatorBranchScope(userId, type, db = prisma) {
    const [defaults, delegated] = await Promise.all([
        resolveAllScopeBranches({ userId, role: type }),
        getDelegatedBranches(userId, type, db),
    ]);
    const defaultBranchIds = new Set(defaults.map((b) => b.id));
    const branches = defaults.map((b) => ({ id: b.id, name: b.name, branchType: b.branchType, viaDelegationOnly: false }));
    for (const b of delegated) {
        if (!defaultBranchIds.has(b.id)) branches.push({ id: b.id, name: b.name, branchType: b.branchType, viaDelegationOnly: true });
    }
    return { branches, defaultBranchIds };
}

/**
 * Is `userId` the branch-default evaluator of `type` for `branchId`?
 * (The pre-POA authorization check, unchanged.)
 */
export async function isBranchDefaultEvaluator(userId, type, branchId, db = prisma) {
    if (!userId || !branchId) return false;
    if (type === "BRANCH_MANAGER") {
        const row = await db.branchManagerAssignment.findUnique({ where: { bmUserId: userId }, select: { branchId: true } });
        return row?.branchId === branchId;
    }
    if (type === "CLUSTER_MANAGER") {
        return !!(await db.clusterManagerBranchAssignment.findUnique({
            where: { cmUserId_branchId: { cmUserId: userId, branchId } }, select: { id: true },
        }));
    }
    if (type === "HR") {
        return !!(await db.hrBranchAssignment.findUnique({
            where: { hrUserId_branchId: { hrUserId: userId, branchId } }, select: { id: true },
        }));
    }
    if (type === "COMMITTEE") {
        return !!(await db.committeeBranchAssignment.findUnique({
            where: { memberUserId_branchId: { memberUserId: userId, branchId } }, select: { id: true },
        }));
    }
    return false;
}

/**
 * Server-side authorization for one evaluation: may `userId` evaluate
 * `employee` as `type`? Combines the branch-default check with the employee's
 * department POA (+ self-protection).
 *
 * @param {object} args
 * @param {string} args.userId
 * @param {string} args.type
 * @param {{ id: string, departmentId: string|null, branchId: string|null }} args.employee
 */
export async function authorizeEvaluator({ userId, type, employee }, db = prisma) {
    const branchId = employee?.branchId || null;
    if (!branchId) return { allowed: false, viaDelegation: false, delegated: false, reason: "NOT_ASSIGNED" };
    const [index, isBranchDefault] = await Promise.all([
        loadDelegationIndex(type, [branchId], db),
        isBranchDefaultEvaluator(userId, type, branchId, db),
    ]);
    return resolveEvaluatorAccess({
        userId,
        employeeId: employee.id,
        departmentId: employee.departmentId,
        index,
        isBranchDefault,
    });
}

/**
 * Filter a branch's candidate rows down to those `userId` evaluates as `type`.
 *
 * @param {object} args
 * @param {string} args.userId
 * @param {Array<{ employeeId: string, departmentId: string|null }>} args.rows
 * @param {Map<string,string[]>} args.index - delegation index for the branch
 * @param {boolean} args.isBranchDefault
 * @returns {Array} the subset of `rows` (each annotated with `viaDelegation`)
 */
export function filterRowsForEvaluator({ userId, rows, index, isBranchDefault }) {
    const out = [];
    for (const row of rows || []) {
        const access = resolveEvaluatorAccess({
            userId,
            employeeId: row.employeeId,
            departmentId: row.departmentId,
            index,
            isBranchDefault,
        });
        if (access.allowed) out.push({ ...row, viaDelegation: access.viaDelegation });
    }
    return out;
}
