/**
 * fix-deepak-hr-login.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Targeted data repair for ONE user: Deepak Mundotia (empCode 1802053).
 *
 * SYMPTOM
 *   Logging in with his HR password "Deepak_53" opened the EMPLOYEE dashboard
 *   instead of the HR dashboard.
 *
 * ROOT CAUSE (data, not code — login/route.js is correct)
 *   His User row was left in an inconsistent dual-login state:
 *     • role        = EMPLOYEE   (should be HR — he holds 3 HrBranchAssignments)
 *     • password    = hash("Deepak_53")  (the HR staff password)
 *     • passwordHod = hash("1802053")    (the empCode)
 *   i.e. password / passwordHod are SWAPPED and the staff role is missing.
 *   Because role != HR, `isDualLoginStaff` is false, so the staff password
 *   resolves to EMPLOYEE (login/route.js line ~90) → employee dashboard.
 *
 * FIX — bring the row to the exact state the hr-assign route writes for an
 * existing employee who holds an HR assignment (hr-assign/route.js:164-172):
 *     role        = HR
 *     password    = hash(empCode)      → EMPLOYEE dashboard (unchanged behaviour)
 *     passwordHod = hash("Deepak_53")  → HR dashboard
 *   departmentId / branchId / collarType are left untouched (home branch kept).
 *
 * SAFETY
 *   • Scoped to empCode 1802053 only; verifies the name and that the user
 *     actually holds an HR assignment before writing. Refuses otherwise.
 *   • DRY-RUN by default — pass `--apply` to persist.
 *   • Idempotent: re-running after --apply reports "already correct".
 *
 * USAGE
 *   node scripts/fix-deepak-hr-login.js            # dry run
 *   node scripts/fix-deepak-hr-login.js --apply    # write the repair
 */
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const prisma = new PrismaClient();

const SALT_ROUNDS = 10;
const APPLY = process.argv.includes("--apply");

const TARGET_EMP_CODE = "1802053";
const EXPECTED_NAME_PREFIX = "DEEPAK";
const STAFF_PASSWORD = "Deepak_53"; // Firstname_## for HR, matches defaultPasswordFor

async function main() {
  console.log(`\nfix-deepak-hr-login — ${APPLY ? "APPLY (writes enabled)" : "DRY RUN (no writes)"}\n`);

  const u = await prisma.user.findUnique({
    where: { empCode: TARGET_EMP_CODE },
    select: {
      id: true, empCode: true, name: true, role: true,
      password: true, passwordHod: true, departmentId: true, branchId: true,
    },
  });

  if (!u) { console.error(`ABORT: no user with empCode ${TARGET_EMP_CODE}`); process.exitCode = 1; return; }
  if (!String(u.name || "").toUpperCase().startsWith(EXPECTED_NAME_PREFIX)) {
    console.error(`ABORT: empCode ${TARGET_EMP_CODE} is "${u.name}", not the expected ${EXPECTED_NAME_PREFIX}. Not touching.`);
    process.exitCode = 1; return;
  }

  // Safety: only repair a genuine HR role-holder.
  const hrCount = await prisma.hrBranchAssignment.count({ where: { hrUserId: u.id } });
  if (hrCount === 0) {
    console.error(`ABORT: ${u.name} holds NO HrBranchAssignment — refusing to set role=HR.`);
    process.exitCode = 1; return;
  }

  // Current state.
  const empOpensPassword = await bcrypt.compare(String(u.empCode), u.password || "");
  const hodOpensStaff = u.passwordHod ? await bcrypt.compare(STAFF_PASSWORD, u.passwordHod) : false;
  const alreadyCorrect = u.role === "HR" && empOpensPassword && hodOpensStaff;

  console.log("Current:", {
    name: u.name, role: u.role,
    empCodeOpensPrimary: empOpensPassword,
    staffPwOpensSecondary: hodOpensStaff,
    hrAssignments: hrCount,
  });

  if (alreadyCorrect) {
    console.log("\nAlready correct — nothing to do.\n");
    return;
  }

  const data = {
    role: "HR",
    password: await bcrypt.hash(String(u.empCode), SALT_ROUNDS), // empCode → EMPLOYEE dashboard
    passwordHod: await bcrypt.hash(STAFF_PASSWORD, SALT_ROUNDS),  // Deepak_53 → HR dashboard
    // departmentId / branchId / collarType intentionally left untouched.
  };

  console.log("\nWill set:", { role: data.role, password: "hash(empCode)", passwordHod: `hash("${STAFF_PASSWORD}")` });

  if (APPLY) {
    await prisma.user.update({ where: { id: u.id }, data });
    console.log("\nDone — repair applied.\n");
  } else {
    console.log("\nDry run — re-run with --apply to persist.\n");
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
