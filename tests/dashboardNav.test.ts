import { describe, it, expect } from "vitest";
// @ts-ignore — plain JS module
import { NAV, flattenNav, resolveActive, ancestorIds, parseHref } from "../lib/dashboardNav.js";

describe("dashboardNav — nested submenu helpers", () => {
    it("parseHref exposes view + section", () => {
        expect(parseHref("/dashboard/admin?view=pipeline&section=export")).toEqual({
            path: "/dashboard/admin", view: "pipeline", section: "export",
        });
        expect(parseHref("/dashboard/admin/global/hr-committee")).toEqual({
            path: "/dashboard/admin/global/hr-committee", view: null, section: null,
        });
    });

    it("flattenNav walks children and skips the dynamic placeholder", () => {
        const ids = flattenNav(NAV.ADMIN).map((n: any) => n.id);
        expect(ids).toContain("branches");          // parent
        expect(ids).toContain("branches-bulk");     // child
        expect(ids).toContain("pipeline-export");   // grandchild-level submenu
        // The { dynamic: "branches" } slot has no id/href and must not appear.
        expect(ids).not.toContain(undefined);
    });

    it("resolveActive returns the section child, else the parent view", () => {
        const path = "/dashboard/admin";
        expect(resolveActive("ADMIN", path, "pipeline", "export")).toBe("pipeline-export");
        expect(resolveActive("ADMIN", path, "pipeline", null)).toBe("pipeline");
        expect(resolveActive("ADMIN", path, "quarter", "close")).toBe("quarter-close");
    });

    it("ancestorIds returns the chain to a nested child", () => {
        const chain = ancestorIds(NAV.ADMIN, "pipeline-export");
        expect([...chain]).toEqual(["pipeline"]);
        expect(ancestorIds(NAV.ADMIN, "branches-add").has("branches")).toBe(true);
    });

    it("resolves a runtime-injected per-branch leaf and its ancestors", () => {
        // Mirror what the Sidebar builds: inject one branch node (with its five
        // sub-pages) into the Branches item, replacing the dynamic placeholder.
        const branchNode = {
            id: "branch-jaipur", label: "Jaipur", href: "/dashboard/admin/jaipur",
            children: [
                { id: "branch-jaipur/employees", label: "Employees", href: "/dashboard/admin/jaipur/employees" },
                { id: "branch-jaipur/org", label: "Organizational Structure", href: "/dashboard/admin/jaipur/org" },
            ],
        };
        const effective = NAV.ADMIN.map((g: any) => ({
            ...g,
            items: g.items.map((it: any) => it.id !== "branches" ? it : {
                ...it,
                children: it.children.flatMap((c: any) => (c.dynamic === "branches" ? [branchNode] : [c])),
            }),
        }));
        const active = resolveActive("ADMIN", "/dashboard/admin/jaipur/employees", null, null, effective);
        expect(active).toBe("branch-jaipur/employees");
        expect([...ancestorIds(effective, active)]).toEqual(["branches", "branch-jaipur"]);
    });
});
