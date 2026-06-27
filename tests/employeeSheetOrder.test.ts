import { describe, it, expect } from "vitest";
import { sheetRoleRank, compareForSheet } from "../lib/employeeSheetOrder.js";

/**
 * Spec rule 7 — branch employee sheets always begin with role-holders in a
 * fixed order, then regular employees:
 *   Branch Manager · Cluster Manager · HR Personnel · Committee · HOD · Employee
 */
describe("sheetRoleRank", () => {
    it("ranks role-holders in the spec order", () => {
        expect(sheetRoleRank("BRANCH_MANAGER")).toBe(0);
        expect(sheetRoleRank("CLUSTER_MANAGER")).toBe(1);
        expect(sheetRoleRank("HR")).toBe(2);
        expect(sheetRoleRank("COMMITTEE")).toBe(3);
        expect(sheetRoleRank("HOD")).toBe(4);
        expect(sheetRoleRank("EMPLOYEE")).toBe(5);
        expect(sheetRoleRank("ADMIN")).toBe(5);
    });

    it("uses the MOST senior role when several are held", () => {
        expect(sheetRoleRank(["EMPLOYEE", "CLUSTER_MANAGER"])).toBe(1);
        expect(sheetRoleRank(["COMMITTEE", "HR"])).toBe(2);
        expect(sheetRoleRank([])).toBe(5);
    });
});

describe("compareForSheet", () => {
    it("orders a mixed sheet BM → CM → HR → Committee → HOD → employees, then by name", () => {
        const rows = [
            { name: "Zoya", role: "EMPLOYEE" },
            { name: "Bhanu", displayRoles: ["HR"] },
            { name: "Amit", displayRoles: ["BRANCH_MANAGER"] },
            { name: "Charu", role: "EMPLOYEE" },
            { name: "Deepak", displayRoles: ["CLUSTER_MANAGER"] },
            { name: "Esha", displayRoles: ["COMMITTEE"] },
            { name: "Farid", role: "HOD" },
        ];
        const ordered = [...rows].sort(compareForSheet).map((r) => r.name);
        expect(ordered).toEqual(["Amit", "Deepak", "Bhanu", "Esha", "Farid", "Charu", "Zoya"]);
    });

    it("prefers branch-relative displayRoles over the base role", () => {
        // A Jaipur employee visiting Nathdwara as Cluster Manager: base role is
        // EMPLOYEE but in THIS branch they wear the CM hat and sort as a CM.
        const visitingCm = { name: "Deepak", role: "EMPLOYEE", displayRoles: ["CLUSTER_MANAGER"] };
        const localEmp = { name: "Aarti", role: "EMPLOYEE", displayRoles: ["EMPLOYEE"] };
        expect([localEmp, visitingCm].sort(compareForSheet).map((r) => r.name)).toEqual(["Deepak", "Aarti"]);
    });
});
