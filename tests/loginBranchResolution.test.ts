import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Unit tests for the post-fix branch-isolation gate.
 *
 * The bug we're guarding against:
 *   A Cluster Manager assigned to Jodhpur AND Jaipur was getting silently
 *   routed to whichever branch was most recently assigned. The fix makes
 *   the per-role assignment table the single source of truth and forces
 *   the JWT branchId to be one specific assignment row — picked by the
 *   user via the multi-branch picker.
 *
 * `resolveScopeBranch` is the guard that protects every CM/HR/Committee
 * API route. It must:
 *   1. Trust the JWT branchId only if it's present in the user's
 *      assignment table for that role.
 *   2. Return null branch (caller 403s) if the JWT branchId is stale,
 *      missing, or for a branch the user is no longer assigned to.
 *   3. Never use a "first / most recent" fallback that could leak
 *      another branch's data.
 *
 * For BM (single branch per user), the assignment table is canonical and
 * indexed by bmUserId — branchId on the JWT is informational, not load-bearing.
 */

const cmFindUnique = vi.fn();
const hrFindUnique = vi.fn();
const committeeFindUnique = vi.fn();
const bmFindUnique = vi.fn();
const branchFindUnique = vi.fn();
const cmFindMany = vi.fn();
const hrFindMany = vi.fn();
const committeeFindMany = vi.fn();

vi.mock("../lib/prisma", () => ({
    default: {
        clusterManagerBranchAssignment: {
            findUnique: (args: any) => cmFindUnique(args),
            findMany: (args: any) => cmFindMany(args),
        },
        hrBranchAssignment: {
            findUnique: (args: any) => hrFindUnique(args),
            findMany: (args: any) => hrFindMany(args),
        },
        committeeBranchAssignment: {
            findUnique: (args: any) => committeeFindUnique(args),
            findMany: (args: any) => committeeFindMany(args),
        },
        branchManagerAssignment: {
            findUnique: (args: any) => bmFindUnique(args),
        },
        branch: {
            findUnique: (args: any) => branchFindUnique(args),
        },
    },
}));

import { resolveScopeBranch, resolveAllScopeBranches } from "../lib/auth/resolveScopeBranch.js";

const JODHPUR = { id: "branch-jodhpur", name: "Jodhpur", branchType: "BIG" };
const JAIPUR = { id: "branch-jaipur", name: "Jaipur", branchType: "BIG" };

beforeEach(() => {
    cmFindUnique.mockReset();
    hrFindUnique.mockReset();
    committeeFindUnique.mockReset();
    bmFindUnique.mockReset();
    branchFindUnique.mockReset();
    cmFindMany.mockReset();
    hrFindMany.mockReset();
    committeeFindMany.mockReset();
});

describe("resolveScopeBranch — Cluster Manager branch isolation", () => {
    it("returns the JWT branch when the CM has an assignment row for it", async () => {
        cmFindUnique.mockResolvedValueOnce({ branch: JODHPUR });
        const out = await resolveScopeBranch({
            userId: "u-rajesh",
            role: "CLUSTER_MANAGER",
            branchId: JODHPUR.id,
        });
        expect(out.branchId).toBe(JODHPUR.id);
        expect(out.branch).toEqual(JODHPUR);
        // Must look up the exact (cmUserId, branchId) pair — no "first" or
        // "desc" ordering that could leak another branch.
        expect(cmFindUnique).toHaveBeenCalledWith({
            where: { cmUserId_branchId: { cmUserId: "u-rajesh", branchId: JODHPUR.id } },
            select: { branch: { select: { id: true, name: true, branchType: true } } },
        });
    });

    it("returns null branch when the CM is NOT assigned to the JWT branch (forged/stale JWT)", async () => {
        // Rajesh is only on Jodhpur. JWT carries Jaipur. The composite-key
        // findUnique returns null. The caller must 403, not silently leak.
        cmFindUnique.mockResolvedValueOnce(null);
        const out = await resolveScopeBranch({
            userId: "u-rajesh",
            role: "CLUSTER_MANAGER",
            branchId: JAIPUR.id,
        });
        expect(out.branchId).toBe("");
        expect(out.branch).toBeNull();
    });

    it("returns null branch when the JWT carries no branchId at all", async () => {
        const out = await resolveScopeBranch({
            userId: "u-rajesh",
            role: "CLUSTER_MANAGER",
            branchId: "",
        });
        expect(out.branchId).toBe("");
        expect(out.branch).toBeNull();
        // Must not even attempt a "pick first" lookup against the assignment
        // table — that was the original bug.
        expect(cmFindUnique).not.toHaveBeenCalled();
        expect(cmFindMany).not.toHaveBeenCalled();
    });
});

