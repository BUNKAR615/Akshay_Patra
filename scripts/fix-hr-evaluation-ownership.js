/**
 * Fix evaluation ownership for people who serve as HR personnel in another
 * branch but remain employees of their own ("main") branch.
 *
 * Background
 * ----------
 * A person's MAIN branch — the branch they belong to as an employee — is owned
 * by their department (User.departmentId -> Department.branchId). The branch
 * they merely *play HR in* is recorded separately in HrBranchAssignment and
 * must NOT make them an employee of that branch.
 *
 * The branch shortlists (BranchShortlistStage1-4) and BranchBestEmployee rows
 * carry an explicit branchId. If a person was ever accidentally evaluated as an
 * employee inside a branch where they only serve as HR, those rows point at the
 * wrong branch. This tool finds and removes that misplaced ownership so each
 * person's evaluation belongs to their MAIN branch only — with no duplicate
 * ownership living in a second branch.
 *
 * What counts as "misplaced"
 * --------------------------
 * For every user holding at least one HrBranchAssignment:
 *   mainBranchId = user.department.branchId            (their employee branch)
 *   A Stage1-4 / BestEmployee row is MISPLACED when its branchId !== mainBranchId.
 * (An HR person should only ever be an employee-candidate in their main branch;
 *  the main-branch pipeline excludes role=HR from new shortlists automatically.)
 *
 * Safety
 * ------
 *   - DRY-RUN BY DEFAULT. Nothing is written unless you pass --apply.
 *   - Only touches users who hold an HR assignment. No other users are read or
 *     modified.
 *   - Users with no department (main branch unknown) are reported and SKIPPED —
 *     never guessed at.
 *   - Deletions run in a per-user transaction and are logged row by row.
 *
 * Usage
 * -----
 *   node scripts/fix-hr-evaluation-ownership.js                 # dry-run, all HR
 *   node scripts/fix-hr-evaluation-ownership.js --empCode 5100029   # one person
 *   node scripts/fix-hr-evaluation-ownership.js --apply         # APPLY, all HR
 *   node scripts/fix-hr-evaluation-ownership.js --empCode 5100029 --apply
 */
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const APPLY = process.argv.includes("--apply");
function arg(flag) {
  const i = process.argv.indexOf(flag);
  if (i === -1 || i === process.argv.length - 1) return null;
  return process.argv[i + 1];
}
const ONLY_EMPCODE = arg("--empCode");

// The four staged shortlist tables + the final best-employee table all carry a
// branchId, so the same misplacement check applies to each.
const STAGE_TABLES = [
  { key: "branchShortlistStage1", label: "Stage1 shortlist" },
  { key: "branchShortlistStage2", label: "Stage2 shortlist" },
  { key: "branchShortlistStage3", label: "Stage3 shortlist" },
  { key: "branchShortlistStage4", label: "Stage4 shortlist" },
  { key: "branchBestEmployee", label: "Best Employee" },
];

