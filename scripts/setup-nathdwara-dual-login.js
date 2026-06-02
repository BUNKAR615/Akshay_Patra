/**
 * One-off: give the Nathdwara Branch Manager (empCode 2000000) and HR
 * (empCode 2000661) a normal department membership + a dual login, WITHOUT
 * changing their staff role or branch/role assignments.
 *
 * After this runs, each account has two working credentials:
 *   - password   = empCode            → opens the normal EMPLOYEE dashboard
 *                                        (scoped to their sheet-tab department)
 *   - passwordHod = Firstname_##       → opens their own staff dashboard
 *                                        (Branch Manager / HR), exactly as before
 *
 *      2000000  Dilip Purohit   → Operations        → formula "Dilip_00"
 *      2000661  Lavish Bhardwaj → Human Resources   → formula "Lavish_61"
 *
 * The login route (app/api/auth/login/route.js) routes these two passwords to
 * the right dashboards via the "dual-login staff" branch — deploy that change
 * together with running this script.
 *
 * Role is left untouched (BRANCH_MANAGER / HR), so the BM/HR assignments,
 * dashboards and evaluation flows keep working. Only profile fields
 * (departmentId, branchId, collarType) and the two password hashes are written.
 * No scores or assessment history are touched.
 *
 * Run a preview first:  node scripts/setup-nathdwara-dual-login.js --dry
 * Then apply:           node scripts/setup-nathdwara-dual-login.js
 */
const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const SALT_ROUNDS = 10;
const BRANCH_NAME = "Nathdwara";
const DRY_RUN = process.argv.includes("--dry");

// The two accounts and the sheet-tab department each should belong to.
const TARGETS = [
  { empCode: "2000000", deptName: "Operations" },
  { empCode: "2000661", deptName: "Human Resources" },
];

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
  const branch = await prisma.branch.findFirst({
    where: { name: { equals: BRANCH_NAME, mode: "insensitive" } },
    select: { id: true, name: true },
  });
  if (!branch) { console.error(`No branch named "${BRANCH_NAME}". Aborting.`); process.exitCode = 1; return; }

  const depts = await prisma.department.findMany({
    where: { branchId: branch.id, name: { in: TARGETS.map((t) => t.deptName) } },
    select: { id: true, name: true },
  });
  const deptIdByName = new Map(depts.map((d) => [d.name, d.id]));

  console.log(DRY_RUN ? "=== DRY RUN (no writes) ===" : "=== SETUP (Nathdwara dual-login) ===");
  const plans = [];
  for (const t of TARGETS) {
    const user = await prisma.user.findUnique({
      where: { empCode: t.empCode },
      select: { id: true, empCode: true, name: true, role: true, branchId: true, departmentId: true, collarType: true, passwordHod: true },
    });
    if (!user) { console.log(`  ${t.empCode}: NOT FOUND — skipped`); continue; }
    const departmentId = deptIdByName.get(t.deptName);
    if (!departmentId) { console.log(`  ${t.empCode}: department "${t.deptName}" not found in ${branch.name} — skipped`); continue; }

    const formula = formulaPassword(user.name, user.empCode);
    plans.push({ user, departmentId, deptName: t.deptName, formula });

    console.log(`\n  ${user.empCode}  ${user.name}  [role ${user.role}]`);
    console.log(`    department : ${user.departmentId || "(none)"}  →  ${t.deptName} (${departmentId})`);
    console.log(`    branchId   : ${user.branchId || "(none)"}  →  ${branch.id}`);
    console.log(`    collarType : ${user.collarType || "(none)"}  →  WHITE_COLLAR`);
    console.log(`    password   : empCode  "${user.empCode}"          → EMPLOYEE dashboard`);
    console.log(`    passwordHod: formula  "${formula}"  → ${user.role} dashboard`);
  }

  if (DRY_RUN) {
    console.log("\nDry run complete — no database changes made.");
    return;
  }

  for (const p of plans) {
    await prisma.user.update({
      where: { id: p.user.id },
      data: {
        departmentId: p.departmentId,
        branchId: branch.id,
        collarType: "WHITE_COLLAR",
        password: await bcrypt.hash(String(p.user.empCode), SALT_ROUNDS),
        passwordHod: await bcrypt.hash(p.formula, SALT_ROUNDS),
        // role intentionally left unchanged (stays BRANCH_MANAGER / HR).
      },
    });
    console.log(`  Updated ${p.user.empCode} (${p.user.name}) → ${p.deptName}; logins: "${p.user.empCode}" (employee) / "${p.formula}" (${p.user.role}).`);
  }
  console.log("\nDone. Deploy the login-route change together with this data update.");
}

main()
  .catch((e) => { console.error("SETUP FAILED:", e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
