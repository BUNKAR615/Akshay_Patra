import prisma from "./prisma";
import { getUserDelegations, loadDelegationIndex, resolveEvaluatorAccess } from "./evaluatorDelegation";
import { loadHodCoverage } from "./hodCoverage";

/**
 * Stage 2 (Branch Manager) evaluation queue for one user.
 *
 * A user reaches this queue in either (or both) capacities:
 *   - branch default  — they hold the BranchManagerAssignment for a branch:
 *                       every Stage 1 employee there, EXCEPT departments whose
 *                       Stage 2 has been delegated (POA) to someone else.
 *   - delegate (POA)  — they hold BRANCH_MANAGER EvaluatorDelegation rows:
 *                       the Stage 1 employees of exactly those departments.
 * Nobody ever gets themselves (self-protection — a delegate's own record falls
 * back to the branch default).
 *
 * The BIG-branch collar rule is unchanged and applies in both capacities: the
 * BM-type evaluator takes WHITE_COLLAR plus ORPHANED blue-collar employees;
 * HOD-covered blue-collar employees (lib/hodCoverage — attached to an HOD, or
 * already evaluated by one) stay with their HOD.
 *
 * Shared by GET /api/branch-manager/shortlist (the dashboard list) and
 * POST /api/branch-manager/evaluate (progress counts), so the list a user sees
 * is exactly the set the server will accept.
 *
 * @returns {Promise<{
 *   bmBranch: { id, name, branchType } | null,
 *   delegations: object[],
 *   branches: { id, name, branchType }[],
 *   rows: object[],
 * }>}
 */
export async function buildBmQueue(userId, quarterId) {
    const [bmRow, delegations] = await Promise.all([
        prisma.branchManagerAssignment.findUnique({
            where: { bmUserId: userId },
            select: { branch: { select: { id: true, name: true, branchType: true } } },
        }),
        getUserDelegations(userId, "BRANCH_MANAGER"),
    ]);
    const bmBranch = bmRow?.branch || null;

    const branchById = new Map();
    if (bmBranch) branchById.set(bmBranch.id, bmBranch);
    for (const d of delegations) if (d.branch && !branchById.has(d.branch.id)) branchById.set(d.branch.id, d.branch);
    const branchIds = [...branchById.keys()];
    if (branchIds.length === 0) return { bmBranch, delegations, branches: [], rows: [] };

    const bigBranchIds = branchIds.filter((id) => branchById.get(id)?.branchType === "BIG");

    const [stage1, index, hodCovered] = await Promise.all([
        prisma.branchShortlistStage1.findMany({
            where: { branchId: { in: branchIds }, quarterId },
            select: {
                userId: true,
                branchId: true,
                collarType: true,
                user: {
                    select: {
                        id: true,
                        name: true,
                        empCode: true,
                        designation: true,
                        collarType: true,
                        department: { select: { id: true, name: true } },
                    },
                },
            },
        }),
        loadDelegationIndex("BRANCH_MANAGER", branchIds),
        loadHodCoverage(prisma, { quarterId, branchIds: bigBranchIds }),
    ]);

    const rows = [];
    for (const s of stage1) {
        const branch = branchById.get(s.branchId);
        if (branch?.branchType === "BIG") {
            // Live User.collarType (from the uploaded sheet) wins; the Stage-1
            // snapshot is only a fallback when it is null.
            const collar = s.user?.collarType || s.collarType;
            if (collar !== "WHITE_COLLAR" && hodCovered.has(s.userId)) continue; // HOD's target
        }
        const access = resolveEvaluatorAccess({
            userId,
            employeeId: s.userId,
            departmentId: s.user?.department?.id || null,
            index,
            isBranchDefault: !!bmBranch && bmBranch.id === s.branchId,
        });
        if (!access.allowed) continue;
        rows.push({ ...s, branch, viaDelegation: access.viaDelegation });
    }

    return { bmBranch, delegations, branches: [...branchById.values()], rows };
}
