/**
 * Wipe every non-ADMIN user and all branch/Org-Structure assignments.
 *
 * Preserves: branches, departments, quarters, questions, ADMIN users,
 *            archived_employees, blacklisted_tokens.
 *
 * Cascade-clears (via FK onDelete: Cascade on User):
 *   evaluations, shortlists, self-assessments, notifications, audit logs,
 *   employee_quarter_questions, best_employees, all *_assignments tied to users.
 *
 * Run: node scripts/wipe-non-admin-people.js
 */

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function snapshot(label) {
  const [
    totalUsers,
    byRole,
    bm,
    cm,
    hr,
    committee,
    hodA,
    empHodA,
    deptRoles,
    branches,
    departments,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.groupBy({ by: ["role"], _count: { role: true } }),
    prisma.branchManagerAssignment.count(),
    prisma.clusterManagerBranchAssignment.count(),
    prisma.hrBranchAssignment.count(),
    prisma.committeeBranchAssignment.count(),
    prisma.hodAssignment.count(),
    prisma.employeeHodAssignment.count(),
    prisma.departmentRoleMapping.count(),
    prisma.branch.count(),
    prisma.department.count(),
  ]);

  console.log(`\n=== ${label} ===`);
  console.log(`users: ${totalUsers}`);
  for (const r of byRole) {
    console.log(`  ${r.role}: ${r._count.role}`);
  }
  console.log(`bm_branch_assignments:        ${bm}`);
  console.log(`cm_branch_assignments:        ${cm}`);
  console.log(`hr_branch_assignments:        ${hr}`);
  console.log(`committee_branch_assignments: ${committee}`);
  console.log(`hod_assignments:              ${hodA}`);
  console.log(`employee_hod_assignments:     ${empHodA}`);
  console.log(`department_role_mappings:    ${deptRoles}`);
  console.log(`branches:                     ${branches}`);
  console.log(`departments:                  ${departments}`);

  return { totalUsers, byRole };
}

async function main() {
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║  WIPE NON-ADMIN PEOPLE — Akshaya Patra      ║");
  console.log("╚══════════════════════════════════════════════╝");

  const before = await snapshot("BEFORE");

  const adminCount =
    before.byRole.find((r) => r.role === "ADMIN")?._count.role ?? 0;
  const nonAdminCount = before.totalUsers - adminCount;

  if (adminCount === 0) {
    console.error(
      "\nABORT: No ADMIN user exists. Refusing to wipe — would lock everyone out."
    );
    process.exit(1);
  }

  if (nonAdminCount === 0) {
    console.log(
      "\nNothing to do: there are already 0 non-ADMIN users. Exiting cleanly."
    );
    return;
  }

  console.log(
    `\nWill delete ${nonAdminCount} non-ADMIN user(s); ${adminCount} ADMIN user(s) will remain.`
  );

  const result = await prisma.$transaction([
    prisma.branchManagerAssignment.deleteMany({}),
    prisma.clusterManagerBranchAssignment.deleteMany({}),
    prisma.hrBranchAssignment.deleteMany({}),
    prisma.committeeBranchAssignment.deleteMany({}),
    prisma.hodAssignment.deleteMany({}),
    prisma.employeeHodAssignment.deleteMany({}),
    prisma.departmentRoleMapping.deleteMany({}),
    prisma.user.deleteMany({ where: { role: { not: "ADMIN" } } }),
    prisma.department.updateMany({
      where: { branchManagerId: { not: null } },
      data: { branchManagerId: null },
    }),
    prisma.department.updateMany({
      where: { supervisorId: { not: null } },
      data: { supervisorId: null },
    }),
  ]);

  console.log("\nTransaction complete:");
  console.log(`  branch managers deleted:        ${result[0].count}`);
  console.log(`  cluster managers deleted:       ${result[1].count}`);
  console.log(`  hr assignments deleted:         ${result[2].count}`);
  console.log(`  committee assignments deleted:  ${result[3].count}`);
  console.log(`  hod assignments deleted:        ${result[4].count}`);
  console.log(`  employee-hod assignments deleted: ${result[5].count}`);
  console.log(`  department role mappings deleted: ${result[6].count}`);
  console.log(`  non-admin users deleted:        ${result[7].count}`);
  console.log(`  departments cleared (branchManagerId): ${result[8].count}`);
  console.log(`  departments cleared (supervisorId):    ${result[9].count}`);

  await snapshot("AFTER");

  console.log("\n✓ Wipe complete. Admin login preserved.");
}

main()
  .catch((e) => {
    console.error("\nWipe FAILED:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
