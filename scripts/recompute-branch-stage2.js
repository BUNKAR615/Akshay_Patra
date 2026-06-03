/**
 * One-off backfill: apply the new "partial promotion" rule to the CURRENT
 * active quarter's Stage 2 shortlist for every branch, using the same shared
 * logic the live evaluate routes now use (lib/branchPromotion).
 *
 * Safe to re-run (idempotent). Skips any branch whose Stage 3 round has already
 * started (round-locking). Reports before/after counts.
 *
 *   node scripts/recompute-branch-stage2.js
 */
const { PrismaClient } = require("@prisma/client");
const { regenerateBranchStage2 } = require("../lib/branchPromotion");

const prisma = new PrismaClient();

(async () => {
    const q = await prisma.quarter.findFirst({ where: { status: "ACTIVE" }, select: { id: true, name: true } });
    if (!q) { console.log("No active quarter — nothing to do."); await prisma.$disconnect(); return; }
    console.log(`Active quarter: ${q.name}`);
    console.log("Recomputing Stage 2 (who clears into Stage 3) from current BM/HOD evaluations...\n");

    const branches = await prisma.branch.findMany({ select: { id: true, name: true, branchType: true }, orderBy: { name: "asc" } });

    for (const b of branches) {
        const before = await prisma.branchShortlistStage2.count({ where: { branchId: b.id, quarterId: q.id } });
        const res = await regenerateBranchStage2(prisma, { branchId: b.id, branchType: b.branchType, quarterId: q.id });
        const after = await prisma.branchShortlistStage2.count({ where: { branchId: b.id, quarterId: q.id } });
        const wc = await prisma.branchShortlistStage2.count({ where: { branchId: b.id, quarterId: q.id, collarType: "WHITE_COLLAR" } });
        const bc = after - wc;
        const tag = res.locked ? "  [Stage 3 started → locked, skipped]" : (after !== before ? `  (+${after - before})` : "");
        console.log(`  ${b.name.padEnd(14)} [${b.branchType.padEnd(5)}]  Stage2 cleared: ${before} -> ${after}  (WC ${wc} / BC ${bc})${tag}`);
    }

    console.log("\nDone.");
    await prisma.$disconnect();
})().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
