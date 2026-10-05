export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import bcrypt from "bcryptjs";
import prisma from "../../../../../../lib/prisma";
import { withPermission } from "../../../../../../lib/withPermission";
import { ok, fail, created, conflict, notFound, forbidden, validateBody, handleApiError } from "../../../../../../lib/api-response";
import { resolveBranch } from "../../../../../../lib/resolveBranch";
import { hasPermission, branchKey } from "../../../../../../lib/permissions";
import { defaultHodSecondaryPasswordFor } from "../../../../../../lib/auth/defaultPassword";
import {
    DELEGABLE_TYPES,
    SINGLE_DELEGATE_TYPES,
    EVALUATOR_TYPE_LABELS,
    delegationSlotKey,
} from "../../../../../../lib/evaluatorDelegation";
import { z } from "zod";

const SALT_ROUNDS = 10;
// Mirrors the branch committee cap (committee-assign route: max 3 members).
const MAX_COMMITTEE_DELEGATES = 3;

const ROLE_LABELS = {
    EMPLOYEE: "Employee",
    SUPERVISOR: "Supervisor",
    HOD: "HOD",
    BRANCH_MANAGER: "Branch Manager",
    CLUSTER_MANAGER: "Cluster Manager",
    HR: "HR",
    COMMITTEE: "Committee",
    ADMIN: "Admin",
};

const assignSchema = z.object({
    departmentId: z.string().min(1, "Department is required"),
    evaluatorType: z.enum(DELEGABLE_TYPES),
    userId: z.string().min(1, "Select a person"),
    // "Change POA": replace the department's current BM / CM / HR delegate.
    replace: z.boolean().optional(),
});

/**
 * Per-branch Organisation-Structure access. ADMIN / master grant pass; an
 * operator needs this branch's `branch:<id>:org` key or an org.assign.* grant —
 * a grant for ANOTHER branch is not enough (precise per-branch check).
 */
function canManageBranchOrg(user, branch) {
    return hasPermission(user, [
        branchKey(branch.id, "org"),
        ...(branch.slug ? [branchKey(branch.slug, "org")] : []),
        "org.assign.bm", "org.assign.cm", "org.assign.hr", "org.assign.committee",
    ]);
}

async function loadBranch(params, user) {
    const branch = await resolveBranch(params?.branchId || "");
    if (!branch) return { error: notFound("Branch not found") };
    if (!canManageBranchOrg(user, branch)) return { error: forbidden("You are not authorized for this branch's organisation structure.") };
    return { branch };
}

const personSelect = {
    id: true,
    name: true,
    empCode: true,
    designation: true,
    role: true,
    department: { select: { id: true, name: true, branch: { select: { id: true, name: true } } } },
};

/**
 * Describe each person's ORIGINAL identity and actual (global) roles, so the
 * admin can see a POA is delegated authority — not a promotion or a move.
 */
async function describePeople(users) {
    const ids = [...new Set(users.filter(Boolean).map((u) => u.id))];
    if (ids.length === 0) return new Map();
    const [bm, cm, hr, committee] = await Promise.all([
        prisma.branchManagerAssignment.findMany({ where: { bmUserId: { in: ids } }, select: { bmUserId: true, branch: { select: { name: true } } } }),
        prisma.clusterManagerBranchAssignment.findMany({ where: { cmUserId: { in: ids } }, select: { cmUserId: true, branch: { select: { name: true } } } }),
        prisma.hrBranchAssignment.findMany({ where: { hrUserId: { in: ids } }, select: { hrUserId: true, branch: { select: { name: true } } } }),
        prisma.committeeBranchAssignment.findMany({ where: { memberUserId: { in: ids } }, select: { memberUserId: true, branch: { select: { name: true } } } }),
    ]);
    const held = new Map(ids.map((id) => [id, new Map()]));
    const push = (uid, role, branchName) => {
        const m = held.get(uid);
        if (!m) return;
        if (!m.has(role)) m.set(role, []);
        if (branchName && !m.get(role).includes(branchName)) m.get(role).push(branchName);
    };
    bm.forEach((r) => push(r.bmUserId, "BRANCH_MANAGER", r.branch?.name));
    cm.forEach((r) => push(r.cmUserId, "CLUSTER_MANAGER", r.branch?.name));
    hr.forEach((r) => push(r.hrUserId, "HR", r.branch?.name));
    committee.forEach((r) => push(r.memberUserId, "COMMITTEE", r.branch?.name));

    const out = new Map();
    for (const u of users) {
        if (!u || out.has(u.id)) continue;
        const assignments = held.get(u.id) || new Map();
        const globalRoles = [...assignments.entries()].map(([role, branches]) => `${ROLE_LABELS[role]} (${branches.join(", ")})`);
        if (globalRoles.length === 0) globalRoles.push(ROLE_LABELS[u.role] || u.role);
        out.set(u.id, {
            id: u.id,
            name: u.name,
            empCode: u.empCode || "",
            designation: u.designation || "",
            role: u.role,
            homeBranch: u.department?.branch?.name || null,
            homeDepartment: u.department?.name || null,
            globalRoles,
        });
    }
    return out;
}

