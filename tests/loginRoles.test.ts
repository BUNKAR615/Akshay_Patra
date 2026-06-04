import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Unit tests for the multi-role "Continue as …" login flow.
 *
 *   - computeOfferedRoles: decides whether the login page shows the picker. A
 *     length > 1 result means the user can act as more than one role (e.g. a
 *     Cluster Manager who is also a Committee member).
 *   - resolveRoleScope: builds the branch/department scope embedded in the JWT
 *     for the chosen role, identical for a direct login and a picked role.
 */

const bmFindUnique = vi.fn();
const cmFindFirst = vi.fn();
const hrFindFirst = vi.fn();
const committeeFindFirst = vi.fn();
const hodFindFirst = vi.fn();
const hodFindMany = vi.fn();
const cmFindMany = vi.fn();
const hrFindMany = vi.fn();
const committeeFindMany = vi.fn();
const bmFindUniqueForScope = vi.fn();

vi.mock("../lib/prisma", () => ({
    default: {
        branchManagerAssignment: {
            findUnique: (args: any) => bmFindUnique(args),
        },
        clusterManagerBranchAssignment: {
            findFirst: (args: any) => cmFindFirst(args),
            findMany: (args: any) => cmFindMany(args),
        },
        hrBranchAssignment: {
            findFirst: (args: any) => hrFindFirst(args),
            findMany: (args: any) => hrFindMany(args),
        },
        committeeBranchAssignment: {
            findFirst: (args: any) => committeeFindFirst(args),
            findMany: (args: any) => committeeFindMany(args),
        },
        hodAssignment: {
            findFirst: (args: any) => hodFindFirst(args),
            findMany: (args: any) => hodFindMany(args),
        },
    },
}));

// resolveAllScopeBranches (used by resolveRoleScope for BM/CM/HR/COMMITTEE)
// reads the assignment tables via findMany; BM via findUnique on the
// `branch` relation. Stub it directly to keep this test focused.
vi.mock("../lib/auth/resolveScopeBranch.js", () => ({
    resolveAllScopeBranches: (args: any) => bmFindUniqueForScope(args),
}));

import { computeOfferedRoles, resolveRoleScope } from "../lib/auth/loginRoles.js";

const JODHPUR = { id: "branch-jodhpur", name: "Jodhpur", branchType: "BIG" };
const JAIPUR = { id: "branch-jaipur", name: "Jaipur", branchType: "BIG" };

beforeEach(() => {
    bmFindUnique.mockReset().mockResolvedValue(null);
    cmFindFirst.mockReset().mockResolvedValue(null);
    hrFindFirst.mockReset().mockResolvedValue(null);
    committeeFindFirst.mockReset().mockResolvedValue(null);
    hodFindFirst.mockReset().mockResolvedValue(null);
    hodFindMany.mockReset().mockResolvedValue([]);
    cmFindMany.mockReset().mockResolvedValue([]);
    hrFindMany.mockReset().mockResolvedValue([]);
    committeeFindMany.mockReset().mockResolvedValue([]);
    bmFindUniqueForScope.mockReset().mockResolvedValue([]);
});

