import { describe, it, expect, vi } from "vitest";

// The pure helpers never touch the DB; stub the client so importing the module
// (which also exports async DB wrappers) needs no database.
vi.mock("../lib/prisma", () => ({ default: {} }));
vi.mock("../lib/auth/resolveScopeBranch", () => ({ resolveAllScopeBranches: async () => [] }));

import {
    DELEGABLE_TYPES,
    buildDelegationIndex,
    effectiveDelegates,
    resolveEvaluatorAccess,
    filterRowsForEvaluator,
    delegationSlotKey,
    evaluatorTypeLabel,
    accessDeniedMessage,
} from "../lib/evaluatorDelegation.js";

/**
 * Department "Power of Attorney" evaluator resolution.
 *
 *   department POA (excluding the employee themselves)  → if configured
 *   branch default                                       → otherwise
 *
 * Fixture: Jaipur has Finance + HR + Operations; Jodhpur has its own Finance.
 */
const JAIPUR_FINANCE = "dept-jaipur-finance";
const JAIPUR_HR = "dept-jaipur-hr";
const JAIPUR_OPS = "dept-jaipur-ops";
const JODHPUR_FINANCE = "dept-jodhpur-finance";

const BM = "u-bm-jaipur"; //            branch-default BM of Jaipur
const FIN_HEAD = "u-finance-head"; //   Finance Head — BM POA for Jaipur·Finance
const FIN_EMP = "u-finance-emp"; //     ordinary Finance employee
const HR_EMP = "u-hr-emp"; //           ordinary HR-department employee
const JODHPUR_FIN_EMP = "u-jodhpur-fin-emp";

const access = (userId, employeeId, departmentId, rows, isBranchDefault) =>
    resolveEvaluatorAccess({ userId, employeeId, departmentId, index: buildDelegationIndex(rows), isBranchDefault });

describe("CASE 1 — no POA anywhere: behaves exactly as before", () => {
    it("branch default evaluates every department", () => {
        for (const dept of [JAIPUR_FINANCE, JAIPUR_HR, JAIPUR_OPS]) {
            expect(access(BM, FIN_EMP, dept, [], true)).toEqual({ allowed: true, viaDelegation: false, delegated: false, reason: null });
        }
    });
    it("a non-assigned user is still refused", () => {
        expect(access(FIN_HEAD, FIN_EMP, JAIPUR_FINANCE, [], false)).toMatchObject({ allowed: false, reason: "NOT_ASSIGNED" });
    });
});

describe("CASES 2–5 — one department delegated (identical for BM / CM / HR / Committee)", () => {
    const poa = [{ departmentId: JAIPUR_FINANCE, evaluatorUserId: FIN_HEAD }];

    it("Finance → delegate; the branch default is overridden", () => {
        expect(access(FIN_HEAD, FIN_EMP, JAIPUR_FINANCE, poa, false)).toMatchObject({ allowed: true, viaDelegation: true, delegated: true });
        expect(access(BM, FIN_EMP, JAIPUR_FINANCE, poa, true)).toMatchObject({ allowed: false, reason: "DELEGATED_ELSEWHERE" });
    });
    it("other departments → branch default; the delegate has no authority there", () => {
        expect(access(BM, HR_EMP, JAIPUR_HR, poa, true)).toMatchObject({ allowed: true, viaDelegation: false });
        expect(access(FIN_HEAD, HR_EMP, JAIPUR_HR, poa, false)).toMatchObject({ allowed: false, reason: "NOT_ASSIGNED" });
    });
});

describe("CASE 6 — all four POAs configured for Finance", () => {
    it("each type resolves to its own Finance delegate independently", () => {
        const people = { BRANCH_MANAGER: "u-d-bm", CLUSTER_MANAGER: "u-d-cm", HR: "u-d-hr", COMMITTEE: "u-d-com" };
        for (const type of DELEGABLE_TYPES) {
            const rows = [{ departmentId: JAIPUR_FINANCE, evaluatorUserId: people[type] }];
            expect(access(people[type], FIN_EMP, JAIPUR_FINANCE, rows, false).allowed).toBe(true);
            // ...and the delegate of a DIFFERENT type gets nothing from this index.
            const other = DELEGABLE_TYPES.find((t) => t !== type);
            expect(access(people[other], FIN_EMP, JAIPUR_FINANCE, rows, false).allowed).toBe(false);
        }
    });
});

describe("CASE 7 — self-evaluation protection", () => {
    const poa = [{ departmentId: JAIPUR_FINANCE, evaluatorUserId: FIN_HEAD }];

    it("the delegate can never evaluate themselves", () => {
        expect(access(FIN_HEAD, FIN_HEAD, JAIPUR_FINANCE, poa, false)).toMatchObject({ allowed: false, reason: "SELF" });
    });
    it("the delegate's own record falls back to the branch default", () => {
        expect(effectiveDelegates(buildDelegationIndex(poa), JAIPUR_FINANCE, FIN_HEAD)).toEqual([]);
        expect(access(BM, FIN_HEAD, JAIPUR_FINANCE, poa, true)).toMatchObject({ allowed: true, viaDelegation: false, delegated: false });
    });
    it("nobody evaluates themselves even as branch default", () => {
        expect(access(BM, BM, JAIPUR_HR, [], true)).toMatchObject({ allowed: false, reason: "SELF" });
    });
    it("committee: a delegated member's own record stays with the remaining delegates", () => {
        const rows = [
            { departmentId: JAIPUR_FINANCE, evaluatorUserId: "c1" },
            { departmentId: JAIPUR_FINANCE, evaluatorUserId: "c2" },
        ];
        expect(access("c2", "c1", JAIPUR_FINANCE, rows, false)).toMatchObject({ allowed: true, viaDelegation: true });
        expect(access("c1", "c1", JAIPUR_FINANCE, rows, false)).toMatchObject({ allowed: false, reason: "SELF" });
    });
});