/**
 * GET  /api/admin/branches/[branchId]/evaluator-delegations
 *   Department × evaluator-type matrix for the branch: for each department and
 *   each of Branch Manager / Cluster Manager / HR / Committee, whether it uses
 *   the Branch Default or a Department POA, with the people involved.
 *
 * GET  /api/admin/branches/[branchId]/evaluator-delegations?q=<name|code>
 *   Person search for the "Assign POA" picker (any branch — e.g. a Cluster
 *   Manager of another branch). Existing users only; nobody is created.
 *
 * POST /api/admin/branches/[branchId]/evaluator-delegations
 *   { departmentId, evaluatorType, userId, replace? } — Assign / Change POA.
 *
 * DELETE /api/admin/branches/[branchId]/evaluator-delegations?id=<delegationId>
 *   Remove POA — the department immediately falls back to the branch default.
 *
 * A POA never changes the person's role, home branch, department or
 * designation (lib/evaluatorDelegation).
 */
export const GET = withPermission("branches.org", async (request, { params, user }) => {
    try {
        const { branch, error } = await loadBranch(params, user);
        if (error) return error;

        const q = (new URL(request.url).searchParams.get("q") || "").trim();
        if (q) {
            const users = await prisma.user.findMany({
                where: {
                    empCode: { not: null },
                    OR: [
                        { name: { contains: q, mode: "insensitive" } },
                        { empCode: { contains: q, mode: "insensitive" } },
                    ],
                },
                select: personSelect,
                orderBy: { name: "asc" },
                take: 25,
            });
            const people = await describePeople(users);
            return ok({ candidates: users.map((u) => people.get(u.id)) });
        }

        const [departments, bmRow, cmRows, hrRows, committeeRows, delegations] = await Promise.all([
            prisma.department.findMany({
                where: { branchId: branch.id },
                select: { id: true, name: true, _count: { select: { users: true } } },
                orderBy: { name: "asc" },
            }),
            prisma.branchManagerAssignment.findUnique({ where: { branchId: branch.id }, select: { bm: { select: personSelect } } }),
            prisma.clusterManagerBranchAssignment.findMany({ where: { branchId: branch.id }, select: { cm: { select: personSelect } } }),
            prisma.hrBranchAssignment.findMany({ where: { branchId: branch.id }, select: { hr: { select: personSelect } }, orderBy: { assignedAt: "asc" } }),
            prisma.committeeBranchAssignment.findMany({ where: { branchId: branch.id }, select: { member: { select: personSelect } }, orderBy: { assignedAt: "asc" } }),
            prisma.evaluatorDelegation.findMany({
                where: { branchId: branch.id },
                select: { id: true, departmentId: true, evaluatorType: true, createdAt: true, updatedAt: true, evaluator: { select: personSelect } },
                orderBy: { createdAt: "asc" },
            }),
        ]);

        const defaultsRaw = {
            BRANCH_MANAGER: bmRow?.bm ? [bmRow.bm] : [],
            CLUSTER_MANAGER: cmRows.map((r) => r.cm).filter(Boolean),
            HR: hrRows.map((r) => r.hr).filter(Boolean),
            COMMITTEE: committeeRows.map((r) => r.member).filter(Boolean),
        };
        const people = await describePeople([
            ...Object.values(defaultsRaw).flat(),
            ...delegations.map((d) => d.evaluator),
        ]);
        const defaults = Object.fromEntries(
            Object.entries(defaultsRaw).map(([t, list]) => [t, list.map((u) => people.get(u.id))])
        );

        const rows = departments.map((d) => {
            const evaluators = {};
            for (const type of DELEGABLE_TYPES) {
                const delegates = delegations
                    .filter((x) => x.departmentId === d.id && x.evaluatorType === type)
                    .map((x) => ({ ...people.get(x.evaluator.id), delegationId: x.id, assignedAt: x.createdAt }));
                evaluators[type] = {
                    mode: delegates.length > 0 ? "DEPARTMENT_POA" : "BRANCH_DEFAULT",
                    delegates,
                    branchDefault: defaults[type],
                };
            }
            return { id: d.id, name: d.name, employeeCount: d._count.users, evaluators };
        });

        return ok({
            branch: { id: branch.id, name: branch.name, slug: branch.slug, branchType: branch.branchType },
            types: DELEGABLE_TYPES.map((t) => ({ type: t, label: EVALUATOR_TYPE_LABELS[t], multiple: !SINGLE_DELEGATE_TYPES.has(t) })),
            branchDefaults: defaults,
            departments: rows,
        });
    } catch (err) {
        return handleApiError(err, "EVALUATOR-DELEGATIONS-GET");
    }
});

