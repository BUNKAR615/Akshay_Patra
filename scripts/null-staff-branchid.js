/**
 * One-time data hygiene script.
 *
 * Why this exists:
 *   The login route used to read User.branchId for CM/HR/Committee users to
 *   ship a branchId in the JWT. The assign routes wrote User.branchId to the
 *   most-recently-assigned branch, which silently broke multi-branch users
 *   (e.g. a CM assigned to Jodhpur and Jaipur would always log into Jaipur,
 *   regardless of intent).
 *
 *   The fix removes both reads and writes of User.branchId for these roles.
 *   The ClusterManagerBranchAssignment / HrBranchAssignment /
 *   CommitteeBranchAssignment tables are now the single source of truth.
 *
 *   This script wipes the stale User.branchId values left behind. After the
 *   fix is deployed and this script is run once, no piece of code reads or
 *   writes User.branchId for these three roles, so leaving the column dirty
 *   would only confuse future developers.
 *
 * Idempotent: re-running does nothing once branchId is null for every match.
 *
 * Usage (against the Neon prod DATABASE_URL):
 *   node scripts/null-staff-branchid.js
 *
 *   ...or with an explicit URL:
 *   DATABASE_URL=postgres://... node scripts/null-staff-branchid.js
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function nullStaffBranchIds() {
    const roles = ["CLUSTER_MANAGER", "HR", "COMMITTEE"];

    // Pre-count so the operator can see what's about to change.
    const before = await prisma.user.count({
        where: { role: { in: roles }, branchId: { not: null } },
    });
    console.log(`[null-staff-branchid] ${before} users with role in {${roles.join(", ")}} currently have a non-null branchId.`);

    if (before === 0) {
        console.log("[null-staff-branchid] Nothing to do. Exiting.");
        return;
    }

    const result = await prisma.user.updateMany({
        where: { role: { in: roles }, branchId: { not: null } },
        data: { branchId: null },
    });
    console.log(`[null-staff-branchid] Cleared User.branchId on ${result.count} rows.`);

    // Audit-trail breadcrumb so admins reviewing logs can see when this ran.
    await prisma.auditLog.create({
        data: {
            userId: "system",
            action: "DATA_MIGRATION_NULL_STAFF_BRANCHID",
            details: { rolesCleared: roles, rowsAffected: result.count },
        },
    }).catch((err) => {
        console.warn("[null-staff-branchid] Audit log write failed (non-fatal):", err.message);
    });
}

nullStaffBranchIds()
    .catch((err) => {
        console.error("[null-staff-branchid] Failed:", err);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
