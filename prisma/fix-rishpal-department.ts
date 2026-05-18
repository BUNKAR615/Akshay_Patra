/**
 * One-time data fix — Rishpal Kumawat's department.
 *
 * The admin Rishpal Kumawat (empCode 1800349) lost his department link, so the
 * admin profile card on the dashboard shows no Department / Branch. This
 * restores him to the Jaipur "Information Technology" department — the same
 * placement the seed defines (prisma/seed-data/employees1.ts). His ADMIN role
 * is left untouched; only `departmentId` is set, which is what the profile
 * card and /api/auth/me use to show Department and (derived) Branch.
 *
 * Idempotent — safe to run more than once.
 *
 * Run once with:  npx tsx prisma/fix-rishpal-department.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const EMP_CODE = '1800349';
const BRANCH_NAME = 'Jaipur';
const DEPARTMENT_NAME = 'Information Technology';

async function main() {
  console.log(`\nRestoring department for ${EMP_CODE} (Rishpal Kumawat)...\n`);

  const user = await prisma.user.findUnique({
    where: { empCode: EMP_CODE },
    select: { id: true, name: true, role: true, departmentId: true },
  });
  if (!user) {
    console.log(`  ⚠ No user found with empCode ${EMP_CODE} — nothing to do.`);
    return;
  }

  const department = await prisma.department.findFirst({
    where: { name: DEPARTMENT_NAME, branch: { name: BRANCH_NAME } },
    select: { id: true },
  });
  if (!department) {
    console.log(`  ⚠ "${DEPARTMENT_NAME}" department not found in "${BRANCH_NAME}" — aborting.`);
    return;
  }

  console.log(`  Before: role=${user.role} departmentId=${user.departmentId ?? 'null'}`);

  if (user.departmentId === department.id) {
    console.log(`  ✓ Already linked to ${BRANCH_NAME} / ${DEPARTMENT_NAME} — no change needed.\n`);
    return;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { departmentId: department.id },
  });

  console.log(`  After:  role=${user.role} departmentId=${department.id}`);
  console.log(`\n✓ ${user.name} now shows in ${BRANCH_NAME} / ${DEPARTMENT_NAME} on the admin page.\n`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