describe("computeOfferedRoles — picker decision", () => {
    it("normal employee → only EMPLOYEE, no DB lookups", async () => {
        const out = await computeOfferedRoles({ id: "u-emp" }, "EMPLOYEE");
        expect(out).toEqual(["EMPLOYEE"]);
        expect(committeeFindFirst).not.toHaveBeenCalled();
    });

    it("Cluster Manager who is ALSO on the committee → [CLUSTER_MANAGER, COMMITTEE]", async () => {
        committeeFindFirst.mockResolvedValueOnce({ id: "c1" });
        const out = await computeOfferedRoles({ id: "u-cm" }, "CLUSTER_MANAGER");
        expect(out).toEqual(["CLUSTER_MANAGER", "COMMITTEE"]);
    });

    it("Cluster Manager with no committee membership → [CLUSTER_MANAGER]", async () => {
        committeeFindFirst.mockResolvedValueOnce(null);
        const out = await computeOfferedRoles({ id: "u-cm" }, "CLUSTER_MANAGER");
        expect(out).toEqual(["CLUSTER_MANAGER"]);
    });

    it("Branch Manager who is ALSO on the committee → [BRANCH_MANAGER, COMMITTEE]", async () => {
        committeeFindFirst.mockResolvedValueOnce({ id: "c1" });
        const out = await computeOfferedRoles({ id: "u-bm" }, "BRANCH_MANAGER");
        expect(out).toEqual(["BRANCH_MANAGER", "COMMITTEE"]);
    });

    it("HR with no committee membership → [HR]", async () => {
        const out = await computeOfferedRoles({ id: "u-hr" }, "HR");
        expect(out).toEqual(["HR"]);
    });

    it("Committee member who ALSO holds a CM assignment → [COMMITTEE, CLUSTER_MANAGER]", async () => {
        cmFindFirst.mockResolvedValueOnce({ id: "cm1" });
        const out = await computeOfferedRoles({ id: "u-dual" }, "COMMITTEE");
        expect(out).toEqual(["COMMITTEE", "CLUSTER_MANAGER"]);
    });

    it("pure committee member → [COMMITTEE]", async () => {
        const out = await computeOfferedRoles({ id: "u-comm" }, "COMMITTEE");
        expect(out).toEqual(["COMMITTEE"]);
    });

    it("Admin with an active HOD assignment → [ADMIN, HOD] (legacy picker)", async () => {
        hodFindFirst.mockResolvedValueOnce({ id: "h1" });
        const out = await computeOfferedRoles({ id: "u-admin", passwordHod: "hash" }, "ADMIN");
        expect(out).toEqual(["ADMIN", "HOD"]);
    });

    it("Admin with no HOD assignment → [ADMIN]", async () => {
        const out = await computeOfferedRoles({ id: "u-admin", passwordHod: "hash" }, "ADMIN");
        expect(out).toEqual(["ADMIN"]);
    });
});

describe("resolveRoleScope — JWT scope for the chosen role", () => {
    it("COMMITTEE → first assigned branch, no department scope", async () => {
        bmFindUniqueForScope.mockResolvedValueOnce([JODHPUR, JAIPUR]);
        const out = await resolveRoleScope("u-comm", "COMMITTEE", {});
        expect(out).toEqual({
            branchId: JODHPUR.id,
            branchType: JODHPUR.branchType,
            branchName: JODHPUR.name,
            departmentIds: [],
        });
    });

    it("CLUSTER_MANAGER with no assignment → error (caller 401s)", async () => {
        bmFindUniqueForScope.mockResolvedValueOnce([]);
        const out = await resolveRoleScope("u-cm", "CLUSTER_MANAGER", {});
        expect((out as any).error).toMatch(/No branch assignment/i);
    });

    it("EMPLOYEE → department's branch + its departmentId", async () => {
        const user = {
            departmentId: "dept-1",
            department: { branchId: "branch-x", branch: { id: "branch-x", name: "X", branchType: "SMALL" } },
        };
        const out = await resolveRoleScope("u-emp", "EMPLOYEE", user);
        expect(out).toEqual({
            branchId: "branch-x",
            branchType: "SMALL",
            branchName: "X",
            departmentIds: ["dept-1"],
        });
    });

    it("HOD → branch + departments from active-quarter HOD assignments", async () => {
        hodFindMany.mockResolvedValueOnce([
            { departmentId: "dept-a", branch: JODHPUR },
            { departmentId: "dept-b", branch: JODHPUR },
        ]);
        const out = await resolveRoleScope("u-hod", "HOD", { departmentId: "dept-a" });
        expect(out).toEqual({
            branchId: JODHPUR.id,
            branchType: JODHPUR.branchType,
            branchName: JODHPUR.name,
            departmentIds: ["dept-a", "dept-b"],
        });
    });
});
