/**
 * Surgical cleanup script: remove ONE incorrect CM/HR/Committee assignment
 * for a specific user + branch combination.
 *
 * Use this when an admin (or a stale bulk-upload) accidentally assigned a
 * staff user to a branch they don't actually belong to. After running, the
 * user's other assignments stay intact, and the next login will re-resolve
 * branch scope from the corrected assignment table.
 *
 * Usage:
 *   # Dry-run (default): shows what WOULD be deleted, makes no changes.
 *   node scripts/remove-cm-branch-assignment.js \
 *     --empCode 1800349 --branch "Jaipur" --role CM
 *
 *   # Actually delete (after dry-run looks correct):
 *   node scripts/remove-cm-branch-assignment.js \
 *     --empCode 1800349 --branch "Jaipur" --role CM --apply
 *
 * --role accepts: CM, HR, COMMITTEE
 * --branch accepts a branch name (matched case-insensitively) or branch id.
 *
 * Always run --dry-run first. Idempotent: running --apply twice is a no-op.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function arg(flag) {
    const i = process.argv.indexOf(flag);
    if (i === -1 || i === process.argv.length - 1) return null;
    return process.argv[i + 1];
}
function flag(f) { return process.argv.includes(f); }

const ROLE_TABLE = {
    CM: { table: "clusterManagerBranchAssignment", userField: "cmUserId", compositeKey: "cmUserId_branchId", label: "Cluster Manager" },
    HR: { table: "hrBranchAssignment", userField: "hrUserId", compositeKey: "hrUserId_branchId", label: "HR" },
    COMMITTEE: { table: "committeeBranchAssignment", userField: "memberUserId", compositeKey: "memberUserId_branchId", label: "Committee" },
};

async function main() {
    const empCode = arg("--empCode");
    const branchInput = arg("--branch");
    const role = (arg("--role") || "CM").toUpperCase();
    const apply = flag("--apply");

    if (!empCode || !branchInput) {
        console.error("Usage: node scripts/remove-cm-branch-assignment.js --empCode <code> --branch <name|id> [--role CM|HR|COMMITTEE] [--apply]");
        process.exit(2);
    }

    const cfg = ROLE_TABLE[role];
    if (!cfg) {
        console.error(`Invalid --role "${role}". Must be one of: CM, HR, COMMITTEE.`);
        process.exit(2);
    }

    const user = await prisma.user.findUnique({
        where: { empCode },
        select: { id: true, empCode: true, name: true, role: true, branchId: true },
    });
    if (!user) {
        console.error(`No user found with empCode "${empCode}".`);
        process.exit(1);
    }

    const branch = await prisma.branch.findFirst({
        where: { OR: [{ id: branchInput }, { name: { equals: branchInput, mode: "insensitive" } }] },
        select: { id: true, name: true },
    });
    if (!branch) {
        console.error(`No branch found matching "${branchInput}" (by id or name).`);
        process.exit(1);
    }

    // Locate the assignment row.
    const where = { [cfg.compositeKey]: { [cfg.userField]: user.id, branchId: branch.id } };
    const existing = await prisma[cfg.table].findUnique({
        where,
        select: { assignedAt: true, assignedBy: true },
    });

    console.log("─".repeat(70));
    console.log(`User:      ${user.name}  [empCode=${user.empCode}, id=${user.id}]`);
    console.log(`Role:      ${cfg.label}`);
    console.log(`Branch:    ${branch.name}  [id=${branch.id}]`);
    console.log(`Mode:      ${apply ? "APPLY (will modify data)" : "DRY-RUN (no changes)"}`);
    console.log("─".repeat(70));

    if (!existing) {
        console.log(`No ${cfg.label} assignment found for this user on this branch. Nothing to do.`);
        // Still report any User.branchId that points at this branch — that's
        // the related stale data that the new policy ignores but you may want
        // to clean for hygiene.
        if (user.branchId === branch.id) {
            console.log("");
            console.log(`HINT: User.branchId still points at "${branch.name}". The new login`);
            console.log(`      flow ignores this field for staff roles, but you can clear it`);
            console.log(`      with scripts/null-staff-branchid.js.`);
        }
        return;
    }

    console.log(`Assignment row exists:`);
    console.log(`  assignedAt:  ${existing.assignedAt.toISOString()}`);
    console.log(`  assignedBy:  ${existing.assignedBy}`);
    console.log("");

    if (!apply) {
        console.log(`DRY-RUN: This row WOULD be deleted. Re-run with --apply to commit.`);
        return;
    }

    await prisma[cfg.table].delete({ where });

    // Audit-trail breadcrumb so this manual cleanup is traceable.
    await prisma.auditLog.create({
        data: {
            userId: "system",
            action: `${role}_UNASSIGNED_FROM_BRANCH_VIA_SCRIPT`,
            details: {
                script: "remove-cm-branch-assignment.js",
                userId: user.id,
                empCode: user.empCode,
                branchId: branch.id,
                branchName: branch.name,
            },
        },
    }).catch((err) => {
        console.warn("Audit log write failed (non-fatal):", err.message);
    });

    // Optional follow-up: if the User.branchId still points at the deleted
    // branch, null it. The new code path doesn't read this for staff, but
    // leaving it dangling is confusing in the next person's diagnostic dump.
    if (user.branchId === branch.id) {
        await prisma.user.update({
            where: { id: user.id },
            data: { branchId: null },
        });
        console.log(`Also cleared stale User.branchId pointer to "${branch.name}".`);
    }

    console.log(`✓ Removed ${cfg.label} assignment.`);
}

main()
    .catch((err) => {
        console.error("[remove-cm-branch-assignment] Failed:", err);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
