// Temp verification: exercises the new admin employee filter `where` logic
// against the live DB. Safe — read-only (findMany/count only). Delete after.
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

// Minimal .env loader (standalone node script doesn't get Next's env injection).
for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
  if (m && !process.env[m[1]]) {
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[m[1]] = v;
  }
}

const prisma = new PrismaClient();

// Mirror of the route's where-builder (post-fix).
function buildWhere({ search = "", department = "", role = "", branch = "" }) {
  const where = {};
  const andConditions = [];
  if (search) {
    andConditions.push({
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { empCode: { contains: search, mode: "insensitive" } },
        { designation: { contains: search, mode: "insensitive" } },
      ],
    });
  }
  const isDeptScopedRole = role === "HOD";
  if (department && isDeptScopedRole) {
    andConditions.push({ departmentRoles: { some: { role, department: { name: department } } } });
  } else if (department && role === "EVALUATOR") {
    andConditions.push({ departmentRoles: { some: { department: { name: department } } } });
  } else if (department && role === "EMPLOYEE") {
    andConditions.push({ department: { name: department } });
    where.role = "EMPLOYEE";
    where.departmentRoles = { none: {} };
  } else {
    if (department) {
      andConditions.push({
        OR: [
          { department: { name: department } },
          { departmentRoles: { some: { department: { name: department } } } },
        ],
      });
    }
    if (role === "EMPLOYEE") {
      where.role = "EMPLOYEE";
      where.departmentRoles = { none: {} };
    } else if (role === "ADMIN") {
      where.role = "ADMIN";
    } else if (role === "EVALUATOR") {
      where.departmentRoles = { some: {} };
    } else if (role === "HOD") {
      where.departmentRoles = { some: { role: "HOD" } };
    } else if (role === "BRANCH_MANAGER") {
      where.bmAssignment = { isNot: null };
    } else if (role === "CLUSTER_MANAGER") {
      where.cmBranchAssignments = { some: {} };
    } else if (role === "HR") {
      where.hrBranchAssignments = { some: {} };
    } else if (role === "COMMITTEE") {
      where.committeeBranchAssignments = { some: {} };
    }
  }
  if (department && role === "ADMIN") where.role = "ADMIN";
  if (branch) {
    andConditions.push({
      OR: [
        { department: { branch: { name: branch } } },
        { departmentRoles: { some: { department: { branch: { name: branch } } } } },
        { scopedBranch: { name: branch } },
        { bmAssignment: { branch: { name: branch } } },
        { cmBranchAssignments: { some: { branch: { name: branch } } } },
        { hrBranchAssignments: { some: { branch: { name: branch } } } },
        { committeeBranchAssignments: { some: { branch: { name: branch } } } },
      ],
    });
  }
  if (andConditions.length > 0) where.AND = andConditions;
  return where;
}

async function run(label, filters) {
  const where = buildWhere(filters);
  const [count, sample] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({ where, select: { empCode: true, name: true, role: true }, take: 5, orderBy: { name: "asc" } }),
  ]);
  console.log(`\n● ${label}  → ${count} match(es)`);
  for (const u of sample) console.log(`    ${u.empCode ?? "—"}  ${u.name}  [${u.role}]`);
}

(async () => {
  // Pick a branch that actually has a BM so the combo test is meaningful.
  const bm = await prisma.branchManagerAssignment.findFirst({
    include: { branch: { select: { name: true } }, bm: { select: { name: true } } },
  });
  const branchWithBm = bm?.branch?.name;
  console.log(`Sample BM assignment: ${bm?.bm?.name ?? "(none found)"} → branch "${branchWithBm ?? "?"}"`);

  await run("role=BRANCH_MANAGER (all branches)", { role: "BRANCH_MANAGER" });
  await run("role=CLUSTER_MANAGER (all)", { role: "CLUSTER_MANAGER" });
  await run("role=HR (all)", { role: "HR" });
  await run("role=COMMITTEE (all)", { role: "COMMITTEE" });
  await run("role=HOD (all)", { role: "HOD" });
  if (branchWithBm) {
    await run(`branch=${branchWithBm} + role=BRANCH_MANAGER  (the failing case)`, { branch: branchWithBm, role: "BRANCH_MANAGER" });
    await run(`branch=${branchWithBm} (everyone in branch)`, { branch: branchWithBm });
  }
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error("VERIFY FAILED:", e.message);
  await prisma.$disconnect();
  process.exit(1);
});