describe("resolveScopeBranch — HR & Committee mirror CM behavior", () => {
    it("HR — returns the JWT branch when assignment row exists", async () => {
        hrFindUnique.mockResolvedValueOnce({ branch: JODHPUR });
        const out = await resolveScopeBranch({
            userId: "u-hr",
            role: "HR",
            branchId: JODHPUR.id,
        });
        expect(out.branch).toEqual(JODHPUR);
        expect(hrFindUnique).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { hrUserId_branchId: { hrUserId: "u-hr", branchId: JODHPUR.id } },
            }),
        );
    });

    it("HR — returns null branch when not assigned to the JWT branch", async () => {
        hrFindUnique.mockResolvedValueOnce(null);
        const out = await resolveScopeBranch({
            userId: "u-hr",
            role: "HR",
            branchId: JAIPUR.id,
        });
        expect(out.branch).toBeNull();
    });

    it("Committee — returns the JWT branch when assignment row exists", async () => {
        committeeFindUnique.mockResolvedValueOnce({ branch: JAIPUR });
        const out = await resolveScopeBranch({
            userId: "u-comm",
            role: "COMMITTEE",
            branchId: JAIPUR.id,
        });
        expect(out.branch).toEqual(JAIPUR);
        expect(committeeFindUnique).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { memberUserId_branchId: { memberUserId: "u-comm", branchId: JAIPUR.id } },
            }),
        );
    });

    it("Committee — returns null branch when not assigned to the JWT branch", async () => {
        committeeFindUnique.mockResolvedValueOnce(null);
        const out = await resolveScopeBranch({
            userId: "u-comm",
            role: "COMMITTEE",
            branchId: JODHPUR.id,
        });
        expect(out.branch).toBeNull();
    });
});

describe("resolveScopeBranch — Branch Manager (single-branch) path", () => {
    it("ignores JWT branchId and reads from BM assignment table directly", async () => {
        bmFindUnique.mockResolvedValueOnce({ branch: JODHPUR });
        const out = await resolveScopeBranch({
            userId: "u-bm",
            role: "BRANCH_MANAGER",
            // Even if the JWT carried a wrong branchId, BM is one-per-user —
            // canonical answer comes from the unique index on bmUserId.
            branchId: "branch-bogus",
        });
        expect(out.branch).toEqual(JODHPUR);
        expect(bmFindUnique).toHaveBeenCalledWith({
            where: { bmUserId: "u-bm" },
            select: { branch: { select: { id: true, name: true, branchType: true } } },
        });
    });

    it("returns null branch when the BM has no assignment row", async () => {
        bmFindUnique.mockResolvedValueOnce(null);
        const out = await resolveScopeBranch({
            userId: "u-bm",
            role: "BRANCH_MANAGER",
            branchId: JODHPUR.id,
        });
        expect(out.branch).toBeNull();
    });
});

