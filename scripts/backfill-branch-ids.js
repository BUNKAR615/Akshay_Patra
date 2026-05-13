/**
 * Backfill User.branchId for users assigned via the per-role assignment tables
 * who are missing the cached pointer.
 *
 * Why this exists:
 *   The login route puts User.branchId into the JWT. Downstream dashboards
 *   read user.branchId from the JWT. Until recently, the CM/HR/Committee
 *   assign routes wrote the assignment row but did not update User.branchId,
 *   so users assigned before the fix shipped without a branchId in the JWT
 *   and saw "Branch not found" / "no role assigned".
 *
 *   This script walks every assignment table and, for each (user, branch)
 *   pair, sets User.branchId to that branch when User.branchId is null. For
 *   multi-branch users (CM/HR/Committee) it picks the most recent assignment.
 *
 * Idempotent: running twice does nothing on the second pass.
 *
 * Usage:
 *   node scripts/backfill-branch-ids.js
 */

import prisma from "../lib/prisma.js";

async function backfill() {
    const summary = {
        BRANCH_MANAGER: 0,
        CLUSTER_MANAGER: 0,
        HR: 0,
        COMMITTEE: 0,
    };

    // BMs — one branch per user.
    const bms = await prisma.branchManagerAssignment.findMany({
        select: { bmUserId: true, branchId: true, bm: { select: { id: true, branchId: true, role: true } } },
    });
    for (const a of bms) {
        const target = a.bm;
        if (!target) continue;
        if (target.branchId === a.branchId && target.role === "BRANCH_MANAGER") continue;
        await prisma.user.update({
            where: { id: target.id },
            data: { branchId: a.branchId, role: "BRANCH_MANAGER" },
        });
        summary.BRANCH_MANAGER++;
    }

    // CMs / HR / Committee — multi-branch. Pick the most recent assignment.
    async function backfillMultiBranch(role, table, userField) {
        const rows = await prisma[table].findMany({
            select: {
                [userField]: true,
                branchId: true,
                assignedAt: true,
            },
            orderBy: { assignedAt: "desc" },
        });
        const seen = new Set();
        for (const a of rows) {
            const userId = a[userField];
            if (seen.has(userId)) continue;
            seen.add(userId);
            const u = await prisma.user.findUnique({
                where: { id: userId },
                select: { id: true, branchId: true, role: true },
            });
            if (!u) continue;
            if (u.branchId === a.branchId && u.role === role) continue;
            await prisma.user.update({
                where: { id: u.id },
                data: { branchId: a.branchId, role },
            });
            summary[role]++;
        }
    }

    await backfillMultiBranch("CLUSTER_MANAGER", "clusterManagerBranchAssignment", "cmUserId");
    await backfillMultiBranch("HR", "hrBranchAssignment", "hrUserId");
    await backfillMultiBranch("COMMITTEE", "committeeBranchAssignment", "memberUserId");

    console.log("[backfill-branch-ids] Updated users:");
    for (const [role, count] of Object.entries(summary)) {
        console.log(`  ${role}: ${count}`);
    }
}

backfill()
    .catch((err) => {
        console.error("[backfill-branch-ids] Failed:", err);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
