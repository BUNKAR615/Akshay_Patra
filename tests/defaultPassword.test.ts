import { describe, it, expect } from "vitest";
import { defaultPasswordFor } from "../lib/auth/defaultPassword.js";

/**
 * Locks in the spec-mandated default-password rule that every account-creating
 * route reuses:
 *   - EMPLOYEE                            → password = empCode
 *   - BM / CM / HR / COMMITTEE / ADMIN    → password = `${Firstname}_${last 2 digits of empCode}`
 *
 * Any future change to the format must update this contract too.
 */
describe("defaultPasswordFor", () => {
    it("EMPLOYEE password is the empCode verbatim", () => {
        expect(defaultPasswordFor({ role: "EMPLOYEE", empCode: "EMP001", name: "Priya Singh" })).toBe("EMP001");
        expect(defaultPasswordFor({ role: "EMPLOYEE", empCode: "1800349", name: "Rishpal Kumar" })).toBe("1800349");
    });

    it("BRANCH_MANAGER password is `${Firstname}_${last 2 digits of empCode}`", () => {
        expect(defaultPasswordFor({ role: "BRANCH_MANAGER", empCode: "BM001", name: "Ramesh Kumar" })).toBe("Ramesh_01");
        expect(defaultPasswordFor({ role: "BRANCH_MANAGER", empCode: "BM042", name: "suresh sharma" })).toBe("Suresh_42");
    });

    it("CLUSTER_MANAGER follows the same staff rule as BM", () => {
        expect(defaultPasswordFor({ role: "CLUSTER_MANAGER", empCode: "CM12", name: "priya verma" })).toBe("Priya_12");
    });

    it("HR follows the staff rule", () => {
        expect(defaultPasswordFor({ role: "HR", empCode: "HR007", name: "Anil Gupta" })).toBe("Anil_07");
    });

    it("COMMITTEE follows the staff rule", () => {
        expect(defaultPasswordFor({ role: "COMMITTEE", empCode: "CMT9", name: "Amit" })).toBe("Amit_09");
    });

    it("strips non-alphabetic characters from the firstname token", () => {
        expect(defaultPasswordFor({ role: "BRANCH_MANAGER", empCode: "BM001", name: "  Ramesh!  Kumar  " })).toBe("Ramesh_01");
    });

    it("left-pads single-digit empCode tails to 2 characters", () => {
        expect(defaultPasswordFor({ role: "HR", empCode: "HR9", name: "Amit Verma" })).toBe("Amit_09");
    });

    it("falls back to empCode when the staff name has no alphabetic characters", () => {
        expect(defaultPasswordFor({ role: "CLUSTER_MANAGER", empCode: "CM01", name: "1234" })).toBe("CM01");
    });

    it("falls back to empCode when the empCode has no digits", () => {
        expect(defaultPasswordFor({ role: "BRANCH_MANAGER", empCode: "BMABC", name: "Ramesh" })).toBe("BMABC");
    });

    it("returns empty string when empCode is missing", () => {
        expect(defaultPasswordFor({ role: "EMPLOYEE", empCode: "", name: "Anyone" })).toBe("");
        expect(defaultPasswordFor({ role: "BRANCH_MANAGER", empCode: undefined as any, name: "Anyone" })).toBe("");
    });
});
