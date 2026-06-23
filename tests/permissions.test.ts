import { describe, it, expect } from "vitest";
// @ts-ignore — plain JS module
import {
    isValidPermissionKey, branchKey, parseBranchKey, hasPermission,
    canAccessView, canSeeNavItem, viewVisibility,
} from "../lib/permissions.js";

const op = (permissions: string[]) => ({ role: "EMPLOYEE", isAdmin: false, permissions });

describe("permissions — key validation", () => {
    it("accepts static and well-formed per-branch keys", () => {
        expect(isValidPermissionKey("employees.add")).toBe(true);
        expect(isValidPermissionKey("pipeline.winners")).toBe(true);
        expect(isValidPermissionKey(branchKey("clx123", "employees"))).toBe(true);
        expect(isValidPermissionKey("branch:abc123:audit")).toBe(true);
    });
    it("rejects unknown keys and malformed branch keys", () => {
        expect(isValidPermissionKey("employees.view")).toBe(false); //   removed legacy key isn't grantable
        expect(isValidPermissionKey("branch:x:bogus")).toBe(false);
        expect(isValidPermissionKey("nonsense")).toBe(false);
    });
    it("parseBranchKey round-trips", () => {
        expect(parseBranchKey(branchKey("b1", "org"))).toEqual({ branchId: "b1", feature: "org" });
        expect(parseBranchKey("branch:b1:nope")).toBeNull();
        expect(parseBranchKey("employees.add")).toBeNull();
    });
});

describe("permissions — hasPermission", () => {
    it("ADMIN bypasses everything", () => {
        expect(hasPermission({ role: "ADMIN" }, "anything")).toBe(true);
        expect(hasPermission({ isAdmin: true }, branchKey("b1", "employees"))).toBe(true);
    });
    it("matches direct grants (any-of)", () => {
        expect(hasPermission(op(["pipeline.winners"]), "pipeline.winners")).toBe(true);
        expect(hasPermission(op(["pipeline.winners"]), ["pipeline.export", "pipeline.winners"])).toBe(true);
        expect(hasPermission(op([branchKey("b1", "employees")]), branchKey("b1", "employees"))).toBe(true);
        expect(hasPermission(op([]), "pipeline.winners")).toBe(false);
    });
    it("satisfies legacy route guards via the new grants", () => {
        expect(hasPermission(op(["employees.add"]), "employees.view")).toBe(true);
        expect(hasPermission(op([branchKey("b1", "employees")]), "branches.employees")).toBe(true);
        expect(hasPermission(op([branchKey("b1", "audit")]), "branches.audit")).toBe(true);
        expect(hasPermission(op(["pipeline.winners"]), "pipeline.view")).toBe(true);
        expect(hasPermission(op(["quarter.start"]), "quarter.edit")).toBe(true);
        expect(hasPermission(op(["org.assign.bm"]), "branches.org")).toBe(true);
        // Coarse but intentional: a branch:employees grant does NOT satisfy a
        // departments guard.
        expect(hasPermission(op([branchKey("b1", "employees")]), "branches.departments")).toBe(false);
    });
});

describe("permissions — page/nav visibility (any-of)", () => {
    it("shows a section when any key in its namespace is held", () => {
        expect(viewVisibility("pipeline", op(["pipeline.winners"]))).toBe(true);
        expect(viewVisibility("branches", op([branchKey("b1", "employees")]))).toBe(true);
        expect(viewVisibility("questions", op(["questions.add"]))).toBe(true); // now grantable
        expect(viewVisibility("reports", op(["reports.charts"]))).toBe(true);
        expect(viewVisibility("logs", op(["audit.view"]))).toBe(true);
    });
    it("hides admin-only sections and ungranted ones", () => {
        expect(viewVisibility("users", op(["employees.add"]))).toBe(false);
        expect(viewVisibility("dashboard", op(["employees.add"]))).toBe(false);
        expect(viewVisibility("pipeline", op(["employees.add"]))).toBe(false);
    });
    it("canAccessView / canSeeNavItem honour ADMIN + any-of", () => {
        expect(canAccessView("questions", { role: "ADMIN" })).toBe(true);
        expect(canAccessView("pipeline", op(["pipeline.winners"]))).toBe(true);
        expect(canSeeNavItem({ id: "branches" }, op([branchKey("b1", "org")]))).toBe(true);
        expect(canSeeNavItem({ id: "branches" }, op(["employees.add"]))).toBe(false);
    });
});
