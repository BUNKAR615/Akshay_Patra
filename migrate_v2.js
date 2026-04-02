/**
 * Migration V2: Restructure departments from Excel tabs
 * - Creates sub-departments (Production-Helper, Distribution-Driver, etc.)
 * - Moves employees to correct sub-departments
 * - Creates evaluator-only users (no EMPLOYEE role)
 * - Sets up departmentRoleMapping for all evaluators
 * - Removes employee records for evaluator-only users
 * - Preserves RISHPAL KUMAWAT as ADMIN
 */

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const fs = require("fs");

const prisma = new PrismaClient({ log: ["error"] });
const SALT = 10;

async function main() {
  const data = JSON.parse(fs.readFileSync("migration_data.json", "utf-8"));
  const { employees, departmentEvaluators, evaluatorEmpCodes, allDepartments } = data;

  console.log(`\n=== MIGRATION V2 START ===`);
  console.log(`Employees: ${employees.length}`);
  console.log(`Departments: ${allDepartments.length}`);
  console.log(`Evaluators to create: ${evaluatorEmpCodes.length}`);

  // 1. Get branch (Jaipur)
  let branch = await prisma.branch.findFirst({ where: { name: "Jaipur" } });
  if (!branch) {
    branch = await prisma.branch.create({
      data: { name: "Jaipur", location: "Jaipur, Rajasthan" },
    });
  }
  console.log(`\nBranch: ${branch.name} (${branch.id})`);

  // 2. Create all departments
  console.log(`\n--- Creating ${allDepartments.length} departments ---`);
  const deptMap = {}; // name -> id
  for (const deptName of allDepartments) {
    let dept = await prisma.department.findFirst({
      where: { name: deptName, branchId: branch.id },
    });
    if (!dept) {
      dept = await prisma.department.create({
        data: { name: deptName, branchId: branch.id },
      });
      console.log(`  CREATED: ${deptName}`);
    } else {
      console.log(`  EXISTS:  ${deptName}`);
    }
    deptMap[deptName] = dept.id;
  }

  // 3. Delete ALL existing departmentRoleMapping entries (we'll recreate them)
  const deletedMappings = await prisma.departmentRoleMapping.deleteMany({});
  console.log(`\nDeleted ${deletedMappings.count} old role mappings`);

  // 4. Process evaluators - create/update user records
  console.log(`\n--- Processing ${evaluatorEmpCodes.length} evaluators ---`);

  // Collect all unique evaluators with their info
  const evaluatorInfo = {};
  for (const [deptName, evals] of Object.entries(departmentEvaluators)) {
    for (const [role, info] of Object.entries(evals)) {
      if (!info) continue;
      if (!evaluatorInfo[info.empCode]) {
        evaluatorInfo[info.empCode] = { name: info.name, roles: [] };
      }
      evaluatorInfo[info.empCode].roles.push({ department: deptName, role });
    }
  }

  const evaluatorUserMap = {}; // empCode -> userId

  for (const [empCode, info] of Object.entries(evaluatorInfo)) {
    // Special case: RISHPAL KUMAWAT is ADMIN
    const isRishpal = empCode === "1800349";

    let user = await prisma.user.findFirst({ where: { empCode } });

    if (user) {
      // User exists - update role if needed
      if (isRishpal) {
        // Keep as ADMIN, don't change
        console.log(`  KEEP ADMIN: ${info.name} (${empCode})`);
      } else {
        // Change role from EMPLOYEE to EMPLOYEE (they still need a base role for login)
        // But remove them from being a regular employee
        await prisma.user.update({
          where: { id: user.id },
          data: { role: "EMPLOYEE", departmentId: null },
        });
        console.log(`  UPDATED: ${info.name} (${empCode}) - cleared departmentId`);
      }
      evaluatorUserMap[empCode] = user.id;
    } else {
      // Create new user for evaluator
      const password = `${info.name.split(" ")[0]}_${empCode.slice(-2)}`;
      const hashed = await bcrypt.hash(password, SALT);
      const email = `${empCode}@akshayapatra.org`;

      // Check if email already exists
      const existingEmail = await prisma.user.findFirst({ where: { email } });
      const finalEmail = existingEmail ? `${empCode}.eval@akshayapatra.org` : email;

      user = await prisma.user.create({
        data: {
          empCode,
          name: info.name,
          email: finalEmail,
          password: hashed,
          role: isRishpal ? "ADMIN" : "EMPLOYEE",
          departmentId: null,
        },
      });
      console.log(`  CREATED: ${info.name} (${empCode})`);
      evaluatorUserMap[empCode] = user.id;
    }
  }

  // 5. Create departmentRoleMapping entries for all evaluators
  console.log(`\n--- Creating role mappings ---`);
  let mappingCount = 0;
  for (const [deptName, evals] of Object.entries(departmentEvaluators)) {
    const deptId = deptMap[deptName];
    if (!deptId) {
      console.log(`  SKIP: No dept found for ${deptName}`);
      continue;
    }

    for (const [role, info] of Object.entries(evals)) {
      if (!info) continue;
      const userId = evaluatorUserMap[info.empCode];
      if (!userId) {
        console.log(`  SKIP: No user found for ${info.name} (${info.empCode})`);
        continue;
      }

      try {
        await prisma.departmentRoleMapping.create({
          data: { userId, departmentId: deptId, role },
        });
        mappingCount++;
      } catch (e) {
        if (e.code === "P2002") {
          console.log(`  DUP: ${info.name} ${role} for ${deptName}`);
        } else {
          throw e;
        }
      }
    }
  }
  console.log(`Created ${mappingCount} role mappings`);

  // 6. Process employees - create/update/move to correct departments
  console.log(`\n--- Processing ${employees.length} employees ---`);
  let created = 0, updated = 0, skipped = 0;

  for (const emp of employees) {
    const deptId = deptMap[emp.department];
    if (!deptId) {
      console.log(`  NO DEPT: ${emp.name} (${emp.empCode}) -> ${emp.department}`);
      skipped++;
      continue;
    }

    // Skip if this empCode is an evaluator
    if (evaluatorEmpCodes.includes(emp.empCode)) {
      skipped++;
      continue;
    }

    let user = await prisma.user.findFirst({ where: { empCode: emp.empCode } });

    if (user) {
      // Update existing employee
      await prisma.user.update({
        where: { id: user.id },
        data: {
          name: emp.name,
          departmentId: deptId,
          designation: emp.designation,
          mobile: emp.mobile || null,
          role: "EMPLOYEE",
        },
      });
      updated++;
    } else {
      // Create new employee
      const nameParts = emp.name.split(" ");
      const firstName = nameParts[0].charAt(0).toUpperCase() + nameParts[0].slice(1).toLowerCase();
      const password = `${firstName}_${emp.empCode.slice(-2)}`;
      const hashed = await bcrypt.hash(password, SALT);

      const email = `${emp.empCode}@akshayapatra.org`;
      const existingEmail = await prisma.user.findFirst({ where: { email } });
      const finalEmail = existingEmail ? `${emp.empCode}.emp@akshayapatra.org` : email;

      try {
        await prisma.user.create({
          data: {
            empCode: emp.empCode,
            name: emp.name,
            email: finalEmail,
            password: hashed,
            role: "EMPLOYEE",
            departmentId: deptId,
            designation: emp.designation,
            mobile: emp.mobile || null,
          },
        });
        created++;
      } catch (e) {
        if (e.code === "P2002") {
          console.log(`  DUP: ${emp.name} (${emp.empCode}) - ${e.meta?.target}`);
          skipped++;
        } else {
          throw e;
        }
      }
    }
  }
  console.log(`\nEmployees: ${created} created, ${updated} updated, ${skipped} skipped`);

  // 7. Remove employee records for evaluators who shouldn't be employees
  // (users with evaluator empCodes who still have departmentId set and role=EMPLOYEE)
  console.log(`\n--- Cleaning up evaluator employee records ---`);
  for (const empCode of evaluatorEmpCodes) {
    if (empCode === "1800349") continue; // Keep RISHPAL as ADMIN

    const user = await prisma.user.findFirst({ where: { empCode } });
    if (user && user.departmentId) {
      await prisma.user.update({
        where: { id: user.id },
        data: { departmentId: null },
      });
      console.log(`  Cleared dept for ${user.name} (${empCode})`);
    }
  }

  // 8. Delete old departments that have no employees and no role mappings
  console.log(`\n--- Cleaning up empty old departments ---`);
  const allDepts = await prisma.department.findMany({
    include: {
      _count: { select: { users: true, departmentRoles: true, bestEmployees: true } },
    },
  });
  for (const dept of allDepts) {
    if (
      dept._count.users === 0 &&
      dept._count.departmentRoles === 0 &&
      !allDepartments.includes(dept.name)
    ) {
      // Check for historical data (shortlists, best employees)
      const hasHistory = dept._count.bestEmployees > 0;
      if (!hasHistory) {
        try {
          await prisma.department.delete({ where: { id: dept.id } });
          console.log(`  DELETED empty dept: ${dept.name}`);
        } catch (e) {
          console.log(`  KEEP (has references): ${dept.name}`);
        }
      } else {
        console.log(`  KEEP (has history): ${dept.name}`);
      }
    }
  }

  // 9. Final verification
  console.log(`\n=== VERIFICATION ===`);
  const finalDepts = await prisma.department.findMany({
    include: {
      _count: { select: { users: true, departmentRoles: true } },
    },
    orderBy: { name: "asc" },
  });

  console.log(`\nDepartments (${finalDepts.length}):`);
  let totalEmp = 0;
  for (const d of finalDepts) {
    totalEmp += d._count.users;
    console.log(
      `  ${d.name.padEnd(30)} ${String(d._count.users).padStart(4)} employees  ${String(d._count.departmentRoles).padStart(2)} mappings`
    );
  }
  console.log(`  TOTAL EMPLOYEES: ${totalEmp}`);

  const totalMappings = await prisma.departmentRoleMapping.count();
  console.log(`  TOTAL ROLE MAPPINGS: ${totalMappings}`);

  // Verify evaluators
  console.log(`\nEvaluator verification:`);
  const mappings = await prisma.departmentRoleMapping.findMany({
    include: {
      user: { select: { name: true, empCode: true } },
      department: { select: { name: true } },
    },
    orderBy: [{ department: { name: "asc" } }, { role: "asc" }],
  });
  for (const m of mappings) {
    console.log(
      `  ${m.department.name.padEnd(30)} ${m.role.padEnd(18)} ${m.user.name} (${m.user.empCode})`
    );
  }

  console.log(`\n=== MIGRATION V2 COMPLETE ===\n`);
}

main()
  .catch((e) => {
    console.error("MIGRATION ERROR:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
