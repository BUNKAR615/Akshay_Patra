/**
 * Nominate Amit Keshwa (empCode 1800022) as Cluster Manager of Jaipur, Baran,
 * Jhalawar, Udaipur — while KEEPING his Committee role (dual-role).
 *
 * Mirrors POST /api/admin/branches/[branchId]/cm-assign but does NOT remove the
 * committee assignment, so login shows the "Continue as" picker.
 *
 *   node scripts/_tmp_nominate_amit_cm.mjs           # dry-run
 *   node scripts/_tmp_nominate_amit_cm.mjs --apply   # commit
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

const EMPCODE = "1800022";
const BRANCH_NAMES = ["Jaipur", "Baran", "Jhalawar", "Udaipur"];
const ASSIGNED_BY = "script:nominate-amit-cm";

async function main() {
    const amit = await prisma.user.findUnique({
        where: { empCode: EMPCODE },
        select: { id: true, empCode: true, name: true, role: true },
    });
    if (!amit) throw new Error(`No user with empCode ${EMPCODE}`);

    const committeeCount = await prisma.committeeBranchAssignment.count({ where: { memberUserId: amit.id } });

    console.log("─".repeat(72));
    console.log(`User:   ${amit.name} [${amit.empCode}]  current role=${amit.role}`);
    console.log(`Committee branch rows: ${committeeCount} (preserved → dual-role)`);
    console.log(`Mode:   ${APPLY ? "APPLY (writes data)" : "DRY-RUN (no changes)"}`);
    console.log("─".repeat(72));

    // Resolve branches (names in DB may have trailing spaces).
    const targets = [];
    for (const name of BRANCH_NAMES) {
        const matches = await prisma.branch.findMany({
            where: { name: { contains: name, mode: "insensitive" } },
            select: { id: true, name: true, branchType: true },
        });
        if (matches.length !== 1) {
            console.log(`  [SKIP] "${name}" matched ${matches.length} branches — ambiguous/missing.`);
            continue;
        }
        const branch = matches[0];
        const existing = await prisma.clusterManagerBranchAssignment.findFirst({
            where: { branchId: branch.id },
            select: { cmUserId: true, cm: { select: { name: true, empCode: true } } },
        });
        if (existing && existing.cmUserId !== amit.id) {
            console.log(`  [CONFLICT] ${branch.name.trim()} already has CM ${existing.cm.name} [${existing.cm.empCode}] — SKIPPING (one CM per branch).`);
            continue;
        }
        const state = existing ? "already CM (no-op)" : "will assign";
        console.log(`  [OK] ${branch.name.trim()} (${branch.branchType}) → ${state}`);
        targets.push(branch);
    }

    if (targets.length === 0) {
        console.log("\nNothing to assign. Exiting.");
        return;
    }

    if (!APPLY) {
        console.log(`\nDRY-RUN: would set role=CLUSTER_MANAGER (keeping Committee) and assign ${targets.length} branch(es). Re-run with --apply.`);
        return;
    }

    await prisma.$transaction(async (tx) => {
        // Detach employee/HOD anchors + flip to CLUSTER_MANAGER. Committee rows
        // are intentionally NOT touched → dual-role. Password is left as-is
        // (already the staff formula "Amit_22", identical for both roles).
        await tx.user.update({
            where: { id: amit.id },
            data: {
                role: "CLUSTER_MANAGER",
                departmentId: null,
                branchId: null,
                passwordHod: null,
                collarType: null,
            },
        });
        for (const b of targets) {
            await tx.clusterManagerBranchAssignment.upsert({
                where: { cmUserId_branchId: { cmUserId: amit.id, branchId: b.id } },
                update: { assignedBy: ASSIGNED_BY, assignedAt: new Date() },
                create: { cmUserId: amit.id, branchId: b.id, assignedBy: ASSIGNED_BY },
            });
        }
    });

    await prisma.auditLog.create({
        data: {
            userId: amit.id,
            action: "CM_ASSIGNED_VIA_SCRIPT",
            details: { script: "nominate-amit-cm", branches: targets.map((b) => b.name.trim()), dualRole: true },
        },
    }).catch((e) => console.warn("Audit log skipped (non-fatal):", e.message));

    // Verify.
    const after = await prisma.user.findUnique({ where: { id: amit.id }, select: { role: true } });
    const cmRows = await prisma.clusterManagerBranchAssignment.findMany({
        where: { cmUserId: amit.id }, select: { branch: { select: { name: true } } },
    });
    const commRows = await prisma.committeeBranchAssignment.count({ where: { memberUserId: amit.id } });
    console.log(`\n✓ Applied. role=${after.role}`);
    console.log(`  CM branches: ${cmRows.map((r) => r.branch.name.trim()).join(", ")}`);
    console.log(`  Committee branch rows: ${commRows} (still present → dual-role intact)`);
}

main()
    .catch((e) => { console.error("FAILED:", e); process.exit(1); })
    .finally(async () => { await prisma.$disconnect(); });
