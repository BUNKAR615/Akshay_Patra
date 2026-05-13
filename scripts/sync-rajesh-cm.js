/**
 * One-shot, idempotent local-DB correction for Rajesh's CM assignment.
 *
 * Brings the local database to the intended state in a single transaction:
 *   - Deletes any wrong CM assignment rows (e.g. Jaipur).
 *   - Upserts the correct CM assignment row (e.g. Jodhpur).
 *   - Flips User.role to CLUSTER_MANAGER, nulls User.branchId, resets password
 *     to the staff formula (Firstname_##).
 *   - Writes an audit log breadcrumb.
 *
 * Usage:
 *   # Dry-run (no DB writes):
 *   node scripts/sync-rajesh-cm.js
 *
 *   # Apply the corrections:
 *   node scripts/sync-rajesh-cm.js --apply
 *
 *   # Override defaults (any of these are optional):
 *   node scripts/sync-rajesh-cm.js \
 *     --empCode 1800012 \
 *     --target-branch "Jodhpur" \
 *     --remove-from "Jaipur" \
 *     --apply
 *
 *   # Multiple --remove-from flags supported:
 *   node scripts/sync-rajesh-cm.js --remove-from "Jaipur" --remove-from "Bhilwara"
 *
 * Safety:
 *   - Aborts if the user or target branch is missing.
 *   - Aborts if the target branch is currently held by a different CM
 *     (the operator must clear that assignment first).
 *   - Idempotent: running with --apply twice is a no-op on the second call.
 */

import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { defaultPasswordFor } from "../lib/auth/defaultPassword.js";

const prisma = new PrismaClient();

const SALT_ROUNDS = 10;

function arg(flag, fallback = null) {
    const i = process.argv.indexOf(flag);
    if (i === -1 || i === process.argv.length - 1) return fallback;
    return process.argv[i + 1];
}
function argAll(flag) {
    const out = [];
    for (let i = 0; i < process.argv.length - 1; i++) {
        if (process.argv[i] === flag) out.push(process.argv[i + 1]);
    }
    return out;
}
function flag(f) { return process.argv.includes(f); }

async function findBranch(input) {
    return prisma.branch.findFirst({
        where: { OR: [{ id: input }, { name: { equals: input, mode: "insensitive" } }] },
        select: { id: true, name: true, branchType: true },
    });
}