describe("resolveScopeBranch — Department-scoped roles fall through to Branch lookup", () => {
    it("HOD/EMPLOYEE: trusts JWT branchId and just confirms the branch exists", async () => {
        branchFindUnique.mockResolvedValueOnce(JODHPUR);
        const out = await resolveScopeBranch({
            userId: "u-emp",
            role: "EMPLOYEE",
            branchId: JODHPUR.id,
        });
        expect(out.branch).toEqual(JODHPUR);
        expect(branchFindUnique).toHaveBeenCalled();
    });
});

describe("resolveAllScopeBranches — multi-branch picker source", () => {
    it("returns every CM assignment in stable assignedAt-asc order", async () => {
        cmFindMany.mockResolvedValueOnce([
            { branch: JODHPUR },
            { branch: JAIPUR },
        ]);
        const branches = await resolveAllScopeBranches({
            userId: "u-rajesh",
            role: "CLUSTER_MANAGER",
        });
        expect(branches).toEqual([JODHPUR, JAIPUR]);
        // Insertion order (asc) is what the picker should show, so the user
        // sees their first assignment first — predictable, not "newest wins".
        expect(cmFindMany).toHaveBeenCalledWith(
            expect.objectContaining({
                orderBy: { assignedAt: "asc" },
            }),
        );
    });

    it("returns empty array for users with no assignments", async () => {
        cmFindMany.mockResolvedValueOnce([]);
        const branches = await resolveAllScopeBranches({
            userId: "u-new",
            role: "CLUSTER_MANAGER",
        });
        expect(branches).toEqual([]);
    });
});

describe("Detached-state CM (post detach-on-promote) — promoted user with no employee anchor", () => {
    it("CM with departmentId=null AND User.branchId=null still resolves via the assignment table", async () => {
        // After the detach-on-promote fix, an employee promoted to CM has
        // their User.departmentId / User.branchId nulled. Branch resolution
        // for CM never reads those fields anyway — it consults the assignment
        // table by composite key. This test pins that contract: a "clean"
        // user with no anchors still gets the right branch.
        cmFindUnique.mockResolvedValueOnce({ branch: JODHPUR });
        const out = await resolveScopeBranch({
            userId: "u-rajesh-detached",
            role: "CLUSTER_MANAGER",
            branchId: JODHPUR.id,
        });
        expect(out.branch).toEqual(JODHPUR);
        // The lookup uses ONLY (cmUserId, branchId) — no fallback to user.branchId.
        expect(cmFindUnique).toHaveBeenCalledWith({
            where: { cmUserId_branchId: { cmUserId: "u-rajesh-detached", branchId: JODHPUR.id } },
            select: { branch: { select: { id: true, name: true, branchType: true } } },
        });
    });
});

describe("Multi-branch picker contract (regression guards)", () => {
    it("Rajesh assigned ONLY to Jodhpur, JWT says Jaipur → no branch (caller 403s)", async () => {
        // The exact scenario from the original bug report. After the fix, a
        // forged/stale JWT cannot resolve another branch.
        cmFindUnique.mockResolvedValueOnce(null);
        const out = await resolveScopeBranch({
            userId: "u-rajesh",
            role: "CLUSTER_MANAGER",
            branchId: JAIPUR.id,
        });
        expect(out.branch).toBeNull();
    });

    it("Rajesh on Jodhpur AND Jaipur, JWT says Jodhpur → Jodhpur only", async () => {
        cmFindUnique.mockResolvedValueOnce({ branch: JODHPUR });
        const out = await resolveScopeBranch({
            userId: "u-rajesh",
            role: "CLUSTER_MANAGER",
            branchId: JODHPUR.id,
        });
        expect(out.branch).toEqual(JODHPUR);
    });

    it("Rajesh on Jodhpur AND Jaipur, JWT says Jaipur → Jaipur only", async () => {
        cmFindUnique.mockResolvedValueOnce({ branch: JAIPUR });
        const out = await resolveScopeBranch({
            userId: "u-rajesh",
            role: "CLUSTER_MANAGER",
            branchId: JAIPUR.id,
        });
        expect(out.branch).toEqual(JAIPUR);
    });
});
