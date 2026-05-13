/**
 * One-time data hygiene script: detach BM/CM/HR/Committee users from their
 * old EMPLOYEE/HOD anchors.
 *
 * Why this exists:
 *   The old assign routes only updated User.role + password when promoting
 *   an employee to a higher role. They left User.departmentId (and for
 *   CM/HR/Committee, User.branchId and User.passwordHod) pointing at the
 *   user's prior employee record. As a result:
 *
 *     1. The prior branch's employee list kept showing the promoted user.
 *     2. A bulk re-upload of that prior branch's Excel sheet (which still
 *        listed them as EMPLOYEE/HOD) silently demoted them back —
 *        clobbering their staff role and password.
 *
 *   The new assign routes (cm/hr/committee/bm-assign) clear these fields
 *   atomically as part of the promotion. This script applies the same
 *   cleanup retroactively to anyone promoted before the fix shipped.
 *
 * What it does:
 *   For every User with role in (BRANCH_MANAGER, CLUSTER_MANAGER, HR,
 *   COMMITTEE):
 *     - sets `departmentId = null`
 *     - sets `passwordHod = null`
 *     - sets `collarType = null`
 *     - for CM/HR/COMMITTEE only, also sets `branchId = null`
 *       (BM keeps `branchId` because bm-assign writes it as canonical.)
 *
 * Idempotent: re-running does nothing once every match is already clean.
 *
 * Usage (dry-run by default — prints what would change without writing):
 *   node scripts/detach-staff-from-departments.js
 *
 * To actually apply the changes:
 *   node scripts/detach-staff-from-departments.js --apply
 *
 *   ...or with an explicit DB URL:
 *   DATABASE_URL=postgres://... node scripts/detach-staff-from-departments.js --apply
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const STAFF_ROLES = ["BRANCH_MANAGER", "CLUSTER_MANAGER", "HR", "COMMITTEE"];
const NULL_BRANCHID_ROLES = ["CLUSTER_MANAGER", "HR", "COMMITTEE"];

async function detachStaffFromDepartments({ apply }) {
    const candidates = await prisma.user.findMany({
        where: {
            role: { in: STAFF_ROLES },
            OR: [
                { departmentId: { not: null } },
                { passwordHod: { not: null } },
                { collarType: { not: null } },
                { AND: [{ role: { in: NULL_BRANCHID_ROLES } }, { branchId: { not: null } }] },
            ],
        },
        select: {
            id: true,
            empCode: true,
            name: true,
            role: true,
            branchId: true,
            departmentId: true,
            passwordHod: true,
            collarType: true,
        },
        orderBy: [{ role: "asc" }, { empCode: "asc" }],
    });

    if (candidates.length === 0) {
        console.log("[detach-staff] No staff users have stale EMPLOYEE/HOD anchors. Nothing to do.");
        return;
    }

    console.log(`[detach-staff] ${candidates.length} staff user(s) carry stale anchors:`);
    for (const u of candidates) {
        const willClearBranchId = NULL_BRANCHID_ROLES.includes(u.role) && u.branchId;
        const changes = [];
        if (u.departmentId) changes.push(`departmentId=${u.departmentId} → null`);
        if (willClearBranchId) changes.push(`branchId=${u.branchId} → null`);
        if (u.passwordHod) changes.push("passwordHod=<set> → null");
        if (u.collarType) changes.push(`collarType=${u.collarType} → null`);
        console.log(`  - ${u.role.padEnd(16)} ${u.empCode || "(no empCode)"} ${u.name}: ${changes.join(", ")}`);
    }

    if (!apply) {
        console.log("\n[detach-staff] Dry-run. Re-run with --apply to commit the changes above.");
        return;
    }

    let cleared = 0;
    for (const u of candidates) {
        const data = {
            departmentId: null,
            passwordHod: null,
            collarType: null,
        };
        if (NULL_BRANCHID_ROLES.includes(u.role)) {
            data.branchId = null;
        }
        await prisma.user.update({ where: { id: u.id }, data });
        cleared++;
    }

    console.log(`\n[detach-staff] Cleared ${cleared} user row(s).`);

    await prisma.auditLog.create({
        data: {
            userId: "system",
            action: "DATA_MIGRATION_DETACH_STAFF_FROM_DEPARTMENTS",
            details: {
                roles: STAFF_ROLES,
                rowsAffected: cleared,
                fieldsCleared: ["departmentId", "passwordHod", "collarType", "branchId(CM/HR/COMMITTEE only)"],
            },
        },
    }).catch((err) => {
        console.warn("[detach-staff] Audit log write failed (non-fatal):", err.message);
    });
}

const apply = process.argv.includes("--apply");
detachStaffFromDepartments({ apply })
    .catch((err) => {
        console.error("[detach-staff] Failed:", err);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