async function main() {
  console.log(
    APPLY
      ? "=== FIX HR EVALUATION OWNERSHIP (APPLY — writes enabled) ==="
      : "=== FIX HR EVALUATION OWNERSHIP (DRY RUN — no writes; pass --apply to write) ==="
  );

  // Target: every user who holds at least one HR branch assignment.
  const hrUsers = await prisma.user.findMany({
    where: {
      hrBranchAssignments: { some: {} },
      ...(ONLY_EMPCODE ? { empCode: ONLY_EMPCODE } : {}),
    },
    select: {
      id: true,
      empCode: true,
      name: true,
      role: true,
      departmentId: true,
      department: { select: { id: true, name: true, branchId: true, branch: { select: { name: true } } } },
      hrBranchAssignments: { select: { branchId: true, branch: { select: { name: true } } } },
    },
    orderBy: { empCode: "asc" },
  });

  if (hrUsers.length === 0) {
    console.log(ONLY_EMPCODE ? `No HR user found with empCode ${ONLY_EMPCODE}.` : "No HR personnel found.");
    return;
  }

  // Pre-load branch names so we can label misplaced rows readably.
  const branches = await prisma.branch.findMany({ select: { id: true, name: true } });
  const branchName = new Map(branches.map((b) => [b.id, b.name]));

  let totalMisplaced = 0;
  let usersWithFindings = 0;
  let usersSkipped = 0;

  for (const u of hrUsers) {
    const mainBranchId = u.department?.branchId || null;
    const hrBranchLabels = u.hrBranchAssignments
      .map((a) => `${a.branch?.name || a.branchId}`)
      .join(", ");

    console.log("\n" + "─".repeat(70));
    console.log(`USER ${u.name}  [empCode=${u.empCode}]  role=${u.role}`);
    console.log(`  main branch (department): ${u.department?.branch?.name || "(none)"}${u.department?.name ? `  ·  dept "${u.department.name}"` : ""}`);
    console.log(`  HR assignment branch(es): ${hrBranchLabels || "(none)"}`);

    if (!mainBranchId) {
      console.log("  ⚠ No department → main branch unknown. SKIPPED (fix the department first).");
      usersSkipped++;
      continue;
    }

    // Gather misplaced rows across every branch-scoped evaluation table.
    const misplacedByTable = [];
    for (const t of STAGE_TABLES) {
      const rows = await prisma[t.key].findMany({
        where: { userId: u.id, branchId: { not: mainBranchId } },
        select: { id: true, branchId: true, quarterId: true },
      });
      if (rows.length > 0) misplacedByTable.push({ ...t, rows });
    }

    // HrEvaluation has no branchId of its own (its branch is implied by the
    // candidate's Stage 3 entry), so we only REPORT any rows where this person
    // was the evaluated employee — for visibility, never auto-deleted here.
    const hrEvalAsEmployee = await prisma.hrEvaluation.count({ where: { employeeId: u.id } });
    if (hrEvalAsEmployee > 0) {
      console.log(`  note: ${hrEvalAsEmployee} HrEvaluation row(s) have this person as the *evaluated employee* (review manually).`);
    }

    const misplacedCount = misplacedByTable.reduce((n, t) => n + t.rows.length, 0);
    if (misplacedCount === 0) {
      console.log("  ✓ All evaluation records already belong to the main branch. Nothing to do.");
      continue;
    }

    usersWithFindings++;
    totalMisplaced += misplacedCount;
    console.log(`  ✗ ${misplacedCount} evaluation record(s) owned by the WRONG branch:`);
    for (const t of misplacedByTable) {
      for (const r of t.rows) {
        console.log(`      - ${t.label}: branch "${branchName.get(r.branchId) || r.branchId}"  (quarter ${r.quarterId})`);
      }
    }

    if (APPLY) {
      await prisma.$transaction(async (tx) => {
        for (const t of misplacedByTable) {
          const ids = t.rows.map((r) => r.id);
          await tx[t.key].deleteMany({ where: { id: { in: ids } } });
        }
        await tx.auditLog.create({
          data: {
            userId: u.id,
            action: "HR_EVALUATION_OWNERSHIP_FIXED",
            details: {
              empCode: u.empCode,
              mainBranchId,
              removed: misplacedByTable.map((t) => ({ table: t.key, count: t.rows.length })),
              script: "fix-hr-evaluation-ownership",
            },
          },
        }).catch(() => {});
      });
      console.log(`  → removed ${misplacedCount} misplaced record(s); evaluation now belongs to the main branch only.`);
    }
  }

  console.log("\n" + "═".repeat(70));
  console.log(`HR personnel scanned : ${hrUsers.length}`);
  console.log(`With misplaced eval  : ${usersWithFindings}`);
  console.log(`Skipped (no dept)    : ${usersSkipped}`);
  console.log(`Misplaced records    : ${totalMisplaced}`);
  console.log(APPLY ? "Mode: APPLY — changes written." : "Mode: DRY RUN — no changes written. Re-run with --apply to fix.");
}

main()
  .catch((e) => { console.error("FIX FAILED:", e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
