/**
 * Audit Branch-Manager / Cluster-Manager assignment conflicts in the existing
 * data BEFORE running the migration that adds:
 *   - bm_branch_assignments(bm_user_id UNIQUE, branch_id UNIQUE)
 *   - cm_branch_assignments.branch_id UNIQUE
 *
 * Read-only. Exits with code 1 if any conflicts are found, so it can be wired
 * into a deployment guard.
 *
 * Run:  node scripts/audit-bm-cm-conflicts.js
 */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
    let conflicts = 0;

    // 1. Branches with multiple users matching role=BRANCH_MANAGER + branchId=X
    const bmsByBranch = await prisma.user.groupBy({
        by: ["branchId"],
        where: { role: "BRANCH_MANAGER", branchId: { not: null } },
        _count: { _all: true },
    });
    const branchesWithMultipleBms = bmsByBranch.filter((g) => g._count._all > 1);
    if (branchesWithMultipleBms.length > 0) {
        conflicts += branchesWithMultipleBms.length;
        console.log("\n[CONFLICT] Branches with more than one BRANCH_MANAGER user:");
        for (const g of branchesWithMultipleBms) {
            const branch = await prisma.branch.findUnique({
                where: { id: g.branchId },
                select: { name: true, slug: true },
            });
            const bms = await prisma.user.findMany({
                where: { role: "BRANCH_MANAGER", branchId: g.branchId },
                select: { id: true, empCode: true, name: true, updatedAt: true },
                orderBy: { updatedAt: "desc" },
            });
            console.log(`  - ${branch?.name || g.branchId} (${g._count._all} BMs):`);
            for (const u of bms) console.log(`      • ${u.empCode || u.id}  ${u.name}  (updated ${u.updatedAt.toISOString()})`);
        }
    }

    // 2. Users flagged BRANCH_MANAGER reachable from > 1 branch via DepartmentRoleMapping
    const drmBmRows = await prisma.departmentRoleMapping.findMany({
        where: { role: "BRANCH_MANAGER" },
        select: {
            userId: true,
            departmentId: true,
            user: { select: { empCode: true, name: true, branchId: true } },
            department: { select: { branchId: true, name: true } },
        },
    });
    const branchesPerUser = new Map();
    for (const r of drmBmRows) {
        const set = branchesPerUser.get(r.userId) || new Set();
        if (r.department?.branchId) set.add(r.department.branchId);
        if (r.user?.branchId) set.add(r.user.branchId);
        branchesPerUser.set(r.userId, set);
    }
    const usersBmInMultipleBranches = [...branchesPerUser.entries()].filter(([, s]) => s.size > 1);
    if (usersBmInMultipleBranches.length > 0) {
        conflicts += usersBmInMultipleBranches.length;
        console.log("\n[CONFLICT] Users assigned as BRANCH_MANAGER across more than one branch:");
        for (const [userId, branchSet] of usersBmInMultipleBranches) {
            const u = await prisma.user.findUnique({ where: { id: userId }, select: { empCode: true, name: true } });
            const branchNames = await prisma.branch.findMany({
                where: { id: { in: [...branchSet] } },
                select: { name: true },
            });
            console.log(`  - ${u?.empCode || userId}  ${u?.name}: ${branchNames.map((b) => b.name).join(", ")}`);
        }
    }

    // 3. Departments with branchManagerId pointing to users actually scoped to a different branch
    const deptCacheBad = await prisma.department.findMany({
        where: { branchManagerId: { not: null } },
        select: {
            id: true,
            name: true,
            branchId: true,
            branchManagerId: true,
            branch: { select: { name: true } },
        },
    });
    const inconsistentDepts = [];
    for (const d of deptCacheBad) {
        const u = await prisma.user.findUnique({
            where: { id: d.branchManagerId },
            select: { branchId: true, empCode: true, name: true },
        });
        if (u && u.branchId && u.branchId !== d.branchId) {
            inconsistentDepts.push({ dept: d, user: u });
        }
    }
    if (inconsistentDepts.length > 0) {
        conflicts += inconsistentDepts.length;
        console.log("\n[CONFLICT] Departments whose branchManagerId is a user scoped to a DIFFERENT branch:");
        for (const r of inconsistentDepts) {
            console.log(`  - dept ${r.dept.name} (branch ${r.dept.branch?.name}) → BM ${r.user.empCode} ${r.user.name} (scoped to branch ${r.user.branchId})`);
        }
    }

    // 4. Branches with multiple cm_branch_assignments rows
    const cmsByBranch = await prisma.clusterManagerBranchAssignment.groupBy({
        by: ["branchId"],
        _count: { _all: true },
    });
    const branchesWithMultipleCms = cmsByBranch.filter((g) => g._count._all > 1);
    if (branchesWithMultipleCms.length > 0) {
        conflicts += branchesWithMultipleCms.length;
        console.log("\n[CONFLICT] Branches with more than one Cluster Manager assigned:");
        for (const g of branchesWithMultipleCms) {
            const branch = await prisma.branch.findUnique({
                where: { id: g.branchId },
                select: { name: true },
            });
            const rows = await prisma.clusterManagerBranchAssignment.findMany({
                where: { branchId: g.branchId },
                include: { cm: { select: { empCode: true, name: true } } },
                orderBy: { assignedAt: "desc" },
            });
            console.log(`  - ${branch?.name || g.branchId} (${g._count._all} CMs):`);
            for (const r of rows) console.log(`      • ${r.cm.empCode || r.cmUserId}  ${r.cm.name}  (assigned ${r.assignedAt.toISOString()})`);
        }
    }

    if (conflicts === 0) {
        console.log("\n✓ No BM/CM conflicts found. Safe to run the migration.");
        process.exit(0);
    }

    console.log(`\n✗ ${conflicts} conflict(s) detected. Resolve them (or run scripts/seed-bm-assignment-from-legacy.js to keep the most recent record per branch) before applying the migration.`);
    process.exit(1);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(2);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
