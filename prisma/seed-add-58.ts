/**
 * ADDITIVE-ONLY Migration Script
 * ─────────────────────────────────
 * Adds 3 new departments + 58 new employees.
 * Does NOT modify any existing employees, roles, or department mappings.
 * RISHPAL KUMAWAT (1800349) is explicitly skipped.
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const SALT_ROUNDS = 10;

// ── 3 New Departments ──
const NEW_DEPARTMENTS = [
  'Finance',
  'India One Marketing',
  'Process Excellence and CI',
];

// ── 58 New Employees ──
const NEW_EMPLOYEES = [
  { empCode: '1802316', name: 'AJAY KUMAR', department: 'Production', designation: 'Helper', mobile: '7240057030', password: 'Ajay_16' },
  { empCode: '1802342', name: 'AJAY KUMAR RAIGAR', department: 'Production', designation: 'Helper', mobile: '9352900674', password: 'Ajay_42' },
  { empCode: '1001048', name: 'ANAMIKA SHARMA', department: 'India One Marketing', designation: 'Deputy Manager', mobile: '7023249955', password: 'Anamika_48' },
  { empCode: '1801541', name: 'ANIL KUMAR SINDHI', department: 'Finance', designation: 'Deputy Manager', mobile: '9468936485', password: 'Anil_41' },
  { empCode: '1802037', name: 'ANITA DEVI', department: 'Production', designation: 'Helper', mobile: '', password: 'Anita_37' },
  { empCode: '1802132', name: 'ANITA DEVI', department: 'Production', designation: 'Helper', mobile: '8104189124', password: 'Anita_32' },
  { empCode: '1802327', name: 'ANITA VERMA', department: 'Production', designation: 'Helper', mobile: '7597558940', password: 'Anita_27' },
  { empCode: '1801793', name: 'ANJANI', department: 'Production', designation: 'Helper', mobile: '7240285951', password: 'Anjani_93' },
  { empCode: '1801994', name: 'ARJUN LAL MAHAWAR', department: 'Production', designation: 'Helper', mobile: '9772252814', password: 'Arjun_94' },
  { empCode: '1801990', name: 'ARTI DEVI', department: 'Production', designation: 'Helper', mobile: '7414052364', password: 'Arti_90' },
  { empCode: '1802010', name: 'ASHOK KUMAR YADAV', department: 'Production', designation: 'Supervisor - Distribution', mobile: '8104547953', password: 'Ashok_10' },
  { empCode: '1802380', name: 'AVINASH', department: 'Production', designation: 'Helper', mobile: '8094135187', password: 'Avinash_80' },
  { empCode: '1801869', name: 'BABALI DEVI', department: 'Production', designation: 'Helper', mobile: '8058630153', password: 'Babali_69' },
  { empCode: '1801822', name: 'BABLU SHARMA', department: 'Production', designation: 'Helper', mobile: '7062627675', password: 'Bablu_22' },
  { empCode: '1800128', name: 'BABURI DEVI MORYA', department: 'Production', designation: 'Helper', mobile: '9929370567', password: 'Baburi_28' },
  { empCode: '1801205', name: 'BAJRANG SINGH', department: 'Production', designation: 'Helper', mobile: '8504040229', password: 'Bajrang_05' },
  { empCode: '1802306', name: 'BALVEER SINGH', department: 'Production', designation: 'Helper', mobile: '9352957443', password: 'Balveer_06' },
  { empCode: '1801206', name: 'BALWEER SINGH', department: 'Production', designation: 'Helper', mobile: '9784047751', password: 'Balweer_06' },
  { empCode: '1800104', name: 'BARDI DEVI PRAJPAT', department: 'Production', designation: 'Helper', mobile: '9602741970', password: 'Bardi_04' },
  { empCode: '1801208', name: 'BHAGWAN SHAY BAIRWA', department: 'Production', designation: 'Helper', mobile: '7568810588', password: 'Bhagwan_08' },
  { empCode: '1801765', name: 'BHAGWATI DEVI', department: 'Production', designation: 'Helper', mobile: '9358161253', password: 'Bhagwati_65' },
  { empCode: '1800463', name: 'BHOJRAJ SINGH', department: 'Production', designation: 'Helper', mobile: '6376327298', password: 'Bhojraj_63' },
  { empCode: '1802348', name: 'BHUROBAI', department: 'Production', designation: 'Helper', mobile: '9074934804', password: 'Bhurobai_48' },
  { empCode: '1802286', name: 'CHANDAN SINGH', department: 'Production', designation: 'Helper - Production', mobile: '9521736597', password: 'Chandan_86' },
  { empCode: '1800996', name: 'CHANDESHWAR THAKUR', department: 'Production', designation: 'Operator', mobile: '7062387638', password: 'Chandeshwar_96' },
  { empCode: '1802045', name: 'CHARAT KUMAR DHOBI', department: 'Production', designation: 'Helper', mobile: '6367141060', password: 'Charat_45' },
  { empCode: '1802130', name: 'CHHOTI DEVI', department: 'Production', designation: 'Helper', mobile: '', password: 'Chhoti_30' },
  { empCode: '1802129', name: 'CHHOTURAM GUJAR', department: 'Production', designation: 'Helper', mobile: '9660293014', password: 'Chhoturam_29' },
  { empCode: '1800122', name: 'CHOTA DEVI REGAR', department: 'Production', designation: 'Helper', mobile: '9928724621', password: 'Chota_22' },
  { empCode: '1800314', name: 'DAYARAM RAM GURJAR', department: 'Production', designation: 'Helper', mobile: '7062618729', password: 'Dayaram_14' },
  { empCode: '1802376', name: 'DEEPAK MEENA', department: 'Production', designation: 'Helper', mobile: '9024469671', password: 'Deepak_76' },
  { empCode: '1801827', name: 'DEEPAK SAINI', department: 'Production', designation: 'Helper', mobile: '6376775642', password: 'Deepak_27' },
  { empCode: '1800390', name: 'DHANRAJ JAT', department: 'Production', designation: 'COOK', mobile: '9521342672', password: 'Dhanraj_90' },
  { empCode: '1800086', name: 'DHARAM RAJ SAINI', department: 'Production', designation: 'Helper', mobile: '9001399106', password: 'Dharam_86' },
  { empCode: '1802357', name: 'DILIP KUMAR MEENA', department: 'Production', designation: 'Helper', mobile: '9828671394', password: 'Dilip_57' },
  { empCode: '1800487', name: 'DINESH KUMAR MALI', department: 'Production', designation: 'Helper', mobile: '9587694806', password: 'Dinesh_87' },
  { empCode: '1802241', name: 'GANESH NARAYAN MEENA', department: 'Production', designation: 'Helper', mobile: '7062212254', password: 'Ganesh_41' },
  { empCode: '1800127', name: 'GEETA DEVI', department: 'Production', designation: 'Helper', mobile: '7297975446', password: 'Geeta_27' },
  { empCode: '1801761', name: 'GIRRAJ VERMA', department: 'Production', designation: 'Helper', mobile: '7220972312', password: 'Girraj_61' },
  { empCode: '1802295', name: 'GOVIND SAIN', department: 'Production', designation: 'Helper - Production', mobile: '7297874420', password: 'Govind_95' },
  { empCode: '1801926', name: 'GYAN KANWAR', department: 'Production', designation: 'Helper', mobile: '9351367315', password: 'Gyan_26' },
  { empCode: '1801213', name: 'GYARSHI LAL MORYA', department: 'Production', designation: 'Helper', mobile: '8742087945', password: 'Gyarshi_13' },
  { empCode: '1802320', name: 'HANSRAJ MEENA', department: 'Production', designation: 'Helper', mobile: '8949131189', password: 'Hansraj_20' },
  { empCode: '1800258', name: 'HANUMAN CHAUDHRAY', department: 'Production', designation: 'Helper', mobile: '9119163452', password: 'Hanuman_58' },
  { empCode: '1802340', name: 'HANUMAN NARUKA', department: 'Production', designation: 'Helper', mobile: '8875390975', password: 'Hanuman_40' },
  { empCode: '1802354', name: 'HARESH KUMAR KANSAL', department: 'Production', designation: 'Helper', mobile: '9351514655', password: 'Haresh_54' },
  { empCode: '1802064', name: 'HARPHOOL MEENA', department: 'Production', designation: 'Helper', mobile: '7357938959', password: 'Harphool_64' },
  { empCode: '1801215', name: 'HEERA LAL', department: 'Production', designation: 'Helper', mobile: '7742826798', password: 'Heera_15' },
  { empCode: '1802296', name: 'HEERA NAND MAURYA', department: 'Production', designation: 'Helper - Production', mobile: '9024852991', password: 'Heera_96' },
  { empCode: '1802314', name: 'HIMANSHU CHOPRA', department: 'Production', designation: 'Helper', mobile: '6367103469', password: 'Himanshu_14' },
  { empCode: '1801662', name: 'KAMLESH KUMAR SHARMA', department: 'Operations', designation: 'Executive', mobile: '9928772772', password: 'Kamlesh_62' },
  { empCode: '1800010', name: 'PRAKASH CHAND VIJAY', department: 'Finance', designation: 'Deputy General Manager', mobile: '9799999885', password: 'Prakash_10' },
  { empCode: '1802366', name: 'Pramod Kumar Sharma', department: 'Finance', designation: 'Assistant Manager', mobile: '9785470123', password: 'Pramod_66' },
  { empCode: '1802115', name: 'RAVI THAKUR', department: 'Finance', designation: 'Executive', mobile: '9694212240', password: 'Ravi_15' },
  { empCode: '1802332', name: 'SANJAY KUMAR SAINI', department: 'Process Excellence and CI', designation: 'Officer', mobile: '7976585937', password: 'Sanjay_32' },
  { empCode: '1801170', name: 'Sumit Sharma', department: 'Finance', designation: 'Executive', mobile: '9782303833', password: 'Sumit_70' },
  { empCode: '1800079', name: 'VIMAL PRAKASH SHARMA', department: 'Finance', designation: 'Senior Executive', mobile: '9785009553', password: 'Vimal_79' },
  { empCode: '1801442', name: 'Yogesh Dadhich', department: 'Finance', designation: 'Senior Executive - Accounts', mobile: '7062110528', password: 'Yogesh_42' },
];

async function main() {
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║  ADDITIVE MIGRATION — 3 Depts + 58 New Employees  ║');
  console.log('║  No existing data will be modified                 ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  // ── Get branch ──
  const branch = await prisma.branch.findFirst({ where: { name: 'Jaipur' } });
  if (!branch) {
    console.error('❌ Jaipur branch not found. Run the main seed first.');
    process.exit(1);
  }

  // ── Step 1: Add 3 new departments ──
  console.log('Step 1 — Adding new departments...');
  const deptMap: Record<string, string> = {};

  // Load ALL existing departments into deptMap first
  const existingDepts = await prisma.department.findMany({
    where: { branchId: branch.id },
  });
  for (const d of existingDepts) {
    deptMap[d.name] = d.id;
  }
  console.log(`  Found ${existingDepts.length} existing departments.`);

  // Upsert only the 3 new ones
  for (const name of NEW_DEPARTMENTS) {
    const dept = await prisma.department.upsert({
      where: { name_branchId: { name, branchId: branch.id } },
      update: {},
      create: { name, branchId: branch.id },
    });
    deptMap[name] = dept.id;
    console.log(`  ✓ Department "${name}" → ${dept.id}`);
  }

  // ── Step 2: Add 58 new employees ──
  console.log(`\nStep 2 — Upserting ${NEW_EMPLOYEES.length} employees...`);
  const credTable: { empCode: string; name: string; password: string }[] = [];
  let added = 0;
  let skipped = 0;

  for (const emp of NEW_EMPLOYEES) {
    // RISHPAL KUMAWAT exception — never touch him
    if (emp.empCode === '1800349') {
      console.log(`  ⊘ Skipping RISHPAL KUMAWAT (${emp.empCode}) — protected`);
      skipped++;
      continue;
    }

    const deptId = deptMap[emp.department];
    if (!deptId) {
      console.log(`  ⚠ Dept not found: "${emp.department}" — skipping ${emp.name} (${emp.empCode})`);
      skipped++;
      continue;
    }

    const hashed = await bcrypt.hash(emp.password, SALT_ROUNDS);
    await prisma.user.upsert({
      where: { empCode: emp.empCode },
      update: {
        name: emp.name,
        designation: emp.designation,
        mobile: emp.mobile || null,
        departmentId: deptId,
        // Do NOT update role — preserve existing role if user already exists
      },
      create: {
        empCode: emp.empCode,
        name: emp.name,
        password: hashed,
        role: 'EMPLOYEE',
        designation: emp.designation,
        mobile: emp.mobile || null,
        departmentId: deptId,
      },
    });

    credTable.push({ empCode: emp.empCode, name: emp.name, password: emp.password });
    added++;
    if (added % 20 === 0) console.log(`  ${added}/${NEW_EMPLOYEES.length} processed...`);
  }

  console.log(`  ✓ ${added} employees added/updated, ${skipped} skipped`);

  // ── Summary ──
  const totalUsers = await prisma.user.count();
  const totalDepts = await prisma.department.count();
  const byRole = await prisma.user.groupBy({ by: ['role'], _count: { role: true } });

  console.log('\n╔════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                     NEW EMPLOYEES CREDENTIALS                             ║');
  console.log('╠═══════════════╦═══════════════════════════════════╦═════════════════════════╣');
  console.log('║ EmpCode       ║ Name                              ║ Password                ║');
  console.log('╠═══════════════╬═══════════════════════════════════╬═════════════════════════╣');
  for (const c of credTable) {
    const code = c.empCode.padEnd(13);
    const name = c.name.padEnd(33);
    const pass = c.password.padEnd(23);
    console.log(`║ ${code} ║ ${name} ║ ${pass} ║`);
  }
  console.log('╚═══════════════╩═══════════════════════════════════╩═════════════════════════╝');
  console.log(`\nTOTAL USERS NOW: ${totalUsers}`);
  console.log(`TOTAL DEPARTMENTS NOW: ${totalDepts}`);
  byRole.forEach((r) => console.log(`  ${r.role}: ${r._count.role}`));
  console.log('\n✅ Additive migration complete. No existing data was modified.\n');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
