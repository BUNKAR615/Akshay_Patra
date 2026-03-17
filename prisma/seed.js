const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const data1 = require('./employees-part1');
const data2 = require('./employees-part2');

const prisma = new PrismaClient();

async function main() {
  console.log('Cleaning database...');
  await prisma.$executeRawUnsafe('TRUNCATE TABLE users CASCADE');
  await prisma.$executeRawUnsafe('TRUNCATE TABLE departments CASCADE');
  await prisma.$executeRawUnsafe('TRUNCATE TABLE branches CASCADE');

  // Step 1: Create Branch
  console.log('Creating Jaipur branch...');
  const branch = await prisma.branch.create({
    data: { name: 'Jaipur', location: 'Jaipur, Rajasthan' }
  });

  // Step 2: Create 14 Departments
  const deptNames = [
    'Administration', 'Distribution', 'Finance',
    'Human Resources', 'India One Marketing',
    'Information Technology', 'Maintenance', 'Operations',
    'Process Excellence and CI', 'Procurement',
    'Production', 'Quality', 'Security', 'Stores'
  ];

  console.log('Creating 14 departments...');
  const deptMap = {};
  for (const name of deptNames) {
    const dept = await prisma.department.create({
      data: { name, branchId: branch.id }
    });
    deptMap[name] = dept.id;
  }

  // Step 3: Seed all employees
  const allEmployees = [...data1, ...data2];
  console.log(`Seeding ${allEmployees.length} employees...`);

  const supervisors = [];
  let count = 0;

  for (const emp of allEmployees) {
    const hashed = await bcrypt.hash(emp.password, 10);
    const user = await prisma.user.create({
      data: {
        empCode: emp.empCode,
        name: emp.name,
        email: emp.empCode + '@akshayapatra.org',
        password: hashed,
        role: emp.role,
        designation: emp.designation,
        departmentId: deptMap[emp.department]
      }
    });

    if (emp.role === 'SUPERVISOR') {
      supervisors.push({ name: emp.name, empCode: emp.empCode, password: emp.password, department: emp.department });
    }

    count++;
    if (count % 50 === 0) console.log(`  ${count}/${allEmployees.length} users created...`);
  }

  // Print credentials table
  console.log('\n======================================');
  console.log('AKSHAYA PATRA JAIPUR — LOGIN CREDENTIALS');
  console.log('======================================');
  console.log('ADMIN:');
  console.log('  Name: RISHPAL KUMAWAT');
  console.log('  Username: 1800349 | Password: Rishpal_49');
  console.log('CLUSTER MANAGER:');
  console.log('  Name: AMIT KESHWA');
  console.log('  Username: 1800022 | Password: Amit_22');
  console.log('BRANCH MANAGER:');
  console.log('  Name: SANT KUMAR SHARMA');
  console.log('  Username: 1800011 | Password: Sant_11');
  console.log(`SUPERVISORS (${supervisors.length} total):`);
  for (const s of supervisors) {
    console.log(`  ${s.name} (${s.department}) — Username: ${s.empCode} | Password: ${s.password}`);
  }
  console.log(`TOTAL EMPLOYEES SEEDED: ${count}`);
  console.log('======================================\n');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
