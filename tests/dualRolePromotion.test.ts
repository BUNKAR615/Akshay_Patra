import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Detach-on-promote contract for dual-role users.
 *
 * Scenario the system must support:
 *   Rajesh exists as a regular EMPLOYEE in Jaipur (User.role=EMPLOYEE,
 *   User.departmentId=<jaipur-dept>, User.branchId=<jaipur>). Admin promotes
 *   him to Cluster Manager of Jodhpur via the Org Structure page. After
 *   promotion, his User row must be detached from the Jaipur anchors so:
 *     1. He no longer appears in the Jaipur employee list.
 *     2. A re-upload of the Jaipur Excel cannot silently demote him back.
 *     3. Login resolves him exclusively as the Jodhpur CM.
 *
 * This file exercises the BM detach contract through `applyBmAssignment`
 * (a pure helper that takes a tx mock). The CM/HR/Committee assign routes
 * follow the same shape — see route handlers for the equivalent block.
 */

// Mock prisma BEFORE importing applyBmAssignment.
vi.mock("../lib/prisma", () => ({
    default: {
        branchManagerAssignment: { findUnique: vi.fn() },
    },
}));

import { applyBmAssignment } from "../lib/auth/bmAssignment.js";

function makeTx() {
    const userUpdate = vi.fn().mockResolvedValue({ id: "u-rajesh", departmentId: null });
    const userFindUnique = vi.fn();
    const bmUpsert = vi.fn().mockImplementation(({ create, update, where, include }) =>
        Promise.resolve({
            id: "bma-1",
            bmUserId: create?.bmUserId ?? where?.branchId,
            branchId: where?.branchId,
            bm: { id: "u-rajesh", empCode: "1800012", name: "Rajesh Kumar Sharma", mobile: null, role: "BRANCH_MANAGER" },
        })
    );
    const deptFindUnique = vi.fn();
    const deptUpdate = vi.fn();
    const deptRoleMappingUpsert = vi.fn();

    return {
        tx: {
            user: { update: userUpdate, findUnique: userFindUnique },
            branchManagerAssignment: { upsert: bmUpsert },
            department: { findUnique: deptFindUnique, update: deptUpdate },
            departmentRoleMapping: { upsert: deptRoleMappingUpsert },
        },
        spies: { userUpdate, userFindUnique, bmUpsert, deptFindUnique, deptUpdate, deptRoleMappingUpsert },
    };
}

describe("applyBmAssignment — detach-on-promote", () => {
    let ctx: ReturnType<typeof makeTx>;

    beforeEach(() => {
        ctx = makeTx();
    });

    it("nulls departmentId, passwordHod, collarType when promoting an existing employee to BM", async () => {
        // Rajesh is currently an EMPLOYEE with a Jaipur department anchor.
        ctx.spies.userFindUnique.mockResolvedValueOnce({ departmentId: "dept-jaipur-ops" });
        ctx.spies.deptFindUnique.mockResolvedValueOnce(null); // dept lookup ignored — diff branch

        await applyBmAssignment(ctx.tx, {
            userId: "u-rajesh",
            branchId: "branch-jodhpur",
            assignedBy: "admin-1",
            passwordHash: "hash-rajesh-12",
        });

        expect(ctx.spies.userUpdate).toHaveBeenCalledTimes(1);
        const updateArgs = ctx.spies.userUpdate.mock.calls[0][0];
        expect(updateArgs.where).toEqual({ id: "u-rajesh" });
        expect(updateArgs.data).toMatchObject({
            role: "BRANCH_MANAGER",
            branchId: "branch-jodhpur",
            departmentId: null,
            passwordHod: null,
            collarType: null,
            password: "hash-rajesh-12",
        });
    });

    it("creates the BranchManagerAssignment row keyed by branchId", async () => {
        ctx.spies.userFindUnique.mockResolvedValueOnce({ departmentId: null });

        await applyBmAssignment(ctx.tx, {
            userId: "u-rajesh",
            branchId: "branch-jodhpur",
            assignedBy: "admin-1",
        });

        expect(ctx.spies.bmUpsert).toHaveBeenCalledTimes(1);
        const upsertArgs = ctx.spies.bmUpsert.mock.calls[0][0];
        expect(upsertArgs.where).toEqual({ branchId: "branch-jodhpur" });
        expect(upsertArgs.create).toEqual({ bmUserId: "u-rajesh", branchId: "branch-jodhpur", assignedBy: "admin-1" });
    });

    it("does not write to legacy department cache when prior dept was in a DIFFERENT branch", async () => {
        // Rajesh's prior department is in Jaipur, but he's becoming BM of
        // Jodhpur — the legacy department cache only matters when the dept
        // belongs to the new branch.
        ctx.spies.userFindUnique.mockResolvedValueOnce({ departmentId: "dept-jaipur-ops" });
        ctx.spies.deptFindUnique.mockResolvedValueOnce({
            id: "dept-jaipur-ops",
            branchId: "branch-jaipur",
            branchManagerId: null,
        });

        await applyBmAssignment(ctx.tx, {
            userId: "u-rajesh",
            branchId: "branch-jodhpur",
            assignedBy: "admin-1",
        });

        // Departments in another branch must not be touched.
        expect(ctx.spies.deptUpdate).not.toHaveBeenCalled();
        expect(ctx.spies.deptRoleMappingUpsert).not.toHaveBeenCalled();
    });

    it("syncs legacy department cache when prior dept IS in the new branch", async () => {
        // Edge case: BM was already in a Jodhpur department, now becoming
        // Jodhpur's BM. Department.branchManagerId still needs the link.
        ctx.spies.userFindUnique.mockResolvedValueOnce({ departmentId: "dept-jodhpur-ops" });
        ctx.spies.deptFindUnique.mockResolvedValueOnce({
            id: "dept-jodhpur-ops",
            branchId: "branch-jodhpur",
            branchManagerId: null,
        });

        await applyBmAssignment(ctx.tx, {
            userId: "u-rajesh",
            branchId: "branch-jodhpur",
            assignedBy: "admin-1",
        });

        expect(ctx.spies.deptUpdate).toHaveBeenCalledWith({
            where: { id: "dept-jodhpur-ops" },
            data: { branchManagerId: "u-rajesh" },
        });
        expect(ctx.spies.deptRoleMappingUpsert).toHaveBeenCalledTimes(1);
    });

    it("skips password reset when no passwordHash is supplied (still detaches)", async () => {
        ctx.spies.userFindUnique.mockResolvedValueOnce({ departmentId: null });

        await applyBmAssignment(ctx.tx, {
            userId: "u-rajesh",
            branchId: "branch-jodhpur",
            assignedBy: "admin-1",
            // no passwordHash
        });

        const updateArgs = ctx.spies.userUpdate.mock.calls[0][0];
        // password key absent — but detach fields still nulled.
        expect(updateArgs.data.password).toBeUndefined();
        expect(updateArgs.data).toMatchObject({
            departmentId: null,
            passwordHod: null,
            collarType: null,
        });
    });
});
