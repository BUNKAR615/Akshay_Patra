/**
 * Populate the new bm_branch_assignments table from the existing sources of
 * truth (User.role/branchId, Department.branchManagerId, DepartmentRoleMapping).
 *
 * Strategy: for each branch, pick exactly ONE BM (the most-recently-updated
 * user with role=BRANCH_MANAGER and branchId=X). All other BMs in that branch
 * are demoted to EMPLOYEE so the new unique indexes can hold.
 *
 * Idempotent: re-running keeps the same picked BM; no-op when assignments
 * already exist and match the chosen user.
 *
 * Pass --dry-run to print what would change without writing.
 *
 * Run:
 *   node scripts/seed-bm-assignment-from-legacy.js --dry-run
 *   node scripts/seed-bm-assignment-from-legacy.js
 */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const DRY_RUN = process.argv.includes("--dry-run");
const ASSIGNED_BY = "system-backfill";

async function main() {
    if (DRY_RUN) console.log("[DRY-RUN] No writes will be made.\n");

    const branches = await prisma.branch.findMany({ select: { id: true, name: true } });
    let promoted = 0;
    let demoted = 0;
    let skipped = 0;

    for (const b of branches) {
        const bms = await prisma.user.findMany({
            where: { role: "BRANCH_MANAGER", branchId: b.id },
            select: { id: true, empCode: true, name: true, updatedAt: true },
            orderBy: { updatedAt: "desc" },
        });

        if (bms.length === 0) {
            skipped++;
            continue;
        }

        const winner = bms[0];
        const losers = bms.slice(1);

        // Resolve any existing assignment row for this branch
        const existingByBranch = await prisma.branchManagerAssignment.findUnique({
            where: { branchId: b.id },
        });

        const needsWrite = !existingByBranch || existingByBranch.bmUserId !== winner.id;
        if (needsWrite) {
            console.log(`[BRANCH ${b.name}] BM → ${winner.empCode || winner.id} (${winner.name})`);
            if (!DRY_RUN) {
                await prisma.branchManagerAssignment.upsert({
                    where: { branchId: b.id },
                    update: { bmUserId: winner.id, assignedBy: ASSIGNED_BY, assignedAt: new Date() },
                    create: { bmUserId: winner.id, branchId: b.id, assignedBy: ASSIGNED_BY },
                });
            }
            promoted++;
        }

        for (const l of losers) {
            console.log(`  └─ demoting duplicate BM ${l.empCode || l.id} (${l.name}) → EMPLOYEE`);
            if (!DRY_RUN) {
                await prisma.user.update({ where: { id: l.id }, data: { role: "EMPLOYEE" } });
                // Drop their stale DepartmentRoleMapping rows for BRANCH_MANAGER
                await prisma.departmentRoleMapping.deleteMany({
                    where: { userId: l.id, role: "BRANCH_MANAGER" },
                });
                // Clear stale department.branchManagerId pointers
                await prisma.department.updateMany({
                    where: { branchId: b.id, branchManagerId: l.id },
                    data: { branchManagerId: null },
                });
            }
            demoted++;
        }
    }

    // Also pick up users whose only source-of-truth is DepartmentRoleMapping
    // (no User.branchId set). For each such user, take the dept's branch and
    // try to assign — but only if that branch has no winner yet.
    const drmRows = await prisma.departmentRoleMapping.findMany({
        where: { role: "BRANCH_MANAGER" },
        include: { department: { select: { branchId: true } } },
    });
    for (const r of drmRows) {
        const branchId = r.department?.branchId;
        if (!branchId) continue;
        const existingByBranch = await prisma.branchManagerAssignment.findUnique({ where: { branchId } });
        const existingByUser = await prisma.branchManagerAssignment.findUnique({ where: { bmUserId: r.userId } });
        if (existingByBranch || existingByUser) continue;

        const u = await prisma.user.findUnique({ where: { id: r.userId }, select: { empCode: true, name: true } });
        const branchName = (await prisma.branch.findUnique({ where: { id: branchId }, select: { name: true } }))?.name;
        console.log(`[DRM-ONLY] ${branchName}: BM → ${u?.empCode || r.userId} (${u?.name})`);
        if (!DRY_RUN) {
            await prisma.branchManagerAssignment.create({
                data: { bmUserId: r.userId, branchId, assignedBy: ASSIGNED_BY },
            });
            await prisma.user.update({
                where: { id: r.userId },
                data: { role: "BRANCH_MANAGER", branchId },
            });
        }
        promoted++;
    }

    console.log("\n──────────────────────────────────────");
    console.log(`Branches with no BM (skipped):    ${skipped}`);
    console.log(`BM rows written / refreshed:      ${promoted}`);
    console.log(`Duplicate BMs demoted to EMPLOYEE: ${demoted}`);
    if (DRY_RUN) console.log("\nRun without --dry-run to apply the changes.");
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
