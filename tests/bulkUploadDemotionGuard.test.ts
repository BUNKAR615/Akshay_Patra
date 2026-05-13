import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Refuse-to-demote contract for bulk-upload.
 *
 * Scenario this guards against:
 *   Rajesh is currently CLUSTER_MANAGER of Jodhpur. The Jaipur Excel sheet
 *   still lists him as an EMPLOYEE row (because he hasn't been removed
 *   from the source-of-truth spreadsheet). Re-uploading Jaipur would, without
 *   this guard, silently overwrite Rajesh's User row with role=EMPLOYEE,
 *   branchId=Jaipur, password=hash(empCode) — clobbering the CM assignment.
 *
 * The guard rejects the WHOLE upload (consistent with the existing BM/CM
 * duplicate-row checks), forcing the admin to either remove the row from
 * the sheet or first un-assign the role via Org Structure.
 */

const userFindMany = vi.fn();
vi.mock("../lib/prisma", () => ({
    default: {
        user: {
            findMany: (args: any) => userFindMany(args),
        },
    },
}));

import { findRoleHolderConflicts, buildRoleHolderConflictMessage } from "../lib/auth/bulkUploadDemotionGuard.js";

beforeEach(() => {
    userFindMany.mockReset();
});

describe("findRoleHolderConflicts", () => {
    it("returns no conflicts when no row's empCode matches a current role-holder", async () => {
        userFindMany.mockResolvedValueOnce([]);
        const out = await findRoleHolderConflicts([
            { empCode: "1800001", rowNum: 5 },
            { empCode: "1800002", rowNum: 6 },
        ]);
        expect(out.blocked).toEqual([]);
        expect(out.offendingRows).toEqual([]);
    });

    it("flags an EMPLOYEE row whose empCode is already a CLUSTER_MANAGER", async () => {
        // Rajesh is CM of Jodhpur. Jaipur sheet lists him as an EMPLOYEE row.
        userFindMany.mockResolvedValueOnce([
            { empCode: "1800012", name: "Rajesh Kumar Sharma", role: "CLUSTER_MANAGER" },
        ]);
        const out = await findRoleHolderConflicts([
            { empCode: "1800001", rowNum: 5 },
            { empCode: "1800012", rowNum: 12 },
            { empCode: "1800099", rowNum: 13 },
        ]);
        expect(out.blocked).toHaveLength(1);
        expect(out.blocked[0]).toEqual({ empCode: "1800012", name: "Rajesh Kumar Sharma", role: "CLUSTER_MANAGER" });
        expect(out.offendingRows).toEqual(["row 12 (1800012)"]);
    });

    it("flags multiple conflicts in the same upload", async () => {
        userFindMany.mockResolvedValueOnce([
            { empCode: "1800012", name: "Rajesh", role: "CLUSTER_MANAGER" },
            { empCode: "1800020", name: "Suman", role: "HR" },
            { empCode: "1800030", name: "Anil", role: "BRANCH_MANAGER" },
        ]);
        const out = await findRoleHolderConflicts([
            { empCode: "1800012", rowNum: 12 },
            { empCode: "1800020", rowNum: 20 },
            { empCode: "1800030", rowNum: 30 },
            { empCode: "1800099", rowNum: 31 }, // not a role-holder
        ]);
        expect(out.blocked).toHaveLength(3);
        expect(out.offendingRows).toEqual(["row 12 (1800012)", "row 20 (1800020)", "row 30 (1800030)"]);
    });

    it("queries by composite OR — role-by-name OR any assignment-table row", async () => {
        // The query must catch both "User.role is staff" and "user has a row in
        // any assignment table" — the latter covers users whose role somehow
        // got reset to EMPLOYEE but who still own an assignment.
        userFindMany.mockResolvedValueOnce([]);
        await findRoleHolderConflicts([{ empCode: "1800012", rowNum: 12 }]);
        const args = userFindMany.mock.calls[0][0];
        expect(args.where.empCode).toEqual({ in: ["1800012"] });
        const orClauses = args.where.OR;
        expect(orClauses).toEqual(
            expect.arrayContaining([
                { role: { in: ["BRANCH_MANAGER", "CLUSTER_MANAGER", "HR", "COMMITTEE"] } },
                { bmAssignment: { isNot: null } },
                { cmBranchAssignments: { some: {} } },
                { hrBranchAssignments: { some: {} } },
                { committeeBranchAssignments: { some: {} } },
            ]),
        );
    });

    it("short-circuits with no DB call when there are no rows to check", async () => {
        const out = await findRoleHolderConflicts([]);
        expect(out.blocked).toEqual([]);
        expect(userFindMany).not.toHaveBeenCalled();
    });
});

describe("buildRoleHolderConflictMessage", () => {
    it("includes empCode, name, current role, and source row numbers in the conflict message", async () => {
        const blocked = [{ empCode: "1800012", name: "Rajesh Kumar Sharma", role: "CLUSTER_MANAGER" }];
        const offendingRows = ["row 12 (1800012)"];
        const msg = buildRoleHolderConflictMessage(blocked, offendingRows);
        expect(msg).toContain("1800012");
        expect(msg).toContain("Rajesh Kumar Sharma");
        expect(msg).toContain("CLUSTER_MANAGER");
        expect(msg).toContain("row 12 (1800012)");
        // Admin must be told what to do next.
        expect(msg).toContain("Organizational Structure");
    });
});