export const POST = withPermission("branches.org", async (request, { params, user }) => {
    try {
        const { branch, error } = await loadBranch(params, user);
        if (error) return error;

        const { data, error: vErr } = await validateBody(request, assignSchema);
        if (vErr) return vErr;
        const { departmentId, evaluatorType, userId, replace } = data;
        const typeLabel = EVALUATOR_TYPE_LABELS[evaluatorType];

        // Scope: the department must belong to THIS branch (POA is always
        // explicit per branch + department).
        const dept = await prisma.department.findUnique({ where: { id: departmentId }, select: { id: true, name: true, branchId: true } });
        if (!dept || dept.branchId !== branch.id) return fail("Department does not belong to this branch");

        // Existing person only — POA never creates or duplicates an employee.
        const target = await prisma.user.findUnique({
            where: { id: userId },
            select: { ...personSelect, departmentId: true, passwordHod: true },
        });
        if (!target) return fail("Person not found");
        if (!target.empCode) return fail(`${target.name} has no employee code and cannot sign in as an evaluator.`);

        // Pointless / conflicting assignments.
        const isDefault = await (async () => {
            if (evaluatorType === "BRANCH_MANAGER") {
                const r = await prisma.branchManagerAssignment.findUnique({ where: { branchId: branch.id }, select: { bmUserId: true } });
                return r?.bmUserId === userId;
            }
            if (evaluatorType === "CLUSTER_MANAGER") {
                return !!(await prisma.clusterManagerBranchAssignment.findUnique({ where: { cmUserId_branchId: { cmUserId: userId, branchId: branch.id } }, select: { id: true } }));
            }
            if (evaluatorType === "HR") {
                return !!(await prisma.hrBranchAssignment.findUnique({ where: { hrUserId_branchId: { hrUserId: userId, branchId: branch.id } }, select: { id: true } }));
            }
            return !!(await prisma.committeeBranchAssignment.findUnique({ where: { memberUserId_branchId: { memberUserId: userId, branchId: branch.id } }, select: { id: true } }));
        })();
        if (isDefault) {
            return conflict(`${target.name} is already the branch-default ${typeLabel} for ${branch.name}, so a department POA would change nothing.`);
        }

        const existing = await prisma.evaluatorDelegation.findMany({
            where: { departmentId, evaluatorType },
            select: { id: true, evaluatorUserId: true, evaluator: { select: { name: true } } },
        });
        if (existing.some((e) => e.evaluatorUserId === userId)) {
            return conflict(`${target.name} already holds the ${typeLabel} POA for ${dept.name}.`);
        }
        const isSingle = SINGLE_DELEGATE_TYPES.has(evaluatorType);
        if (isSingle && existing.length > 0 && !replace) {
            return conflict(`${dept.name} already has a department-specific ${typeLabel} (${existing[0].evaluator?.name}). Use "Change" to replace them.`);
        }
        if (!isSingle && existing.length >= MAX_COMMITTEE_DELEGATES) {
            return conflict(`A department can have at most ${MAX_COMMITTEE_DELEGATES} committee POA members.`);
        }

        const replaced = isSingle ? existing : [];
        const delegation = await prisma.$transaction(async (tx) => {
            if (replaced.length) {
                await tx.evaluatorDelegation.deleteMany({ where: { id: { in: replaced.map((r) => r.id) } } });
            }
            const row = await tx.evaluatorDelegation.create({
                data: {
                    branchId: branch.id,
                    departmentId,
                    evaluatorType,
                    evaluatorUserId: userId,
                    slotKey: delegationSlotKey(evaluatorType, userId),
                    assignedBy: user.userId,
                },
            });
            // Sign-in: an ordinary employee reaches the evaluator dashboard with
            // the dual-login secondary password ("Firstname_##"), exactly like a
            // nominated HOD. Only provisioned when missing, and ONLY for
            // EMPLOYEE / HOD accounts — staff accounts already sign in to an
            // evaluator role, and adding a secondary password to them would
            // flip their primary login. Role / branch / department untouched.
            if (!target.passwordHod && target.departmentId && (target.role === "EMPLOYEE" || target.role === "HOD")) {
                const plain = defaultHodSecondaryPasswordFor({ empCode: target.empCode, name: target.name });
                await tx.user.update({ where: { id: userId }, data: { passwordHod: await bcrypt.hash(plain, SALT_ROUNDS) } });
            }
            return row;
        });

        await prisma.auditLog.create({
            data: {
                userId: user.userId,
                action: replaced.length ? "EVALUATOR_POA_CHANGED" : "EVALUATOR_POA_ASSIGNED",
                details: {
                    delegationId: delegation.id,
                    branchId: branch.id,
                    branchName: branch.name,
                    departmentId,
                    departmentName: dept.name,
                    evaluatorType,
                    evaluatorUserId: userId,
                    evaluatorName: target.name,
                    evaluatorEmpCode: target.empCode,
                    replaced: replaced.map((r) => ({ userId: r.evaluatorUserId, name: r.evaluator?.name })),
                    message: `${target.name} given ${typeLabel} POA for ${branch.name} · ${dept.name}${replaced.length ? ` (replaced ${replaced.map((r) => r.evaluator?.name).join(", ")})` : ""}`,
                },
            },
        }).catch((err) => { console.error("[EVALUATOR-POA] Audit log failed:", err); });

        return created({
            message: `${target.name} is now the department-specific ${typeLabel} for ${branch.name} · ${dept.name}.`,
            delegation: { id: delegation.id, departmentId, evaluatorType, evaluatorUserId: userId },
        });
    } catch (err) {
        if (err?.code === "P2002") return conflict("That department already has this evaluator POA configured. Refresh and try again.");
        return handleApiError(err, "EVALUATOR-DELEGATIONS-POST");
    }
});