async function main() {
    const empCode = arg("--empCode", "1800012");
    const createName = arg("--name", "Rajesh Kumar Sharma");
    const createMobile = arg("--mobile");
    const targetBranchInput = arg("--target-branch", "Jodhpur");
    const removeFromInputs = argAll("--remove-from");
    if (removeFromInputs.length === 0) removeFromInputs.push("Jaipur");
    const apply = flag("--apply");

    console.log("─".repeat(72));
    console.log(`Mode:           ${apply ? "APPLY (will modify the DB)" : "DRY-RUN (no changes)"}`);
    console.log(`empCode:        ${empCode}`);
    console.log(`Name (if new):  ${createName}`);
    console.log(`Target branch:  ${targetBranchInput}`);
    console.log(`Remove from:    ${removeFromInputs.join(", ")}`);
    console.log("─".repeat(72));

    // 1. User — find or plan to create.
    let user = await prisma.user.findUnique({
        where: { empCode },
        select: { id: true, empCode: true, name: true, role: true, branchId: true },
    });
    let willCreateUser = false;
    if (!user) {
        if (!createName) {
            console.error(`✗ No user found with empCode "${empCode}" and no --name supplied. Aborting.`);
            process.exit(1);
        }
        willCreateUser = true;
        console.log(`✓ User missing — will CREATE: name="${createName}", role=CLUSTER_MANAGER`);
        // Synthetic placeholder for the rest of the dry-run logic.
        user = { id: null, empCode, name: createName, role: null, branchId: null };
    } else {
        console.log(`✓ Found user: ${user.name} (id=${user.id}, current role=${user.role})`);
    }

    // 2. Target branch
    const targetBranch = await findBranch(targetBranchInput);
    if (!targetBranch) {
        console.error(`✗ Target branch "${targetBranchInput}" not found. Aborting.`);
        process.exit(1);
    }
    console.log(`✓ Target branch: ${targetBranch.name} (id=${targetBranch.id})`);

    // 3. Resolve remove-from branches
    const removeFromBranches = [];
    for (const input of removeFromInputs) {
        const b = await findBranch(input);
        if (!b) {
            console.log(`  · Skip remove-from "${input}" — no branch with that name/id (idempotent skip).`);
            continue;
        }
        if (b.id === targetBranch.id) {
            console.log(`  · Skip remove-from "${b.name}" — same as target branch.`);
            continue;
        }
        removeFromBranches.push(b);
    }

    // 4. Safety check on the target branch — is it held by someone else?
    const targetCurrentHolder = await prisma.clusterManagerBranchAssignment.findFirst({
        where: { branchId: targetBranch.id },
        select: { cmUserId: true, cm: { select: { empCode: true, name: true } } },
    });
    if (targetCurrentHolder && targetCurrentHolder.cmUserId !== user.id) {
        console.error(`✗ Branch "${targetBranch.name}" is currently held by a different CM:`);
        console.error(`    ${targetCurrentHolder.cm.name} (empCode=${targetCurrentHolder.cm.empCode})`);
        console.error(`  Remove that assignment first via the Org Structure page or via:`);
        console.error(`    node scripts/remove-cm-branch-assignment.js --empCode ${targetCurrentHolder.cm.empCode} --branch "${targetBranch.name}" --role CM --apply`);
        process.exit(1);
    }

    // 5. Inspect existing rows for this user — what would change?
    const existingForUser = await prisma.clusterManagerBranchAssignment.findMany({
        where: { cmUserId: user.id },
        select: { branchId: true, branch: { select: { name: true } }, assignedAt: true },
    });

    const removeIds = new Set(removeFromBranches.map((b) => b.id));
    const willDelete = existingForUser.filter((r) => removeIds.has(r.branchId));
    const alreadyTarget = existingForUser.find((r) => r.branchId === targetBranch.id);

    console.log("");
    console.log("Planned operations:");
    console.log(`  1. ${willDelete.length} CM assignment row(s) to delete:`);
    for (const r of willDelete) console.log(`       - ${r.branch.name} (assigned ${r.assignedAt.toISOString()})`);
    if (willDelete.length === 0) console.log(`       (none — already clean)`);
    console.log(`  2. ${alreadyTarget ? "Touch" : "Insert"} CM assignment for ${targetBranch.name}.`);
    console.log(`  3. Set User.role = CLUSTER_MANAGER, User.branchId = NULL.`);
    console.log(`  4. Reset User.password to the staff formula.`);

    const computedPlain = defaultPasswordFor({
        role: "CLUSTER_MANAGER",
        empCode: user.empCode,
        name: user.name,
    });
    console.log(`     Computed password: "${computedPlain}"`);
    console.log(`  5. Write audit log entry (action=DATA_SYNC_RAJESH_CM).`);

    if (!apply) {
        console.log("");
        console.log("DRY-RUN — re-run with --apply to commit.");
        return;
    }

    // 6. Apply atomically
    const passwordHash = await bcrypt.hash(computedPlain, SALT_ROUNDS);

    await prisma.$transaction(async (tx) => {
        for (const b of removeFromBranches) {
            await tx.clusterManagerBranchAssignment
                .delete({
                    where: { cmUserId_branchId: { cmUserId: user.id, branchId: b.id } },
                })
                .catch((err) => {
                    if (err.code !== "P2025") throw err; // ignore "not found"
                });
        }

        await tx.clusterManagerBranchAssignment.upsert({
            where: { cmUserId_branchId: { cmUserId: user.id, branchId: targetBranch.id } },
            update: { assignedBy: "system-script", assignedAt: new Date() },
            create: { cmUserId: user.id, branchId: targetBranch.id, assignedBy: "system-script" },
        });

        await tx.user.update({
            where: { id: user.id },
            data: {
                role: "CLUSTER_MANAGER",
                branchId: null,
                password: passwordHash,
            },
        });

        await tx.auditLog.create({
            data: {
                userId: user.id,
                action: "DATA_SYNC_RAJESH_CM",
                details: {
                    script: "sync-rajesh-cm.js",
                    empCode: user.empCode,
                    targetBranch: { id: targetBranch.id, name: targetBranch.name },
                    removed: willDelete.map((r) => r.branch.name),
                    passwordReset: true,
                },
            },
        });
    });

    console.log("");
    console.log(`✓ Done. Verify with:`);
    console.log(`    node scripts/diagnose-staff-branch.js --empCode ${user.empCode}`);
}

main()
    .catch((err) => {
        console.error("[sync-rajesh-cm] Failed:", err);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
