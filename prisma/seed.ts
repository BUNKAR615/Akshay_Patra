import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { DEPARTMENTS } from './seed-data/departments';
import { employees1 } from './seed-data/employees1';
import { employees2 } from './seed-data/employees2';
import { employees3 } from './seed-data/employees3';
import { employees4 } from './seed-data/employees4';
import { ROLE_MAPPINGS } from './seed-data/roleMappings';
import { QUESTIONS } from './seed-data/questions';

const prisma = new PrismaClient();
const SALT_ROUNDS = 10;

async function main() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  AKSHAYA PATRA — SEED SCRIPT v3             ║');
  console.log('║  287 Employees | 16 Departments | 39 Roles  ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  // ── Step 0: Clean existing data ──
  console.log('Cleaning database...');
  await prisma.$executeRawUnsafe('TRUNCATE TABLE department_role_mappings CASCADE');
  await prisma.$executeRawUnsafe('TRUNCATE TABLE users CASCADE');
  await prisma.$executeRawUnsafe('TRUNCATE TABLE departments CASCADE');
  await prisma.$executeRawUnsafe('TRUNCATE TABLE branches CASCADE');

  // ── Step 1: Create Branch ──
  console.log('Creating Jaipur branch...');
  const branch = await prisma.branch.upsert({
    where: { name: 'Jaipur' },
    update: { location: 'Jaipur, Rajasthan' },
    create: { name: 'Jaipur', slug: 'jaipur', location: 'Jaipur, Rajasthan' },
  });

  // ── Step 2: Upsert 13 Departments ──
  console.log(`Creating ${DEPARTMENTS.length} departments...`);
  const deptMap: Record<string, string> = {};
  for (const name of DEPARTMENTS) {
    const dept = await prisma.department.upsert({
      where: { name_branchId: { name, branchId: branch.id } },
      update: {},
      create: { name, branchId: branch.id },
    });
    deptMap[name] = dept.id;
  }

  // ── Step 3: Upsert all 287 employees ──
  const allEmployees = [...employees1, ...employees2, ...employees3, ...employees4];
  console.log(`Seeding ${allEmployees.length} employees...`);

  const credentialsTable: { empCode: string; name: string; password: string }[] = [];
  let count = 0;

  for (const emp of allEmployees) {
    const deptId = deptMap[emp.department];
    if (!deptId) {
      console.log(`  ⚠ Department not found: "${emp.department}" — skipping ${emp.name} (${emp.empCode})`);
      continue;
    }

    // RISHPAL KUMAWAT: full ADMIN (others default to EMPLOYEE)
    const isRishpal = emp.empCode === '1800349';
    const userRole = isRishpal ? 'ADMIN' : 'EMPLOYEE';

    const hashed = await bcrypt.hash(emp.password, SALT_ROUNDS);
    await prisma.user.upsert({
      where: { empCode: emp.empCode },
      update: {
        name: emp.name,
        designation: emp.designation,
        mobile: emp.mobile || null,
        departmentId: deptId,
        role: userRole as any,
      },
      create: {
        empCode: emp.empCode,
        name: emp.name,
        password: hashed,
        role: userRole as any,
        designation: emp.designation,
        mobile: emp.mobile || null,
        departmentId: deptId,
      },
    });

    credentialsTable.push({ empCode: emp.empCode, name: emp.name, password: emp.password });
    count++;
    if (count % 50 === 0) console.log(`  ${count}/${allEmployees.length} users created...`);
  }
  console.log(`  ✓ ${count} users seeded`);

  // ── Step 4: Upsert DepartmentRoleMapping records ──
  console.log(`\nCreating ${ROLE_MAPPINGS.length} DepartmentRoleMapping records...`);
  let roleCount = 0;
  for (const rm of ROLE_MAPPINGS) {
    const user = await prisma.user.findUnique({ where: { empCode: rm.empCode } });
    const deptId = deptMap[rm.department];
    if (!user || !deptId) {
      console.log(`  ⚠ Skipping role mapping: empCode=${rm.empCode}, dept=${rm.department}`);
      continue;
    }

    const existing = await prisma.departmentRoleMapping.findFirst({
      where: { userId: user.id, departmentId: deptId, role: rm.role as any },
    });
    if (!existing) {
      await prisma.departmentRoleMapping.create({
        data: { userId: user.id, departmentId: deptId, role: rm.role as any },
      });
    }
    roleCount++;
  }
  console.log(`  ✓ ${roleCount} role mappings created`);

  // ── Step 5: Seed Questions ──
  console.log('\nSeeding questions...');
  for (const q of QUESTIONS) {
    const existing = await prisma.question.findFirst({ where: { text: q.text } });
    if (existing) {
      await prisma.question.update({
        where: { id: existing.id },
        data: { textHindi: q.textHindi, category: q.category as any, level: q.level as any, isActive: q.isActive },
      });
    } else {
      await prisma.question.create({
        data: { text: q.text, textHindi: q.textHindi, category: q.category as any, level: q.level as any, isActive: q.isActive },
      });
    }
  }

  const self = await prisma.question.count({ where: { level: 'SELF' } });
  const sup = await prisma.question.count({ where: { level: 'SUPERVISOR' } });
  const bm = await prisma.question.count({ where: { level: 'BRANCH_MANAGER' } });
  const cm = await prisma.question.count({ where: { level: 'CLUSTER_MANAGER' } });
  console.log(`  ✓ ${self + sup + bm + cm} questions (SELF:${self} SUP:${sup} BM:${bm} CM:${cm})`);

  // ── Step 6: Print credentials table ──
  const total = await prisma.user.count();
  const byRole = await prisma.user.groupBy({ by: ['role'], _count: { role: true } });

  console.log('\n╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║                        SEED COMPLETE                                    ║');
  console.log('╠═══════════════╦═══════════════════════════════════╦══════════════════════╣');
  console.log('║ EmpCode       ║ Name                              ║ Password             ║');
  console.log('╠═══════════════╬═══════════════════════════════════╬══════════════════════╣');
  for (const c of credentialsTable) {
    const code = c.empCode.padEnd(13);
    const name = c.name.padEnd(33);
    const pass = c.password.padEnd(20);
    console.log(`║ ${code} ║ ${name} ║ ${pass} ║`);
  }
  console.log('╚═══════════════╩═══════════════════════════════════╩══════════════════════╝');
  console.log(`\nTOTAL USERS: ${total}`);
  byRole.forEach((r) => console.log(`  ${r.role}: ${r._count.role}`));
  console.log('');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
