/**
 * Targeted recompute for a SINGLE branch in the active quarter.
 *
 * Unlike scripts/recompute-branch-stages.js (which sweeps every branch), this
 * touches only the named branch — use it to repair one branch without any risk
 * of reshuffling rounds in other branches.
 *
 * It bypasses round-locking for Stage 2 and Stage 3 (--force is implied) so that
 * evaluations submitted AFTER the next round had already started — e.g. HOD
 * evaluations that landed after the CM began, which the lock had frozen out —
 * are finally folded into the shortlist. Stage 4 always reflects current HR
 * evaluations. Re-running is idempotent.
 *
 *   node scripts/recompute-one-branch.js "Jaipur"
 */
const { PrismaClient } = require("@prisma/client");
const {
    regenerateBranchStage2,
    regenerateBranchStage3,
    regenerateBranchStage4,
} = require("../lib/branchPromotion");

const prisma = new PrismaClient();
const branchName = process.argv[2];

async function snapshot(branchId, quarterId) {
    const [s2, s2wc, s3, s4] = await Promise.all([
        prisma.branchShortlistStage2.count({ where: { branchId, quarterId } }),
        prisma.branchShortlistStage2.count({ where: { branchId, quarterId, collarType: "WHITE_COLLAR" } }),
        prisma.branchShortlistStage3.count({ where: { branchId, quarterId } }),
        prisma.branchBestEmployee.count({ where: { branchId, quarterId } }),
    ]);
    return { s2, s2wc, s2bc: s2 - s2wc, s3, s4 };
}

(async () => {
    if (!branchName) { console.error('Usage: node scripts/recompute-one-branch.js "<Branch Name>"'); process.exit(1); }

    const q = await prisma.quarter.findFirst({ where: { status: "ACTIVE" }, select: { id: true, name: true } });
    if (!q) { console.log("No active quarter — nothing to do."); await prisma.$disconnect(); return; }

    const b = await prisma.branch.findFirst({ where: { name: branchName }, select: { id: true, name: true, branchType: true } });
    if (!b) { console.error(`Branch "${branchName}" not found.`); await prisma.$disconnect(); process.exit(1); }

    console.log(`Active quarter: ${q.name}`);
    console.log(`Branch: ${b.name} [${b.branchType}]  (round-locking bypassed)\n`);

    const before = await snapshot(b.id, q.id);

    const r2 = await regenerateBranchStage2(prisma, { branchId: b.id, branchType: b.branchType, quarterId: q.id, respectLock: false });
    const r3 = await regenerateBranchStage3(prisma, { branchId: b.id, branchType: b.branchType, quarterId: q.id, respectLock: false });
    const r4 = await regenerateBranchStage4(prisma, { branchId: b.id, branchType: b.branchType, quarterId: q.id });

    const after = await snapshot(b.id, q.id);

    const d = (x, y) => (x === y ? `${y}` : `${x} -> ${y}`);
    console.log(`Stage 2 cleared: ${d(before.s2, after.s2)}   (WC ${d(before.s2wc, after.s2wc)} / BC ${d(before.s2bc, after.s2bc)})`);
    console.log(`Stage 3 cleared: ${d(before.s3, after.s3)}`);
    console.log(`Stage 4 winners: ${d(before.s4, after.s4)}`);
    console.log(`\nNewly added -> S2: ${r2.added.length}   S3: ${r3.added.length}   S4: ${r4.added.length}`);

    if (r2.added.length) {
        const names = await prisma.user.findMany({ where: { id: { in: r2.added } }, select: { name: true, empCode: true, collarType: true } });
        console.log("Added to Stage 2:");
        for (const n of names) console.log(`  • ${n.name} (${n.empCode || "no code"}, ${n.collarType || "unclassified"})`);
    }

    console.log("\nDone.");
    await prisma.$disconnect();
})().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
