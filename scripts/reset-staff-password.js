/**
 * Reset a single staff user's password to the role default (Firstname_##).
 *
 * For BM / CM / HR / COMMITTEE / ADMIN, the spec password format is:
 *
 *     ${Firstname}_${last 2 digits of empCode}
 *
 * Example: empCode 1800012, name "Rajesh Kumar Sharma" → "Rajesh_12".
 *
 * Use this when an existing user (e.g. an EMPLOYEE who was promoted to CM)
 * still has their old empCode-style password and you want them on the
 * role-default password instead. The assign endpoints deliberately don't
 * auto-reset on promotion — this script is the manual override.
 *
 * Usage:
 *   # Dry-run (default): show the new password, hash nothing.
 *   node scripts/reset-staff-password.js --empCode 1800012
 *
 *   # Apply: hash and update User.password.
 *   node scripts/reset-staff-password.js --empCode 1800012 --apply
 *
 *   # Override the computed default with an explicit password:
 *   node scripts/reset-staff-password.js --empCode 1800012 --password "MyTemp_99" --apply
 *
 * Idempotent. Safe on production. Always prints exactly what it changed.
 */

import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { defaultPasswordFor } from "../lib/auth/defaultPassword.js";

const prisma = new PrismaClient();

const SALT_ROUNDS = 10;

function arg(flag) {
    const i = process.argv.indexOf(flag);
    if (i === -1 || i === process.argv.length - 1) return null;
    return process.argv[i + 1];
}
function flag(f) { return process.argv.includes(f); }

async function main() {
    const empCode = arg("--empCode");
    const explicit = arg("--password");
    const apply = flag("--apply");

    if (!empCode) {
        console.error("Usage: node scripts/reset-staff-password.js --empCode <code> [--password <plain>] [--apply]");
        process.exit(2);
    }

    const user = await prisma.user.findUnique({
        where: { empCode },
        select: { id: true, empCode: true, name: true, role: true },
    });
    if (!user) {
        console.error(`No user found with empCode "${empCode}".`);
        console.error(`Hint: run "node scripts/diagnose-staff-branch.js --empCode ${empCode}"`);
        console.error(`      or by name to confirm the account exists.`);
        process.exit(1);
    }

    const STAFF = ["BRANCH_MANAGER", "CLUSTER_MANAGER", "HR", "COMMITTEE", "ADMIN"];
    if (!STAFF.includes(user.role)) {
        console.warn(`WARNING: user role is ${user.role}, not a staff role.`);
        console.warn(`         The Firstname_## password convention is for staff only.`);
        console.warn(`         Continuing anyway — pass --password to set an explicit value if needed.`);
    }

    const computed = defaultPasswordFor({
        role: user.role,
        empCode: user.empCode,
        name: user.name,
    });
    const plain = explicit || computed;

    console.log("─".repeat(70));
    console.log(`User:       ${user.name}  [empCode=${user.empCode}, id=${user.id}]`);
    console.log(`Role:       ${user.role}`);
    console.log(`Computed default (Firstname_##):  "${computed}"`);
    if (explicit) console.log(`Override (--password):           "${explicit}"`);
    console.log(`Will set password to:             "${plain}"`);
    console.log(`Mode:       ${apply ? "APPLY (will hash & update User.password)" : "DRY-RUN (no changes)"}`);
    console.log("─".repeat(70));

    if (!apply) {
        console.log(`DRY-RUN: re-run with --apply to commit the change.`);
        return;
    }

    const hash = await bcrypt.hash(plain, SALT_ROUNDS);
    await prisma.user.update({
        where: { id: user.id },
        data: { password: hash },
    });

    await prisma.auditLog.create({
        data: {
            userId: "system",
            action: "PASSWORD_RESET_VIA_SCRIPT",
            details: {
                script: "reset-staff-password.js",
                userId: user.id,
                empCode: user.empCode,
                role: user.role,
                used: explicit ? "explicit --password" : "computed default",
            },
        },
    }).catch((err) => {
        console.warn("Audit log write failed (non-fatal):", err.message);
    });

    console.log(`✓ Password updated. User can now log in with: "${plain}"`);
}

main()
    .catch((err) => {
        console.error("[reset-staff-password] Failed:", err);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
