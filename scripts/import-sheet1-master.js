/**
 * One-off: update the employee master from the consolidated "Sheet1" tab of
 *   "Copy of Employees_list_all_branches-1-HR Comments.xlsx".
 *
 * Source of truth: the tab literally named **"Sheet1"** (the last tab) — NOT the
 * per-branch tabs. It is the only tab carrying the columns referenced in the
 * import spec (Division Description, Email, Location Description, DOJ, ...).
 *
 * Column → schema mapping (User model):
 *   Emp Code              → empCode            (primary identifier)
 *   Employee Name         → name
 *   Location Description   → branchId          (resolved by branch name; trims DB
 *                                               trailing spaces; folds the sheet's
 *                                               "Nathadwara" → DB "Nathdwara")
 *   Department Description → departmentId       (upserted by name within branch)
 *   Designation Description→ designation
 *   Division Description   → collarType         (MANAGEMENT→WHITE_COLLAR, WORKER→BLUE_COLLAR)
 *   Email                  → email              (only written when non-blank)
 *   MobileNo               → mobile
 *   DOJ / Father Name / Gender → DROPPED (no schema field)
 *
 * Behaviour (non-destructive, upsert-by-empCode — mirrors import-nathdwara):
 *   - EXCLUDE empCodes 1800002 and 1800012 entirely (per spec).
 *   - Existing employee (matched by empCode) → UPDATE in place so User.id and all
 *     FK'd history survive. New employee → INSERT (role EMPLOYEE, password=empCode).
 *   - Email: written only when the sheet cell is non-blank; blank leaves the
 *     existing value untouched.
 *   - Protected role-holders (ADMIN/BRANCH_MANAGER/CLUSTER_MANAGER/HR/COMMITTEE,
 *     or anyone holding a BM/CM/HR/Committee assignment) are NEVER modified.
 *   - This importer ONLY adds/updates the 41 sheet rows. It does NOT archive or
 *     delete anyone absent from the sheet (the sheet is a partial master list,
 *     not a full branch roster).
 *
 * Preview:  node scripts/import-sheet1-master.js --dry
 * Execute:  node scripts/import-sheet1-master.js
 */
const XLSX = require("xlsx");
const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const SALT_ROUNDS = 10;
const FILE = "C:/Users/Dinesh/Downloads/Copy of Employees_list_all_branches-1-HR Comments.xlsx";
const TAB = "Sheet1";
const EXCLUDE = new Set(["1800002", "1800012"]);
const DRY_RUN = process.argv.includes("--dry");
// Email has no column in the User model by default. Only pass --with-email after
// a migration adds `email String?`; otherwise email is parsed/reported but NOT written.
const WRITE_EMAIL = process.argv.includes("--with-email");

const cell = (v) => (v === null || v === undefined ? "" : String(v).trim());
const normBranch = (s) => cell(s).toLowerCase().replace(/nathadwara/, "nathdwara");

// Division Description → collar. Only the two documented values are accepted;
// anything else is reported and the row is skipped (we never guess a collar).
function collarFrom(div) {
  const s = cell(div).toLowerCase();
  if (s === "management") return "WHITE_COLLAR";
  if (s === "worker") return "BLUE_COLLAR";
  return null;
}

function parseSheet() {
  const wb = XLSX.readFile(FILE);
  if (!wb.SheetNames.includes(TAB)) throw new Error(`Tab "${TAB}" not found. Tabs: ${wb.SheetNames.join(", ")}`);
  const grid = XLSX.utils.sheet_to_json(wb.Sheets[TAB], { header: 1, defval: null, blankrows: false });
  const header = grid[0];
  const dataRows = grid.slice(1).filter((r) => r && r.some((c) => cell(c) !== ""));
  return dataRows.map((r, i) => {
    const o = {};
    header.forEach((h, idx) => (o[cell(h)] = r[idx]));
    return {
      rowRef: `${TAB}!${i + 2}`,
      empCode: cell(o["Emp Code"]),
      name: cell(o["Employee Name"]),
      location: cell(o["Location Description"]),
      dept: cell(o["Department Description"]),
      designation: cell(o["Designation Description"]),
      division: cell(o["Division Description"]),
      email: cell(o["Email"]),
      mobile: cell(o["MobileNo"]),
    };
  });
}

