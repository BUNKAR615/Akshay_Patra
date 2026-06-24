import { describe, it, expect } from "vitest";
// @ts-ignore — plain JS module
import { resolveBranchDisplayRoles } from "../lib/branchRoleDisplay.js";

const JAIPUR = { id: "branch_jaipur", name: "Jaipur" };
const BARAN = { id: "branch_baran", name: "Baran" };

describe("resolveBranchDisplayRoles — Amit Keshwa (Jaipur employee, CM for Jaipur + Baran)", () => {
    it("home branch (Jaipur): shows base employment + the role(s) held here", () => {
        const r = resolveBranchDisplayRoles({
            viewingBranchId: JAIPUR.id,
            baseRole: "EMPLOYEE",
            originalBranch: JAIPUR,
            assignedRoles: ["CLUSTER_MANAGER"],
        });
        expect(r.isHomeBranch).toBe(true);
        expect(r.displayRoles).toEqual(["EMPLOYEE", "CLUSTER_MANAGER"]);
    });

    it("other branch (Baran): shows ONLY the assigned role, not the base employment", () => {
        const r = resolveBranchDisplayRoles({
            viewingBranchId: BARAN.id,
            baseRole: "EMPLOYEE",
            originalBranch: JAIPUR, // home branch stays Jaipur
            assignedRoles: ["CLUSTER_MANAGER"],
        });
        expect(r.isHomeBranch).toBe(false);
        expect(r.displayRoles).toEqual(["CLUSTER_MANAGER"]);
    });
});

describe("resolveBranchDisplayRoles — general rules", () => {
    it("plain employee in home branch shows just EMPLOYEE", () => {
        const r = resolveBranchDisplayRoles({
            viewingBranchId: JAIPUR.id,
            baseRole: "EMPLOYEE",
            originalBranch: JAIPUR,
            assignedRoles: [],
        });
        expect(r).toEqual({ isHomeBranch: true, displayRoles: ["EMPLOYEE"] });
    });

    it("dedupes when base role equals the assigned role (BM in own branch)", () => {
        const r = resolveBranchDisplayRoles({
            viewingBranchId: JAIPUR.id,
            baseRole: "BRANCH_MANAGER",
            originalBranch: JAIPUR,
            assignedRoles: ["BRANCH_MANAGER"],
        });
        expect(r.displayRoles).toEqual(["BRANCH_MANAGER"]);
    });

    it("a person holding multiple hats in their home branch shows all of them", () => {
        const r = resolveBranchDisplayRoles({
            viewingBranchId: JAIPUR.id,
            baseRole: "EMPLOYEE",
            originalBranch: JAIPUR,
            assignedRoles: ["HR", "COMMITTEE"],
        });
        expect(r.displayRoles).toEqual(["EMPLOYEE", "HR", "COMMITTEE"]);
    });

    it("HR serving a non-home branch shows HR only, home branch preserved separately", () => {
        const r = resolveBranchDisplayRoles({
            viewingBranchId: BARAN.id,
            baseRole: "HR",
            originalBranch: JAIPUR,
            assignedRoles: ["HR"],
        });
        expect(r.isHomeBranch).toBe(false);
        expect(r.displayRoles).toEqual(["HR"]);
    });

    it("falls back to the base role when no assignment is supplied and it's not home", () => {
        const r = resolveBranchDisplayRoles({
            viewingBranchId: BARAN.id,
            baseRole: "CLUSTER_MANAGER",
            originalBranch: JAIPUR,
            assignedRoles: [],
        });
        expect(r.displayRoles).toEqual(["CLUSTER_MANAGER"]);
    });

    it("treats a null original branch as not-home", () => {
        const r = resolveBranchDisplayRoles({
            viewingBranchId: JAIPUR.id,
            baseRole: "COMMITTEE",
            originalBranch: null,
            assignedRoles: ["COMMITTEE"],
        });
        expect(r.isHomeBranch).toBe(false);
        expect(r.displayRoles).toEqual(["COMMITTEE"]);
    });
});
