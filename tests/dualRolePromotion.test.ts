import { describe, it, expect, beforeEach, vi } from "vitest";
import bcrypt from "bcryptjs";

/**
 * Promote-to-Branch-Manager contract for `applyBmAssignment`.
 *
 * An employee always has ONE original (home) branch; a role is an assignment,
 * not a move. So promoting someone to Branch Manager must behave by case:
 *
 *   (1) EXISTING EMPLOYEE (has a department) → PRESERVE their home-branch
 *       identity and set up DUAL-LOGIN:
 *         - departmentId / collarType are left untouched (they stay in their
 *           home branch's employee list — spec rule 5);
 *         - password    = empCode      → employee dashboard (spec rule 3);
 *         - passwordHod = Firstname_## → Branch Manager dashboard.
 *
 *   (2) PURE STAFF (no department) → original detach-on-promote: staff formula
 *       is the primary password and the employee anchors stay null.
 *
 * The CM/HR/Committee assign routes follow the same shape — see those route
 * handlers for the equivalent block.
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

describe("applyBmAssignment — promote to Branch Manager", () => {
    let ctx: ReturnType<typeof makeTx>;

    beforeEach(() => {
        ctx = makeTx();
    });

    it("PRESERVES employee identity + sets dual-login when promoting an existing employee to BM", async () => {
        // Rajesh is currently an EMPLOYEE with a Jaipur department anchor.
        ctx.spies.userFindUnique.mockResolvedValueOnce({
            departmentId: "dept-jaipur-ops",
            empCode: "1800012",
            name: "Rajesh Kumar Sharma",
        });
        ctx.spies.deptFindUnique.mockResolvedValueOnce(null); // dept lookup ignored — diff branch

        await applyBmAssignment(ctx.tx, {
            userId: "u-rajesh",
            branchId: "branch-jodhpur",
            assignedBy: "admin-1",
            passwordHash: "hash-rajesh-12", // the staff-format ("Firstname_##") hash
        });

        expect(ctx.spies.userUpdate).toHaveBeenCalledTimes(1);
        const updateArgs = ctx.spies.userUpdate.mock.calls[0][0];
        expect(updateArgs.where).toEqual({ id: "u-rajesh" });
        // Home-branch identity preserved — departmentId / collarType NOT nulled.
        expect(updateArgs.data.departmentId).toBeUndefined();
        expect(updateArgs.data.collarType).toBeUndefined();
        // Role + managed branch set; staff hash routed to the SECONDARY password.
        expect(updateArgs.data.role).toBe("BRANCH_MANAGER");
        expect(updateArgs.data.branchId).toBe("branch-jodhpur");
        expect(updateArgs.data.passwordHod).toBe("hash-rajesh-12");
        // PRIMARY password is reset to a real bcrypt hash of the empCode so the
        // employee login keeps working.
        expect(typeof updateArgs.data.password).toBe("string");
        expect(updateArgs.data.password).not.toBe("hash-rajesh-12");
        expect(await bcrypt.compare("1800012", updateArgs.data.password)).toBe(true);
    });

    it("DETACHES a pure-staff BM (no department): staff formula is the primary password", async () => {
        ctx.spies.userFindUnique.mockResolvedValueOnce({ departmentId: null, empCode: "BM001", name: "Pure Staff" });

        await applyBmAssignment(ctx.tx, {
            userId: "u-rajesh",
            branchId: "branch-jodhpur",
            assignedBy: "admin-1",
            passwordHash: "hash-staff-01",
        });

        const updateArgs = ctx.spies.userUpdate.mock.calls[0][0];
        expect(updateArgs.data).toMatchObject({
            role: "BRANCH_MANAGER",
            branchId: "branch-jodhpur",
            departmentId: null,
            passwordHod: null,
            collarType: null,
            password: "hash-staff-01",
        });
    });

    it("creates the BranchManagerAssignment row keyed by branchId", async () => {
        ctx.spies.userFindUnique.mockResolvedValueOnce({ departmentId: null, empCode: "BM001", name: "Pure Staff" });

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
        ctx.spies.userFindUnique.mockResolvedValueOnce({
            departmentId: "dept-jaipur-ops",
            empCode: "1800012",
            name: "Rajesh Kumar Sharma",
        });

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

    it("skips primary-password reset for a pure-staff BM when no passwordHash is supplied (still detaches)", async () => {
        ctx.spies.userFindUnique.mockResolvedValueOnce({ departmentId: null, empCode: "BM001", name: "Pure Staff" });

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
