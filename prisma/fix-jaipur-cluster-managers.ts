/**
 * One-time data fix — Jaipur Cluster Managers.
 *
 * Multiple users show as Cluster Manager in Jaipur because they carry
 * `role = CLUSTER_MANAGER` while still scoped to a Jaipur department/branch.
 * The proper CM is the one holding Jaipur's `cm_branch_assignments` record.
 *
 * This script keeps that official Cluster Manager and demotes every other
 * Jaipur CLUSTER_MANAGER user back to a normal EMPLOYEE. Bhawani Singh
 * (empCode 1802215) is additionally stripped of every manager mapping and,
 * if needed, restored to the Quality department.
 *
 * Idempotent — safe to run more than once.
 *
 * Run once with:  npx tsx prisma/fix-jaipur-cluster-managers.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const BRANCH_NAME = 'Jaipur';
const BHAWANI_EMP_CODE = '1802215';
const BHAWANI_DEPARTMENT = 'Quality';

async function main() {
  console.log(`\nCleaning up Cluster Managers for branch "${BRANCH_NAME}"...\n`);

  const branch = await prisma.branch.findFirst({
    where: { name: BRANCH_NAME },
    select: { id: true },
  });
  if (!branch) {
    console.log(`  ⚠ Branch "${BRANCH_NAME}" not found — aborting.`);
    return;
  }

  // The official Cluster Manager = whoever holds Jaipur's assignment row.
  // `branchId` is unique on cm_branch_assignments, so there is at most one.
  const officialAssignment = await prisma.clusterManagerBranchAssignment.findUnique({
    where: { branchId: branch.id },
    select: { cmUserId: true },
  });
  const officialCmUserId = officialAssignment?.cmUserId ?? null;

  // Wrong CMs — role=CLUSTER_MANAGER and still scoped to Jaipur (a Jaipur
  // department or branchId), excluding the official assignment holder.
  const wrongCMs = await prisma.user.findMany({
    where: {
      role: 'CLUSTER_MANAGER',
      OR: [{ branchId: branch.id }, { department: { branchId: branch.id } }],
      ...(officialCmUserId ? { id: { not: officialCmUserId } } : {}),
    },
    select: { id: true, empCode: true, name: true, departmentId: true },
  });

  // Jaipur "Quality" department — used to restore Bhawani if his dept is null.
  const qualityDept = await prisma.department.findFirst({
    where: { name: BHAWANI_DEPARTMENT, branchId: branch.id },
    select: { id: true },
  });

  if (wrongCMs.length === 0) {
    console.log('  ✓ No stale Cluster Managers found for Jaipur.');
  }

  for (const u of wrongCMs) {
    const isBhawani = u.empCode === BHAWANI_EMP_CODE;
    await prisma.$transaction(async (tx) => {
      // No longer a CM anywhere — drop any assignment rows they hold.
      await tx.clusterManagerBranchAssignment.deleteMany({ where: { cmUserId: u.id } });

      if (isBhawani) {
        // Bhawani must be a normal employee only — strip every manager mapping.
        await tx.branchManagerAssignment.deleteMany({ where: { bmUserId: u.id } });
        await tx.departmentRoleMapping.deleteMany({ where: { userId: u.id } });
      }

      await tx.user.update({
        where: { id: u.id },
        data: {
          role: 'EMPLOYEE',
          ...(isBhawani && !u.departmentId && qualityDept
            ? { departmentId: qualityDept.id }
            : {}),
        },
      });
    });
    console.log(`  demoted → EMPLOYEE: ${u.empCode ?? '(no code)'} ${u.name}`);
  }

  // Make sure the retained official CM actually carries the role.
  if (officialCmUserId) {
    const cm = await prisma.user.update({
      where: { id: officialCmUserId },
      data: { role: 'CLUSTER_MANAGER' },
      select: { empCode: true, name: true },
    });
    console.log(`\n  retained Cluster Manager: ${cm.empCode ?? '(no code)'} ${cm.name}`);
  } else {
    console.log('\n  ⚠ Jaipur has no official Cluster Manager assignment.');
    console.log('    Every Jaipur CLUSTER_MANAGER was demoted. Assign the correct one');
    console.log('    via Org Structure → Cluster Manager.');
  }

  console.log(`\n✓ Done. ${wrongCMs.length} stale Cluster Manager(s) demoted for ${BRANCH_NAME}.\n`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
