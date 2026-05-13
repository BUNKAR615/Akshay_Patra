/**
 * Quick read-only listing of every Cluster Manager assignment in the DB,
 * grouped by branch. Useful for spotting who is actually on a branch when
 * the Org Structure UI says one thing and login says another.
 *
 * Usage:
 *   node scripts/list-cm-assignments.js
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    const branches = await prisma.branch.findMany({
        select: { id: true, name: true, branchType: true },
        orderBy: { name: "asc" },
    });

    console.log(`Found ${branches.length} branches in DB.\n`);

    for (const b of branches) {
        const cms = await prisma.clusterManagerBranchAssignment.findMany({
            where: { branchId: b.id },
            select: {
                cm: { select: { id: true, empCode: true, name: true, role: true } },
                assignedAt: true,
            },
            orderBy: { assignedAt: "asc" },
        });
        if (cms.length === 0) {
            console.log(`  ${b.name.padEnd(20)}  (no CM)`);
            continue;
        }
        for (const a of cms) {
            console.log(`  ${b.name.padEnd(20)}  CM: ${a.cm.name} (empCode=${a.cm.empCode}, role=${a.cm.role})`);
        }
    }

    // Also list any User with role=CLUSTER_MANAGER, even those without an assignment row.
    console.log(`\nAll users with role=CLUSTER_MANAGER:`);
    const cmUsers = await prisma.user.findMany({
        where: { role: "CLUSTER_MANAGER" },
        select: { id: true, empCode: true, name: true, branchId: true },
        orderBy: { name: "asc" },
    });
    if (cmUsers.length === 0) {
        console.log(`  (none)`);
    } else {
        for (const u of cmUsers) {
            const count = await prisma.clusterManagerBranchAssignment.count({ where: { cmUserId: u.id } });
            console.log(`  - ${u.name.padEnd(30)}  empCode=${u.empCode.padEnd(10)}  branchId=${u.branchId || "NULL"}  assignments=${count}`);
        }
    }
}

main()
    .catch((err) => {
        console.error("Failed:", err);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