describe("CASE 8 — POA removed", () => {
    it("immediately falls back to the branch default", () => {
        const before = [{ departmentId: JAIPUR_FINANCE, evaluatorUserId: FIN_HEAD }];
        expect(access(BM, FIN_EMP, JAIPUR_FINANCE, before, true).allowed).toBe(false);
        expect(access(BM, FIN_EMP, JAIPUR_FINANCE, [], true)).toMatchObject({ allowed: true, viaDelegation: false });
        expect(access(FIN_HEAD, FIN_EMP, JAIPUR_FINANCE, [], false).allowed).toBe(false);
    });
});

describe("CASE 9 — same person, several departments", () => {
    it("each delegated department works independently; others are untouched", () => {
        const rows = [
            { departmentId: JAIPUR_FINANCE, evaluatorUserId: FIN_HEAD },
            { departmentId: JAIPUR_OPS, evaluatorUserId: FIN_HEAD },
        ];
        expect(access(FIN_HEAD, FIN_EMP, JAIPUR_FINANCE, rows, false).allowed).toBe(true);
        expect(access(FIN_HEAD, "u-ops-emp", JAIPUR_OPS, rows, false).allowed).toBe(true);
        expect(access(FIN_HEAD, HR_EMP, JAIPUR_HR, rows, false).allowed).toBe(false);
    });
});

describe("CASE 10 — Jaipur·Finance POA has no effect on Jodhpur·Finance", () => {
    it("departments are distinct ids per branch, so the index never matches", () => {
        const rows = [{ departmentId: JAIPUR_FINANCE, evaluatorUserId: FIN_HEAD }];
        expect(access(FIN_HEAD, JODHPUR_FIN_EMP, JODHPUR_FINANCE, rows, false).allowed).toBe(false);
        // Jodhpur's own default is unaffected.
        expect(access("u-bm-jodhpur", JODHPUR_FIN_EMP, JODHPUR_FINANCE, rows, true)).toMatchObject({ allowed: true, viaDelegation: false });
    });
});

describe("filterRowsForEvaluator — dashboard queues", () => {
    const rows = [
        { employeeId: FIN_EMP, departmentId: JAIPUR_FINANCE },
        { employeeId: FIN_HEAD, departmentId: JAIPUR_FINANCE },
        { employeeId: HR_EMP, departmentId: JAIPUR_HR },
    ];
    const index = buildDelegationIndex([{ departmentId: JAIPUR_FINANCE, evaluatorUserId: FIN_HEAD }]);

    it("branch BM sees everything except the delegated department — but keeps the delegate's own record", () => {
        const out = filterRowsForEvaluator({ userId: BM, rows, index, isBranchDefault: true });
        expect(out.map((r) => r.employeeId).sort()).toEqual([FIN_HEAD, HR_EMP].sort());
        expect(out.every((r) => r.viaDelegation === false)).toBe(true);
    });
    it("delegate sees only the other Finance employees", () => {
        const out = filterRowsForEvaluator({ userId: FIN_HEAD, rows, index, isBranchDefault: false });
        expect(out).toEqual([{ employeeId: FIN_EMP, departmentId: JAIPUR_FINANCE, viaDelegation: true }]);
    });
    it("no POA → the branch default's list is unchanged (CASE 1)", () => {
        const out = filterRowsForEvaluator({ userId: BM, rows, index: new Map(), isBranchDefault: true });
        expect(out.map((r) => r.employeeId)).toEqual(rows.map((r) => r.employeeId));
    });
});

describe("helpers", () => {
    it("slotKey allows one BM / CM / HR delegate but several committee members", () => {
        expect(delegationSlotKey("BRANCH_MANAGER", "a")).toBe("SINGLE");
        expect(delegationSlotKey("CLUSTER_MANAGER", "a")).toBe("SINGLE");
        expect(delegationSlotKey("HR", "a")).toBe("SINGLE");
        expect(delegationSlotKey("COMMITTEE", "a")).toBe("a");
        expect(delegationSlotKey("COMMITTEE", "b")).toBe("b");
    });
    it("report labels (CASE 12)", () => {
        expect(evaluatorTypeLabel("BRANCH_MANAGER", true)).toBe("Delegated Branch Manager");
        expect(evaluatorTypeLabel("BRANCH_MANAGER", false)).toBe("Branch Manager");
        expect(evaluatorTypeLabel("HR", true)).toBe("Delegated HR Personnel");
    });
    it("denial messages", () => {
        expect(accessDeniedMessage("HR", "SELF")).toMatch(/yourself/);
        expect(accessDeniedMessage("BRANCH_MANAGER", "DELEGATED_ELSEWHERE")).toMatch(/Power of Attorney/);
    });
    it("index dedupes and ignores malformed rows", () => {
        const idx = buildDelegationIndex([
            { departmentId: "d", evaluatorUserId: "x" },
            { departmentId: "d", evaluatorUserId: "x" },
            { departmentId: null, evaluatorUserId: "y" },
        ]);
        expect(idx.get("d")).toEqual(["x"]);
        expect(idx.size).toBe(1);
    });
});
