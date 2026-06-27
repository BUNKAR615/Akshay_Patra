/**
 * repair-role-holder-logins.js
 * ─────────────────────────────────────────────────────────────────────────────
 * One-time data repair for the employee-login bug.
 *
 * BACKGROUND
 *   An employee always belongs to ONE original (home) branch; a role
 *   (Branch Manager / Cluster Manager / HR / Committee) is an ASSIGNMENT, not a
 *   move. Every employee must therefore ALWAYS be able to log in as an employee
 *   (empCode + empCode-password → employee dashboard) AND, when they hold a
 *   role, with the staff password ("Firstname_##") → their role dashboard.
 *
 *   The four assign routes now configure this dual-login for existing employees:
 *       password    = hash(empCode)      → employee dashboard
 *       passwordHod = hash(Firstname_##) → role dashboard
 *   …but rows that were promoted BEFORE that fix (or via the old BM path) are
 *   left in a broken state where User.password holds the STAFF formula and
 *   passwordHod is null — so the employee login returns
 *   "Invalid employee code or password" (the Deepak Mundatiya bug).
 *
 * WHAT THIS DOES
 *   For every user who currently holds a BM/CM/HR/Committee assignment AND still
 *   has a home department (departmentId) — i.e. is an existing employee — it
 *   verifies the dual-login invariant and repairs only the broken ones:
 *     • if empCode does NOT open the account but the staff formula DOES, it
 *       moves the staff formula to passwordHod and resets password = hash(empCode).
 *     • if passwordHod is missing, it sets it to hash(Firstname_##).
 *   Accounts that already satisfy the invariant are left untouched.
 *
 *   Role-holders with NO departmentId are reported (not changed): they have no
 *   employee identity to log in with — an admin must attach their home
 *   department via the employee editor before employee-login can work.
 *
 * SAFETY
 *   DRY-RUN by default — prints a report and writes NOTHING. Pass `--apply` to
 *   persist the repairs. Never touches role, department, branch, collar or
 *   evaluation history. Idempotent: re-running after `--apply` is a no-op.
 *
 * USAGE
 *   node scripts/repair-role-holder-logins.js            # dry run (report only)
 *   node scripts/repair-role-holder-logins.js --apply    # perform repairs
 */
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const prisma = new PrismaClient();

const SALT_ROUNDS = 10;
const APPLY = process.argv.includes("--apply");

const STAFF_ROLES = new Set(["BRANCH_MANAGER", "CLUSTER_MANAGER", "HR", "COMMITTEE", "ADMIN"]);

function firstName(name) {
  if (!name) return "";
  const first = String(name).trim().split(/\s+/)[0] || "";
  const cleaned = first.replace(/[^A-Za-z]/g, "");
  if (!cleaned) return "";
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
}
function lastTwoDigits(empCode) {
  if (!empCode) return "";
  const digits = String(empCode).replace(/\D/g, "");
  if (!digits) return "";
  return digits.slice(-2).padStart(2, "0");
}
function staffPasswordFor({ role, empCode, name }) {
  const code = String(empCode || "").trim();
  if (!code) return "";
  if (!STAFF_ROLES.has(role)) return code;
  const fn = firstName(name);
  const tail = lastTwoDigits(code);
  if (!fn || !tail) return code;
  return `${fn}_${tail}`;
}

async function main() {
  console.log(`\nrepair-role-holder-logins — ${APPLY ? "APPLY (writes enabled)" : "DRY RUN (no writes)"}\n`);

  // Every user who holds at least one role assignment.
  const roleHolders = await prisma.user.findMany({
    where: {
      OR: [
        { bmAssignment: { isNot: null } },
        { cmBranchAssignments: { some: {} } },
        { hrBranchAssignments: { some: {} } },
        { committeeBranchAssignments: { some: {} } },
      ],
    },
    select: {
      id: true, empCode: true, name: true, role: true,
      password: true, passwordHod: true, departmentId: true,
      department: { select: { name: true, branch: { select: { name: true } } } },
    },
    orderBy: { empCode: "asc" },
  });

  const repaired = [];
  const alreadyOk = [];
  const noEmpCode = [];
  const noDepartment = [];

  for (const u of roleHolders) {
    if (!u.empCode) { noEmpCode.push(u); continue; }

    // Role-holders without a home department have no employee identity — report
    // for manual attachment, never invent one.
    if (!u.departmentId) { noDepartment.push(u); continue; }

    const empOpens = await bcrypt.compare(String(u.empCode), u.password);
    const staffPlain = staffPasswordFor({ role: u.role, empCode: u.empCode, name: u.name });
    const hasHod = !!u.passwordHod;

    if (empOpens && hasHod) { alreadyOk.push(u); continue; }

    const data = {};
    if (!empOpens) {
      // password currently holds something other than the empCode (typically
      // the staff formula). Reset the PRIMARY to the empCode so employee login
      // works again.
      data.password = await bcrypt.hash(String(u.empCode), SALT_ROUNDS);
    }
    if (!hasHod && staffPlain) {
      // Ensure the SECONDARY (role) password exists.
      data.passwordHod = await bcrypt.hash(staffPlain, SALT_ROUNDS);
    }

    if (Object.keys(data).length === 0) { alreadyOk.push(u); continue; }

    repaired.push({ u, fields: Object.keys(data) });
    if (APPLY) {
      await prisma.user.update({ where: { id: u.id }, data });
    }
  }

  const line = (u) => `${(u.empCode || "—").padEnd(9)} | ${(u.name || "").padEnd(26)} | ${(u.role || "").padEnd(15)} | ${(u.department?.branch?.name || "—")}`;

  console.log(`Role-holders scanned: ${roleHolders.length}\n`);

  console.log(`── REPAIRED (${repaired.length}) ${APPLY ? "[written]" : "[would write]"} ──`);
  for (const { u, fields } of repaired) console.log(`${line(u)}   << ${fields.join(", ")}`);

  console.log(`\n── ALREADY OK (${alreadyOk.length}) ──`);
  for (const u of alreadyOk) console.log(line(u));

  if (noDepartment.length) {
    console.log(`\n── NEEDS MANUAL FIX — role-holder has NO home department (${noDepartment.length}) ──`);
    console.log("   (attach their original department via the employee editor so employee-login works)");
    for (const u of noDepartment) console.log(line(u));
  }
  if (noEmpCode.length) {
    console.log(`\n── SKIPPED — no empCode (${noEmpCode.length}) ──`);
    for (const u of noEmpCode) console.log(line(u));
  }

  console.log(`\n${APPLY ? "Done — repairs applied." : "Dry run complete — re-run with --apply to persist."}\n`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
