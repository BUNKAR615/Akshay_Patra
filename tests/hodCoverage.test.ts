import { describe, it, expect } from "vitest";
import { loadHodCoverage } from "../lib/hodCoverage";

function fakeDb({ links = [], evals = [] }: { links?: any[]; evals?: any[] }) {
    return {
        employeeHodAssignment: { findMany: async () => links },
        hodEvaluation: { findMany: async () => evals },
    };
}

describe("loadHodCoverage", () => {
    it("returns nothing when there are no BIG branches", async () => {
        const db = fakeDb({ links: [{ employeeId: "e1", hodUserId: "h1" }] });
        expect((await loadHodCoverage(db, { quarterId: "q", branchIds: [] })).size).toBe(0);
    });

    it("covers employees the BM attached to an HOD", async () => {
        const db = fakeDb({ links: [{ employeeId: "e1", hodUserId: "h1" }] });
        const cov = await loadHodCoverage(db, { quarterId: "q", branchIds: ["b"] });
        expect(cov.get("e1")).toBe("h1");
    });

    it("covers employees an HOD already evaluated even without a link (never back to the BM)", async () => {
        const db = fakeDb({ evals: [{ employeeId: "e2", hodId: "h2" }] });
        const cov = await loadHodCoverage(db, { quarterId: "q", branchIds: ["b"] });
        expect(cov.get("e2")).toBe("h2");
    });

    it("credits the HOD who actually evaluated over a later re-link", async () => {
        const db = fakeDb({
            links: [{ employeeId: "e3", hodUserId: "hNew" }],
            evals: [{ employeeId: "e3", hodId: "hOld" }],
        });
        const cov = await loadHodCoverage(db, { quarterId: "q", branchIds: ["b"] });
        expect(cov.get("e3")).toBe("hOld");
    });
});
