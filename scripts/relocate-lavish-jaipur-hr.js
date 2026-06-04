/**
 * One-off: align Lavish Bhardwaj (empCode 2000661) with the other HR personnel.
 *
 * He was configured by the old setup-nathdwara-dual-login.js as an employee of
 * Nathdwara / Human Resources, but he belongs to Jaipur / Human Resources like
 * every other HR person. He also kept stale Stage 1/2/3 shortlist rows in
 * Nathdwara from before he became HR, which made him show up as a candidate in
 * his own Nathdwara HR dashboard.
 *
 * This does two things, WITHOUT changing his HR role or HR branch assignments
 * (Nathdwara + Bhilwara) and WITHOUT touching his login passwords (his dual
 * login keeps working):
 *   1. Moves his employee identity to Jaipur / Human Resources.
 *   2. Deletes his stale branch shortlist / best-employee rows (he is HR, so he
 *      must never be a Best-Employee candidate in any branch).
 *
 * DRY-RUN BY DEFAULT. Nothing is written unless you pass --apply.
 *   node scripts/relocate-lavish-jaipur-hr.js            # preview
 *   node scripts/relocate-lavish-jaipur-hr.js --apply    # write
 */
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

const EMP_CODE = "2000661";
const BRANCH_NAME = "Jaipur";
const DEPT_NAME = "Human Resources";
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
      ? "=== RELOCATE LAVISH -> JAIPUR/HR (APPLY — writes enabled) ==="
      : "=== RELOCATE LAVISH -> JAIPUR/HR (DRY RUN — no writes; pass --apply to write) ==="
  );

  const branch = await prisma.branch.findFirst({
    where: { name: { equals: BRANCH_NAME, mode: "insensitive" } },
    select: { id: true, name: true },
  });
  if (!branch) { console.error(`No branch named "${BRANCH_NAME}". Aborting.`); process.exitCode = 1; return; }

  const dept = await prisma.department.findFirst({
    where: { branchId: branch.id, name: { equals: DEPT_NAME, mode: "insensitive" } },
    select: { id: true, name: true, collarType: true },
  });
  if (!dept) { console.error(`No "${DEPT_NAME}" department in ${branch.name}. Aborting.`); process.exitCode = 1; return; }

  const user = await prisma.user.findUnique({
    where: { empCode: EMP_CODE },
    select: {
      id: true, empCode: true, name: true, role: true, collarType: true, branchId: true,
      department: { select: { name: true, branch: { select: { name: true } } } },
      hrBranchAssignments: { select: { branch: { select: { name: true } } } },
    },
  });
  if (!user) { console.error(`User ${EMP_CODE} not found. Aborting.`); process.exitCode = 1; return; }

  const allBranches = await prisma.branch.findMany({ select: { id: true, name: true } });
  const bn = new Map(allBranches.map((b) => [b.id, b.name]));

  // Stale candidate rows across every branch-scoped evaluation table.
  const staleByTable = [];
  for (const t of STAGE_TABLES) {
    const rows = await prisma[t.key].findMany({ where: { userId: user.id }, select: { id: true, branchId: true } });
    if (rows.length > 0) staleByTable.push({ ...t, rows });
  }
  const staleCount = staleByTable.reduce((n, t) => n + t.rows.length, 0);

  console.log(`\n  ${user.empCode}  ${user.name}  [role ${user.role}]`);
  console.log(`    HR assignment(s): ${user.hrBranchAssignments.map((a) => a.branch?.name).filter(Boolean).join(", ") || "(none)"}  (left unchanged)`);
  console.log(`    employee dept : ${user.department?.branch?.name || "(none)"} / ${user.department?.name || "(none)"}  ->  ${branch.name} / ${dept.name}`);
  console.log(`    branchId      : ${bn.get(user.branchId) || "(none)"}  ->  ${branch.name}`);
  console.log(`    collarType    : ${user.collarType || "(none)"}  ->  ${dept.collarType}`);
  console.log(`    passwords/role: unchanged (dual login preserved)`);
  console.log(`    stale candidate rows to delete: ${staleCount}`);
  for (const t of staleByTable) {
    for (const r of t.rows) console.log(`      - ${t.label} @ ${bn.get(r.branchId) || r.branchId}`);
  }

  if (!APPLY) {
    console.log("\nDry run complete — no database changes made. Re-run with --apply to write.");
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { departmentId: dept.id, branchId: branch.id, collarType: dept.collarType },
    });
    for (const t of staleByTable) {
      await tx[t.key].deleteMany({ where: { id: { in: t.rows.map((r) => r.id) } } });
    }
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: "HR_EMPLOYEE_BRANCH_RELOCATED",
        details: {
          empCode: user.empCode, toBranchId: branch.id, toDepartmentId: dept.id,
          deletedCandidateRows: staleByTable.map((t) => ({ table: t.key, count: t.rows.length })),
          script: "relocate-lavish-jaipur-hr",
        },
      },
    }).catch(() => {});
  });

  console.log(`\n  Moved ${user.name} to ${branch.name}/${dept.name} and deleted ${staleCount} stale candidate row(s).`);
  console.log("Done.");
}

main()
  .catch((e) => { console.error("RELOCATE FAILED:", e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
