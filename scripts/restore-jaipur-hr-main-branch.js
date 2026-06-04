/**
 * Restore the MAIN BRANCH (employee identity) for Jaipur HR personnel whose
 * department was nulled by the old detach-on-promote HR assignment.
 *
 * These three people are employees of Jaipur -> Human Resources who ALSO serve
 * as HR in other branches. The old hr-assign route wiped their departmentId, so
 * they lost their main branch. This re-attaches it and configures the DUAL
 * LOGIN the auth route understands (login/route.js -> isDualLoginStaff),
 * WITHOUT touching their HR role or HR branch assignments:
 *   - password    = empCode       -> Jaipur EMPLOYEE dashboard (their main branch)
 *   - passwordHod = Firstname_##  -> their HR dashboard (unchanged HR password,
 *                                    just routed through the secondary slot)
 *
 * Targets (Jaipur -> Human Resources):
 *   5100029  Chetan Singh Bhati
 *   1801896  Kamal Singh Mawari
 *   1802230  Rameshwar Dayal
 *
 * Idempotent and DRY-RUN BY DEFAULT. Nothing is written unless you pass --apply.
 *   node scripts/restore-jaipur-hr-main-branch.js            # preview
 *   node scripts/restore-jaipur-hr-main-branch.js --apply    # write
 */
const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const SALT_ROUNDS = 10;
const APPLY = process.argv.includes("--apply");

const BRANCH_NAME = "Jaipur";
const DEPT_NAME = "Human Resources";
const TARGET_CODES = ["5100029", "1801896", "1802230"];

// Firstname_## formula — identical to lib/auth/defaultPassword.js
// (defaultHodSecondaryPasswordFor). Replicated here so this CommonJS script
// does not need to import the ESM helper.
const firstName = (name) => {
  const first = String(name || "").trim().split(/\s+/)[0] || "";
  const cleaned = first.replace(/[^A-Za-z]/g, "");
  return cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase() : "";
};
const lastTwoDigits = (code) => {
  const d = String(code || "").replace(/\D/g, "");
  return d ? d.slice(-2).padStart(2, "0") : "";
};
const formulaPassword = (name, code) => {
  const fn = firstName(name), tail = lastTwoDigits(code);
  return fn && tail ? `${fn}_${tail}` : String(code);
};

async function main() {
  console.log(
    APPLY
      ? "=== RESTORE JAIPUR HR MAIN BRANCH (APPLY — writes enabled) ==="
      : "=== RESTORE JAIPUR HR MAIN BRANCH (DRY RUN — no writes; pass --apply to write) ==="
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

  console.log(`Branch: ${branch.name} (${branch.id})`);
  console.log(`Dept  : ${dept.name} (${dept.id})  collar=${dept.collarType}\n`);

  const plans = [];
  for (const code of TARGET_CODES) {
    const user = await prisma.user.findUnique({
      where: { empCode: code },
      select: { id: true, empCode: true, name: true, role: true, departmentId: true, branchId: true, collarType: true, passwordHod: true,
        hrBranchAssignments: { select: { branch: { select: { name: true } } } } },
    });
    if (!user) { console.log(`  ${code}: NOT FOUND — skipped`); continue; }

    const formula = formulaPassword(user.name, user.empCode);
    const hrBranches = user.hrBranchAssignments.map((a) => a.branch?.name).filter(Boolean).join(", ") || "(none)";
    const alreadyOk = user.departmentId === dept.id && !!user.passwordHod;
    plans.push({ user, formula });

    console.log(`  ${user.empCode}  ${user.name}  [role ${user.role}]${alreadyOk ? "  (already restored)" : ""}`);
    console.log(`    HR assignment(s): ${hrBranches}  (left unchanged)`);
    console.log(`    departmentId : ${user.departmentId || "(none)"}  ->  ${dept.id}`);
    console.log(`    branchId     : ${user.branchId || "(none)"}  ->  ${branch.id}`);
    console.log(`    collarType   : ${user.collarType || "(none)"}  ->  ${dept.collarType}`);
    console.log(`    password     : empCode  "${user.empCode}"          -> Jaipur EMPLOYEE dashboard`);
    console.log(`    passwordHod  : formula  "${formula}"  -> ${user.role} dashboard\n`);
  }

  if (!APPLY) {
    console.log("Dry run complete — no database changes made. Re-run with --apply to write.");
    return;
  }

  for (const p of plans) {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: p.user.id },
        data: {
          departmentId: dept.id,
          branchId: branch.id,
          collarType: dept.collarType,
          password: await bcrypt.hash(String(p.user.empCode), SALT_ROUNDS),
          passwordHod: await bcrypt.hash(p.formula, SALT_ROUNDS),
          // role intentionally left unchanged (stays HR).
        },
      });
      await tx.auditLog.create({
        data: {
          userId: p.user.id,
          action: "HR_MAIN_BRANCH_RESTORED",
          details: { empCode: p.user.empCode, branchId: branch.id, departmentId: dept.id, script: "restore-jaipur-hr-main-branch" },
        },
      }).catch(() => {});
    });
    console.log(`  Restored ${p.user.empCode} (${p.user.name}) -> ${branch.name}/${dept.name}; logins: "${p.user.empCode}" (employee) / "${p.formula}" (${p.user.role}).`);
  }
  console.log("\nDone. Their main branch is restored and dual-login is active.");
}

main()
  .catch((e) => { console.error("RESTORE FAILED:", e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
