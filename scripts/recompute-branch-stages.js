/**
 * One-off backfill: re-apply the CORRECTED partial-promotion rules to the
 * CURRENT active quarter for EVERY branch, across all three branch stages
 * (Stage 2 → Stage 3 → Stage 4), using the same shared logic the live
 * evaluate routes now use (lib/branchPromotion).
 *
 * This repairs data that was produced under the old buggy logic:
 *   • Orphaned blue-collar employees in BIG branches that the BM has since
 *     evaluated now appear in Stage 2 (previously their BM evaluation was
 *     ignored because only HOD evaluations were scanned for the BC track).
 *   • Null-collar ("unclassified") employees in BIG branches are now treated
 *     as blue-collar instead of being silently dropped.
 *   • Stage 3 is re-ranked with the correct 40/30/30 weighting (was 60+40+30),
 *     so the right employees clear into Stage 4 / Committee.
 *   • BIG-branch BC track now honours a custom BranchEvalConfig.stage2Limit.
 *
 * SAFE TO RE-RUN (idempotent). Round-locking is respected by default: a stage
 * is NOT touched once the next round has started evaluating that branch (e.g.
 * Stage 2 is frozen the moment a CM evaluation exists for the branch). This
 * prevents reshuffling a round someone is already working on.
 *
 * Pass --force to bypass round-locking for Stage 2 and Stage 3 (use only if you
 * deliberately want to rebuild a locked round — e.g. after correcting earlier
 * data). Stage 4 always reflects current HR evaluations (it is terminal).
 *
 *   node scripts/recompute-branch-stages.js
 *   node scripts/recompute-branch-stages.js --force
 */
const { PrismaClient } = require("@prisma/client");
const {
    regenerateBranchStage2,
    regenerateBranchStage3,
    regenerateBranchStage4,
} = require("../lib/branchPromotion");

const prisma = new PrismaClient();
const FORCE = process.argv.includes("--force");

async function countsFor(branchId, quarterId) {
    const [s2, s3, s4] = await Promise.all([
        prisma.branchShortlistStage2.count({ where: { branchId, quarterId } }),
        prisma.branchShortlistStage3.count({ where: { branchId, quarterId } }),
        prisma.branchBestEmployee.count({ where: { branchId, quarterId } }),
    ]);
    return { s2, s3, s4 };
}

(async () => {
    const q = await prisma.quarter.findFirst({ where: { status: "ACTIVE" }, select: { id: true, name: true } });
    if (!q) { console.log("No active quarter — nothing to do."); await prisma.$disconnect(); return; }

    console.log(`Active quarter: ${q.name}`);
    console.log(`Round-locking: ${FORCE ? "DISABLED (--force)" : "respected"}`);
    console.log("Recomputing Stage 2 -> Stage 3 -> Stage 4 for every branch...\n");

    const branches = await prisma.branch.findMany({
        select: { id: true, name: true, branchType: true },
        orderBy: { name: "asc" },
    });

    let changedBranches = 0;

    for (const b of branches) {
        const before = await countsFor(b.id, q.id);

        const r2 = await regenerateBranchStage2(prisma, { branchId: b.id, branchType: b.branchType, quarterId: q.id, respectLock: !FORCE });
        const r3 = await regenerateBranchStage3(prisma, { branchId: b.id, branchType: b.branchType, quarterId: q.id, respectLock: !FORCE });
        const r4 = await regenerateBranchStage4(prisma, { branchId: b.id, branchType: b.branchType, quarterId: q.id });

        const after = await countsFor(b.id, q.id);

        const wc2 = await prisma.branchShortlistStage2.count({ where: { branchId: b.id, quarterId: q.id, collarType: "WHITE_COLLAR" } });
        const bc2 = after.s2 - wc2;

        const delta = (x, y) => (x === y ? `${y}` : `${x}->${y}`);
        const locks = [r2.locked ? "S2🔒" : "", r3.locked ? "S3🔒" : ""].filter(Boolean).join(" ");
        const added = [
            r2.added.length ? `+${r2.added.length} S2` : "",
            r3.added.length ? `+${r3.added.length} S3` : "",
            r4.added.length ? `+${r4.added.length} S4` : "",
        ].filter(Boolean).join(" ");

        const changed = before.s2 !== after.s2 || before.s3 !== after.s3 || before.s4 !== after.s4 || r2.added.length || r3.added.length || r4.added.length;
        if (changed) changedBranches++;

        console.log(
            `  ${b.name.padEnd(16)} [${b.branchType.padEnd(5)}]  ` +
            `S2 ${delta(before.s2, after.s2).padEnd(7)} (WC ${wc2}/BC ${bc2})  ` +
            `S3 ${delta(before.s3, after.s3).padEnd(7)}  ` +
            `S4 ${delta(before.s4, after.s4).padEnd(7)}  ` +
            `${added}${added && locks ? "  " : ""}${locks}`
        );
    }

    console.log(`\nDone. ${changedBranches} branch(es) updated.`);
    await prisma.$disconnect();
})().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