async function main() {
  const raw = parseSheet();

  const errors = [];
  const skippedExcluded = [];
  const valid = [];
  const seen = new Map(); // dedupe by empCode (last wins)

  for (const r of raw) {
    if (EXCLUDE.has(r.empCode)) { skippedExcluded.push(`${r.empCode} ${r.name}`); continue; }
    if (!r.empCode) { errors.push(`${r.rowRef}: missing Emp Code — skipped`); continue; }
    if (!r.name) { errors.push(`${r.rowRef}: missing Employee Name — skipped`); continue; }
    if (!r.location) { errors.push(`${r.rowRef} (${r.empCode}): missing Location — skipped`); continue; }
    const collar = collarFrom(r.division);
    if (collar === null) { errors.push(`${r.rowRef} (${r.empCode}): unrecognised Division "${r.division}" — skipped`); continue; }
    r.collar = collar;
    seen.set(r.empCode, r);
  }
  valid.push(...seen.values());

  // Resolve branches.
  const branches = await prisma.branch.findMany({ select: { id: true, name: true } });
  const branchByNorm = new Map(branches.map((b) => [normBranch(b.name), b]));
  for (const r of valid) {
    const b = branchByNorm.get(normBranch(r.location));
    if (!b) { errors.push(`${r.rowRef} (${r.empCode}): location "${r.location}" matches no branch — skipped`); r._skip = true; continue; }
    r.branchId = b.id;
    r.branchName = b.name.trim();
  }
  const importable = valid.filter((r) => !r._skip);

  // Existing users by empCode.
  const codes = importable.map((r) => r.empCode);
  const existing = await prisma.user.findMany({
    where: { empCode: { in: codes } },
    select: {
      id: true, empCode: true, name: true, role: true, collarType: true,
      departmentId: true, branchId: true, designation: true, mobile: true,
      scopedBranch: { select: { name: true } },
      department: { select: { name: true, branch: { select: { name: true } } } },
      bmAssignment: { select: { id: true } },
      cmBranchAssignments: { select: { id: true } },
      hrBranchAssignments: { select: { id: true } },
      committeeBranchAssignments: { select: { id: true } },
    },
  });
  const byCode = new Map(existing.map((u) => [u.empCode, u]));

  const isProtected = (u) =>
    ["ADMIN", "BRANCH_MANAGER", "CLUSTER_MANAGER", "HR", "COMMITTEE"].includes(u.role) ||
    u.bmAssignment || u.cmBranchAssignments.length || u.hrBranchAssignments.length || u.committeeBranchAssignments.length;

  // Plan each row.
  const plan = { create: [], update: [], skipProtected: [] };
  for (const r of importable) {
    const u = byCode.get(r.empCode);
    if (!u) { plan.create.push(r); continue; }
    if (isProtected(u)) { plan.skipProtected.push({ r, u }); continue; }
    plan.update.push({ r, u });
  }

  // ---- Report ----
  console.log(DRY_RUN ? "=== DRY RUN (no writes) ===" : "=== IMPORT (Sheet1 master) ===");
  console.log(`Sheet rows: ${raw.length} | Excluded: ${skippedExcluded.length} (${skippedExcluded.join(", ")})`);
  console.log(`Importable: ${importable.length}  → create ${plan.create.length}, update ${plan.update.length}, skip-protected ${plan.skipProtected.length}`);

  if (plan.skipProtected.length) {
    console.log("\nProtected (left untouched):");
    plan.skipProtected.forEach(({ r, u }) =>
      console.log(`  ${r.empCode} ${u.name} role=${u.role} (sheet wanted ${r.branchName}/${r.dept})`));
  }

  console.log("\nUpdates (existing employees):");
  for (const { r, u } of plan.update) {
    const moves = [];
    const curBranch = u.scopedBranch?.name?.trim() || u.department?.branch?.name?.trim() || "(none)";
    if (curBranch !== r.branchName) moves.push(`branch ${curBranch}→${r.branchName}`);
    if ((u.department?.name || "") !== r.dept) moves.push(`dept ${u.department?.name || "(none)"}→${r.dept}`);
    if (u.collarType !== r.collar) moves.push(`collar ${u.collarType}→${r.collar}`);
    if (r.email) moves.push(`set email→${r.email}`);
    console.log(`  ${r.empCode} ${u.name}: ${moves.join(", ") || "no field changes"}`);
  }

  console.log("\nNew employees (insert):");
  const byBranchDept = {};
  for (const r of plan.create) {
    const k = `${r.branchName} :: ${r.dept}`;
    (byBranchDept[k] ||= []).push(`${r.empCode} ${r.name} [${r.collar === "WHITE_COLLAR" ? "WC" : "BC"}]${r.email ? " +email" : ""}`);
  }
  for (const k of Object.keys(byBranchDept).sort())
    console.log(`  ${k}: ${byBranchDept[k].length}\n    ${byBranchDept[k].join("\n    ")}`);

  const emailCount = importable.filter((r) => r.email).length;
  console.log(`\nEmails present in sheet: ${emailCount} — ${WRITE_EMAIL ? "WILL be written" : "NOT written (no email column; pass --with-email after migration)"}`);
  if (errors.length) { console.log("\nSkipped / invalid rows:"); errors.forEach((e) => console.log("  " + e)); }

  if (DRY_RUN) { console.log("\nDry run complete — no database changes made."); return; }

  // ---- Execute ----
  const res = await prisma.$transaction(async (tx) => {
    let created = 0, updated = 0;
    // Upsert needed departments (branch :: dept) for all create+update rows.
    const deptKeys = new Map(); // "branchId::dept" -> {branchId, name}
    for (const r of [...plan.create, ...plan.update.map((x) => x.r)])
      deptKeys.set(`${r.branchId}::${r.dept}`, { branchId: r.branchId, name: r.dept });
    const deptIdByKey = new Map();
    for (const { branchId, name } of deptKeys.values()) {
      const d = await tx.department.upsert({
        where: { name_branchId: { name, branchId } },
        update: {},
        create: { name, branchId },
        select: { id: true },
      });
      deptIdByKey.set(`${branchId}::${name}`, d.id);
    }

    for (const r of plan.create) {
      const data = {
        empCode: r.empCode,
        name: r.name,
        password: await bcrypt.hash(String(r.empCode), SALT_ROUNDS),
        role: "EMPLOYEE",
        branchId: r.branchId,
        departmentId: deptIdByKey.get(`${r.branchId}::${r.dept}`) || null,
        collarType: r.collar,
        designation: r.designation || null,
        mobile: r.mobile || null,
      };
      if (WRITE_EMAIL) data.email = r.email || null;
      await tx.user.create({ data });
      created++;
    }

    for (const { r, u } of plan.update) {
      const data = {
        name: r.name,
        branchId: r.branchId,
        departmentId: deptIdByKey.get(`${r.branchId}::${r.dept}`) || null,
        collarType: r.collar,
        designation: r.designation || null,
        mobile: r.mobile || null,
      };
      if (WRITE_EMAIL && r.email) data.email = r.email; // blank email leaves existing untouched
      await tx.user.update({ where: { id: u.id }, data });
      updated++;
    }
    return { created, updated };
  }, { timeout: 120000, maxWait: 20000 });

  console.log(`\nDone — created ${res.created}, updated ${res.updated}, protected skipped ${plan.skipProtected.length}.`);
}

main().catch((e) => { console.error("IMPORT FAILED:", e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
