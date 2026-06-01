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

// Mock prisma BEFORE importing the helpers. syncLegacyBmDepartmentCache runs
// post-commit on the top-level prisma client (NOT the tx), so the legacy
// department/role-mapping writes are stubbed here.
const { prismaDeptFindUnique, prismaDeptUpdate, prismaDrmUpsert } = vi.hoisted(() => ({
    prismaDeptFindUnique: vi.fn(),
    prismaDeptUpdate: vi.fn(),
    prismaDrmUpsert: vi.fn(),
}));
vi.mock("../lib/prisma", () => ({
    default: {
        branchManagerAssignment: { findUnique: vi.fn() },
        department: { findUnique: prismaDeptFindUnique, update: prismaDeptUpdate },
        departmentRoleMapping: { upsert: prismaDrmUpsert },
    },
}));

import { applyBmAssignment, syncLegacyBmDepartmentCache } from "../lib/auth/bmAssignment.js";

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

    it("returns the prior departmentId so the caller can drive the legacy sync", async () => {
        ctx.spies.userFindUnique.mockResolvedValueOnce({ departmentId: "dept-jaipur-ops" });

        const result = await applyBmAssignment(ctx.tx, {
            userId: "u-rajesh",
            branchId: "branch-jodhpur",
            assignedBy: "admin-1",
        });

        expect(result.priorDepartmentId).toBe("dept-jaipur-ops");
        // The authoritative write must NOT touch legacy department state — that
        // is deferred to the post-commit syncLegacyBmDepartmentCache.
        expect(ctx.spies.deptUpdate).not.toHaveBeenCalled();
        expect(ctx.spies.deptRoleMappingUpsert).not.toHaveBeenCalled();
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

describe("syncLegacyBmDepartmentCache — post-commit best-effort", () => {
    beforeEach(() => {
        prismaDeptFindUnique.mockReset();
        prismaDeptUpdate.mockReset();
        prismaDrmUpsert.mockReset();
    });

    it("no-ops when there is no prior department", async () => {
        await syncLegacyBmDepartmentCache({ userId: "u-rajesh", branchId: "branch-jodhpur", priorDepartmentId: null });
        expect(prismaDeptFindUnique).not.toHaveBeenCalled();
        expect(prismaDeptUpdate).not.toHaveBeenCalled();
        expect(prismaDrmUpsert).not.toHaveBeenCalled();
    });

    it("does NOT write when prior dept is in a DIFFERENT branch", async () => {
        prismaDeptFindUnique.mockResolvedValueOnce({ id: "dept-jaipur-ops", branchId: "branch-jaipur", branchManagerId: null });

        await syncLegacyBmDepartmentCache({ userId: "u-rajesh", branchId: "branch-jodhpur", priorDepartmentId: "dept-jaipur-ops" });

        expect(prismaDeptUpdate).not.toHaveBeenCalled();
        expect(prismaDrmUpsert).not.toHaveBeenCalled();
    });

    it("syncs Department.branchManagerId + DepartmentRoleMapping when prior dept IS in the new branch", async () => {
        prismaDeptFindUnique.mockResolvedValueOnce({ id: "dept-jodhpur-ops", branchId: "branch-jodhpur", branchManagerId: null });

        await syncLegacyBmDepartmentCache({ userId: "u-rajesh", branchId: "branch-jodhpur", priorDepartmentId: "dept-jodhpur-ops" });

        expect(prismaDeptUpdate).toHaveBeenCalledWith({
            where: { id: "dept-jodhpur-ops" },
            data: { branchManagerId: "u-rajesh" },
        });
        expect(prismaDrmUpsert).toHaveBeenCalledTimes(1);
    });

    it("never throws when the legacy write fails (failure is swallowed)", async () => {
        prismaDeptFindUnique.mockRejectedValueOnce(Object.assign(new Error("boom"), { code: "P2002" }));

        await expect(
            syncLegacyBmDepartmentCache({ userId: "u-rajesh", branchId: "branch-jodhpur", priorDepartmentId: "dept-x" })
        ).resolves.toBeUndefined();
    });
});