export const DELETE = withPermission("branches.org", async (request, { params, user }) => {
    try {
        const { branch, error } = await loadBranch(params, user);
        if (error) return error;

        const id = (new URL(request.url).searchParams.get("id") || "").trim();
        if (!id) return fail("Delegation id is required");

        const row = await prisma.evaluatorDelegation.findUnique({
            where: { id },
            select: {
                id: true, branchId: true, departmentId: true, evaluatorType: true, evaluatorUserId: true,
                evaluator: { select: { name: true, empCode: true } },
                department: { select: { name: true } },
            },
        });
        if (!row || row.branchId !== branch.id) return notFound("POA not found for this branch");

        await prisma.evaluatorDelegation.delete({ where: { id } });

        const typeLabel = EVALUATOR_TYPE_LABELS[row.evaluatorType];
        await prisma.auditLog.create({
            data: {
                userId: user.userId,
                action: "EVALUATOR_POA_REMOVED",
                details: {
                    delegationId: id,
                    branchId: branch.id,
                    branchName: branch.name,
                    departmentId: row.departmentId,
                    departmentName: row.department?.name,
                    evaluatorType: row.evaluatorType,
                    evaluatorUserId: row.evaluatorUserId,
                    evaluatorName: row.evaluator?.name,
                    evaluatorEmpCode: row.evaluator?.empCode,
                    message: `${row.evaluator?.name} removed as ${typeLabel} POA for ${branch.name} · ${row.department?.name}`,
                },
            },
        }).catch((err) => { console.error("[EVALUATOR-POA] Audit log failed:", err); });

        return ok({ message: `${row.department?.name} now uses the branch-default ${typeLabel}.` });
    } catch (err) {
        return handleApiError(err, "EVALUATOR-DELEGATIONS-DELETE");
    }
});
