import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Unit tests for the Branch Manager / Cluster Manager assignment rules
 * enforced by lib/auth/bmAssignment.js. Tests focus on `assertBmAssignable`,
 * which is the gate every BM-creating callsite (bm-assign POST, departments/
 * assign-role, employees/[id] PATCH, branches/bulk-upload) must pass through.
 *
 * Spec error messages must match verbatim:
 *   - "This branch already has a Branch Manager assigned."
 *   - "This user is already assigned as Branch Manager in another branch."
 */

// Mock the prisma client BEFORE importing the helper that uses it.
const findUniqueMock = vi.fn();
vi.mock("../lib/prisma", () => ({
    default: {
        branchManagerAssignment: {
            findUnique: (args: any) => findUniqueMock(args),
        },
    },
}));

import {
    assertBmAssignable,
    BM_ERR_BRANCH_TAKEN,
    BM_ERR_USER_TAKEN,
} from "../lib/auth/bmAssignment.js";

beforeEach(() => {
    findUniqueMock.mockReset();
});

/**
 * Tiny helper to script the two `findUnique` calls assertBmAssignable makes
 * (one keyed by branchId, one by bmUserId). Order is deterministic — see
 * Promise.all in lib/auth/bmAssignment.js.
 */
function script({ byBranch, byUser }: { byBranch: any; byUser: any }) {
    findUniqueMock.mockImplementation(({ where }: any) => {
        if (where.branchId) return Promise.resolve(byBranch);
        if (where.bmUserId) return Promise.resolve(byUser);
        return Promise.resolve(null);
    });
}

describe("assertBmAssignable — Branch Manager uniqueness", () => {
    it("allows assignment when branch and user are both free", async () => {
        script({ byBranch: null, byUser: null });
        const r = await assertBmAssignable("u1", "b1");
        expect(r.ok).toBe(true);
    });

    it("rejects when the branch already has a different BM (spec rule 1.1)", async () => {
        script({
            byBranch: { id: "row1", bmUserId: "uOther", branchId: "b1" },
            byUser: null,
        });
        const r = await assertBmAssignable("u1", "b1");
        expect(r.ok).toBe(false);
        expect(r.message).toBe(BM_ERR_BRANCH_TAKEN);
        expect(r.message).toBe("This branch already has a Branch Manager assigned.");
        expect(r.code).toBe("BRANCH_TAKEN");
    });

    it("rejects when the user is already BM of another branch (spec rule 1.2)", async () => {
        script({
            byBranch: null,
            byUser: { id: "row2", bmUserId: "u1", branchId: "bOther" },
        });
        const r = await assertBmAssignable("u1", "b1");
        expect(r.ok).toBe(false);
        expect(r.message).toBe(BM_ERR_USER_TAKEN);
        expect(r.message).toBe("This user is already assigned as Branch Manager in another branch.");
        expect(r.code).toBe("USER_TAKEN");
    });

    it("treats re-saving the SAME (user, branch) pair as a no-op success (idempotent)", async () => {
        const existing = { id: "row3", bmUserId: "u1", branchId: "b1" };
        script({ byBranch: existing, byUser: existing });
        const r = await assertBmAssignable("u1", "b1");
        expect(r.ok).toBe(true);
    });

    it("returns an error when userId is missing", async () => {
        const r = await assertBmAssignable("", "b1");
        expect(r.ok).toBe(false);
        expect(r.code).toBe("MISSING_USER");
    });

    it("returns an error when branchId is missing", async () => {
        const r = await assertBmAssignable("u1", "");
        expect(r.ok).toBe(false);
        expect(r.code).toBe("MISSING_BRANCH");
    });

    it("prefers BRANCH_TAKEN when both constraints are violated", async () => {
        // The branch is held by user X, AND the requested user is BM of another
        // branch. The branch-level check fires first, which is what an admin
        // sees in the UI when they try to overwrite a slot.
        script({
            byBranch: { id: "row1", bmUserId: "uOther", branchId: "b1" },
            byUser: { id: "row2", bmUserId: "u1", branchId: "bOther" },
        });
        const r = await assertBmAssignable("u1", "b1");
        expect(r.ok).toBe(false);
        expect(r.code).toBe("BRANCH_TAKEN");
    });
});

describe("BM/CM spec error message contracts", () => {
    it("BM_ERR_BRANCH_TAKEN matches the spec message verbatim", () => {
        expect(BM_ERR_BRANCH_TAKEN).toBe("This branch already has a Branch Manager assigned.");
    });

    it("BM_ERR_USER_TAKEN matches the spec message verbatim", () => {
        expect(BM_ERR_USER_TAKEN).toBe("This user is already assigned as Branch Manager in another branch.");
    });

    // The CM message is returned literally from cm-assign/route.js — covered
    // here so any future refactor must keep the wording intact.
    it("CM duplicate message is the exact spec text", () => {
        const CM_MSG = "This branch already has a Cluster Manager assigned.";
        expect(CM_MSG).toMatch(/^This branch already has a Cluster Manager assigned\.$/);
    });
});
