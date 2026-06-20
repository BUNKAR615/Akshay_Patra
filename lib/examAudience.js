// Audience resolution for online exams — turns an audience filter into a real
// recipient count + segment breakdown by querying live User/Branch/Department
// data. Powers the builder's live recipient preview and materializes invites
// on publish.

import prisma from "./prisma";

const SEG_COLORS = ["#003087", "#00843D", "#F7941D", "#0369A1", "#7C3AED"];

// RM (regional manager) maps onto the existing CLUSTER_MANAGER role; there is
// no dedicated REGIONAL_MANAGER in the Role enum.
const ROLE_FOR_MODE = { bm: "BRANCH_MANAGER", rm: "CLUSTER_MANAGER" };

function withColors(rows) {
    const total = rows.reduce((s, r) => s + r.value, 0) || 1;
    return rows
        .filter((r) => r.value > 0)
        .map((r, i) => ({
            label: r.label,
            value: r.value,
            pct: Math.round((r.value / total) * 100),
            color: SEG_COLORS[i % SEG_COLORS.length],
        }));
}

async function collarBreakdown(where) {
    const groups = await prisma.user.groupBy({ by: ["collarType"], where, _count: { _all: true } });
    const label = { WHITE_COLLAR: "White collar", BLUE_COLLAR: "Blue collar", null: "Unspecified" };
    return withColors(groups.map((g) => ({ label: label[g.collarType] || "Other", value: g._count._all })));
}

/**
 * @returns {Promise<{ count, label, breakdown, employeeIds }>}
 *   employeeIds is the concrete invite list (may be empty for unset modes).
 */
export async function computeAudience({ mode, branchId, departmentId, randomCount, customRules } = {}) {
    const m = (mode || "all").toLowerCase();

    // Helper to load ids + count for an EMPLOYEE-scoped where clause.
    const loadEmployees = async (where) => {
        const rows = await prisma.user.findMany({ where, select: { id: true } });
        return rows.map((r) => r.id);
    };

    if (m === "all") {
        const where = { role: "EMPLOYEE" };
        const ids = await loadEmployees(where);
        return { count: ids.length, label: "All employees", breakdown: await collarBreakdown(where), employeeIds: ids };
    }

    if (m === "branch") {
        if (!branchId) return { count: 0, label: "No branch selected", breakdown: [], employeeIds: [] };
        const where = { role: "EMPLOYEE", department: { branchId } };
        const ids = await loadEmployees(where);
        const branch = await prisma.branch.findUnique({ where: { id: branchId }, select: { name: true } });
        // Breakdown by department within the branch.
        const depts = await prisma.department.findMany({ where: { branchId }, select: { id: true, name: true } });
        const counts = await Promise.all(
            depts.map(async (d) => ({ label: d.name, value: await prisma.user.count({ where: { role: "EMPLOYEE", departmentId: d.id } }) }))
        );
        return { count: ids.length, label: branch?.name || "Branch", breakdown: withColors(counts), employeeIds: ids };
    }

    if (m === "dept") {
        if (!departmentId) return { count: 0, label: "No department selected", breakdown: [], employeeIds: [] };
        const where = { role: "EMPLOYEE", departmentId };
        const ids = await loadEmployees(where);
        const dept = await prisma.department.findUnique({ where: { id: departmentId }, select: { name: true, branch: { select: { name: true } } } });
        return { count: ids.length, label: dept ? `${dept.branch?.name || ""} · ${dept.name}`.trim() : "Department", breakdown: await collarBreakdown(where), employeeIds: ids };
    }

    if (m === "bm" || m === "rm") {
        const role = ROLE_FOR_MODE[m];
        const where = { role };
        const ids = await loadEmployees(where);
        const label = m === "bm" ? "Branch Managers" : "Regional Managers";
        return { count: ids.length, label, breakdown: withColors([{ label, value: ids.length }]), employeeIds: ids };
    }

    if (m === "random") {
        const n = Math.max(0, randomCount || 0);
        const allIds = await loadEmployees({ role: "EMPLOYEE" });
        // Shuffle then take n.
        for (let i = allIds.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [allIds[i], allIds[j]] = [allIds[j], allIds[i]];
        }
        const picked = allIds.slice(0, Math.min(n, allIds.length));
        return { count: picked.length, label: `Random ${picked.length} employees`, breakdown: withColors([{ label: "Selected", value: picked.length }]), employeeIds: picked };
    }

    if (m === "custom") {
        // Explicit employee selection from the audience picker — the recipients
        // are exactly the chosen ids (validated against live users). Breakdown is
        // grouped by branch to match the picker's dark preview panel.
        const explicit = Array.isArray(customRules?.employeeIds) ? customRules.employeeIds.filter(Boolean) : null;
        if (explicit && explicit.length) {
            const users = await prisma.user.findMany({
                where: { id: { in: explicit } },
                select: { id: true, department: { select: { branch: { select: { name: true, location: true } } } } },
            });
            const byBranch = {};
            users.forEach((u) => {
                const br = u.department?.branch;
                const label = br ? (br.location ? `${br.name} — ${br.location}` : br.name) : "Unassigned";
                byBranch[label] = (byBranch[label] || 0) + 1;
            });
            const breakdown = withColors(Object.entries(byBranch).map(([label, value]) => ({ label, value })));
            const employeeIds = users.map((u) => u.id);
            return {
                count: employeeIds.length,
                label: `${employeeIds.length.toLocaleString()} selected ${employeeIds.length === 1 ? "employee" : "employees"}`,
                breakdown,
                employeeIds,
            };
        }

        // Union of: branch managers + selected department + a random sample.
        const set = new Set();
        const segs = [];
        const bm = await loadEmployees({ role: "BRANCH_MANAGER" });
        bm.forEach((id) => set.add(id));
        if (bm.length) segs.push({ label: "Branch managers", value: bm.length });
        if (departmentId) {
            const dept = await loadEmployees({ role: "EMPLOYEE", departmentId });
            dept.forEach((id) => set.add(id));
            if (dept.length) segs.push({ label: "Department", value: dept.length });
        }
        if (randomCount) {
            const pool = await loadEmployees({ role: "EMPLOYEE" });
            for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
            const picked = pool.slice(0, randomCount);
            picked.forEach((id) => set.add(id));
            if (picked.length) segs.push({ label: "Random sample", value: picked.length });
        }
        const ids = [...set];
        return { count: ids.length, label: "Custom combination", breakdown: withColors(segs), employeeIds: ids };
    }

    return { count: 0, label: "Not set", breakdown: [], employeeIds: [] };
}
