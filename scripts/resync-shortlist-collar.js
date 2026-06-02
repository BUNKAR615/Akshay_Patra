/**
 * Resync stored collar snapshots to the source of truth (User.collarType,
 * which the importer derives from the uploaded sheet).
 *
 * The branch-shortlist tables snapshot collarType at the time a stage is
 * generated. When an employee's collar is later corrected by re-importing the
 * sheet, those snapshots go stale and pages that read the snapshot directly
 * (admin pipeline, BM stats, exports) can show a collar that disagrees with the
 * sheet. This realigns every snapshot to the employee's current collar.
 *
 * Only rows whose User.collarType is NON-NULL and DISAGREES are touched — a
 * null user collar leaves the snapshot as the best-available fallback. Nothing
 * other than collarType is modified (scores, ranks, etc. are untouched).
 *
 *   Preview:  node scripts/resync-shortlist-collar.js --dry
 *   Apply:    node scripts/resync-shortlist-collar.js
 */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const DRY = process.argv.includes("--dry");

const TABLES = [
  "branchShortlistStage1",
  "branchShortlistStage2",
  "branchShortlistStage3",
  "branchShortlistStage4",
  "branchBestEmployee",
];

(async () => {
  console.log(DRY ? "=== DRY RUN (no writes) ===" : "=== RESYNC SNAPSHOT COLLAR ===");
  let grandTotal = 0;
  for (const table of TABLES) {
    const rows = await prisma[table].findMany({
      select: { id: true, collarType: true, user: { select: { empCode: true, name: true, collarType: true } } },
    });
    const mismatches = rows.filter(
      (r) => r.user && r.user.collarType && r.user.collarType !== r.collarType
    );
    console.log(`\n${table}: ${rows.length} rows | ${mismatches.length} to fix`);
    for (const m of mismatches) {
      console.log(`  ${m.user.empCode} ${m.user.name}: ${m.collarType} -> ${m.user.collarType}`);
      if (!DRY) {
        await prisma[table].update({
          where: { id: m.id },
          data: { collarType: m.user.collarType },
        });
      }
    }
    grandTotal += mismatches.length;
  }
  console.log(`\n${DRY ? "Would fix" : "Fixed"} ${grandTotal} snapshot row(s) total.`);
})().catch((e) => { console.error("RESYNC FAILED:", e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
