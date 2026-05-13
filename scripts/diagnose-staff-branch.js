/**
 * Read-only diagnostic for a single staff user.
 *
 * Prints everything you need to understand why someone is appearing on the
 * wrong branch:
 *   - The User row (id, empCode, name, role, branchId)
 *   - All ClusterManagerBranchAssignment rows for this user (with branch names)
 *   - All HrBranchAssignment / CommitteeBranchAssignment rows for this user
 *   - Their BranchManagerAssignment, if any
 *   - The expected default password format (Firstname_##) for the staff role
 *
 * Usage:
 *   node scripts/diagnose-staff-branch.js --empCode 1800349
 *   node scripts/diagnose-staff-branch.js --name "Rajesh Kumar Sharma"
 *
 * Read-only. Safe to run against production. Does not touch any data.
 */

import { PrismaClient } from "@prisma/client";
import { defaultPasswordFor } from "../lib/auth/defaultPassword.js";

const prisma = new PrismaClient();

function arg(flag) {
    const i = process.argv.indexOf(flag);
    if (i === -1 || i === process.argv.length - 1) return null;
    return process.argv[i + 1];
}

async function main() {
    const empCode = arg("--empCode");
    const name = arg("--name");

    if (!empCode && !name) {
        console.error("Usage: node scripts/diagnose-staff-branch.js --empCode <code>");
        console.error("       node scripts/diagnose-staff-branch.js --name \"<full name>\"");
        process.exit(2);
    }

    const where = empCode
        ? { empCode }
        : { name: { contains: name, mode: "insensitive" } };

    const users = await prisma.user.findMany({
        where,
        select: {
            id: true, empCode: true, name: true, role: true, branchId: true,
            mobile: true, designation: true,
            scopedBranch: { select: { id: true, name: true } },
        },
    });

    if (users.length === 0) {
        console.log("No matching user.");
        return;
    }

    for (const u of users) {
        console.log("─".repeat(70));
        console.log(`USER: ${u.name}  [empCode=${u.empCode}]`);
        console.log(`  id:           ${u.id}`);
        console.log(`  role:         ${u.role}`);
        console.log(`  User.branchId:    ${u.branchId || "NULL"}${u.scopedBranch ? ` (= ${u.scopedBranch.name})` : ""}`);
        console.log(`  designation:  ${u.designation || ""}`);
        console.log(`  mobile:       ${u.mobile || ""}`);

        // BM
        const bm = await prisma.branchManagerAssignment.findUnique({
            where: { bmUserId: u.id },
            select: { branch: { select: { id: true, name: true } } },
        });
        if (bm) {
            console.log(`  BM assignment: ${bm.branch.name} (${bm.branch.id})`);
        }

        // CM (multi)
        const cms = await prisma.clusterManagerBranchAssignment.findMany({
            where: { cmUserId: u.id },
            select: { branch: { select: { id: true, name: true } }, assignedAt: true, assignedBy: true },
            orderBy: { assignedAt: "asc" },
        });
        if (cms.length > 0) {
            console.log(`  CM assignments (${cms.length}):`);
            for (const a of cms) {
                console.log(`    - ${a.branch.name} (${a.branch.id})  assignedAt=${a.assignedAt.toISOString()}  by=${a.assignedBy}`);
            }
        }

        // HR (multi)
        const hrs = await prisma.hrBranchAssignment.findMany({
            where: { hrUserId: u.id },
            select: { branch: { select: { id: true, name: true } }, assignedAt: true, assignedBy: true },
            orderBy: { assignedAt: "asc" },
        });
        if (hrs.length > 0) {
            console.log(`  HR assignments (${hrs.length}):`);
            for (const a of hrs) {
                console.log(`    - ${a.branch.name} (${a.branch.id})  assignedAt=${a.assignedAt.toISOString()}  by=${a.assignedBy}`);
            }
        }

        // Committee (multi)
        const comms = await prisma.committeeBranchAssignment.findMany({
            where: { memberUserId: u.id },
            select: { branch: { select: { id: true, name: true } }, assignedAt: true, assignedBy: true },
            orderBy: { assignedAt: "asc" },
        });
        if (comms.length > 0) {
            console.log(`  Committee assignments (${comms.length}):`);
            for (const a of comms) {
                console.log(`    - ${a.branch.name} (${a.branch.id})  assignedAt=${a.assignedAt.toISOString()}  by=${a.assignedBy}`);
            }
        }

        // Expected default password for the staff role
        if (["CLUSTER_MANAGER", "BRANCH_MANAGER", "HR", "COMMITTEE", "ADMIN"].includes(u.role)) {
            const expected = defaultPasswordFor({ role: u.role, empCode: u.empCode, name: u.name });
            console.log(`  expected default password (Firstname_##): "${expected}"`);
            console.log(`    (this is what NEW users created via the assign endpoint receive;`);
            console.log(`     existing users keep whatever password they had at promotion time)`);
        } else {
            console.log(`  expected default password: "${u.empCode}"  (employee-code default)`);
        }
    }
    console.log("─".repeat(70));
}

main()
    .catch((err) => {
        console.error("[diagnose-staff-branch] Failed:", err);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
