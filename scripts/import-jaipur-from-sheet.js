/**
 * One-off: re-import the Jaipur branch from the new master workbook.
 *
 * Source of truth: the PER-DEPARTMENT tabs (every tab EXCEPT `MainF`, which is
 * a flat master summary, not a department). Each tab carries a banner title row
 * then a real header row: "Sr. No. | Emp Code | Employee Name | DOJ |
 * Department | Designation | Mobile No.".
 *
 * Behaviour (mirrors scripts/import-udp-chg-branches.js — small-branch full
 * replacement — but scoped to ONLY the Jaipur branch and with a Jaipur-only
 * collar rule):
 *   - Department NAME = the neutral `Department` column value (e.g.
 *     "Distribution", "Production"). This merges the split tabs
 *     (Distribution-White Collar + Distribution-Driver -> Distribution) and the
 *     duplicate "Distribution- Driver" / "Distribution-Driver" tabs. Falls back
 *     to the tab name stripped of a collar suffix only if the column is blank.
 *   - Per-employee collar (JAIPUR-ONLY rule): WHITE if the designation contains
 *     any of supervisor/manager/officer/executive/agm/gm (case-insensitive
 *     substring); otherwise BLUE. Blank designation -> BLUE. The shared
 *     importer's keyword logic is intentionally left untouched.
 *   - Department.collarType = majority vote of its employees' collar (keeps the
 *     big-branch HOD blue-collar pool working). Department names stay neutral.
 *   - Full replacement of Jaipur only: archive stale EMPLOYEE/HOD into
 *     ArchivedEmployee, delete EMPLOYEE/HOD + departments for Jaipur, recreate.
 *     ADMIN and current BM/CM/HR/Committee role-holders are never demoted.
 *   - EMPLOYEE password = empCode.
 *
 * Run a preview first:  node scripts/import-jaipur-from-sheet.js --dry
 * Then the real import: node scripts/import-jaipur-from-sheet.js
 */
const XLSX = require("xlsx");
const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const SALT_ROUNDS = 10;
const FILE = "C:/Users/Dinesh/Downloads/self assessment -Jaipur EMployee Details-Main.xlsx";
const BRANCH_NAME = "Jaipur";
const DRY_RUN = process.argv.includes("--dry");

const normKey = (k) => String(k ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
const cellStr = (v) => (v === null || v === undefined ? "" : String(v).trim());

const EMPCODE_KEYS = ["empcode", "employeecode", "empid", "code"];
const NAME_KEYS = ["name", "employeename", "fullname"];
const DEPT_KEYS = ["department", "dept", "departmentname", "departmentdescription"];
const MOBILE_KEYS = ["mobile", "mobileno", "mobilenumber", "phone", "contact"];
const DESIG_KEYS = ["designation", "designationdescription", "position", "title"];
const HEADER_HINTS = new Set([...EMPCODE_KEYS, ...NAME_KEYS, ...DEPT_KEYS, ...MOBILE_KEYS, ...DESIG_KEYS]);

// JAIPUR-ONLY collar rule (do NOT reuse for other branches).
const WHITE_KEYWORDS = ["supervisor", "manager", "officer", "executive", "agm", "gm"];
const collarFromDesignationJaipur = (d) =>
  WHITE_KEYWORDS.some((k) => String(d || "").toLowerCase().includes(k)) ? "WHITE_COLLAR" : "BLUE_COLLAR";

// Strip a trailing collar descriptor from a tab name, e.g.
// "Production-Helper" -> "Production", "Distribution-White Collar" -> "Distribution".
const deptNameFromTab = (tab) =>
  String(tab || "")
    .replace(/\s*[-–]\s*(white collar|driver|helper|blue collar)\s*$/i, "")
    .trim();

function pick(obj, keys) {
  for (const k of keys) {
    const v = cellStr(obj[k]);
    if (v) return v;
  }
  return "";
}

function extractRows(workbook) {
  const rows = [];
  for (const sheetName of workbook.SheetNames) {
    if (normKey(sheetName) === normKey("MainF")) continue; // master summary, not a department
    const grid = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, blankrows: false, defval: null });
    if (!Array.isArray(grid) || grid.length === 0) continue;

    // The header row is the first row carrying >=2 known header hints (the row
    // 0 banner like "Administration - Employee List" has none).
    let headerIdx = -1;
    for (let i = 0; i < grid.length; i++) {
      const hits = (grid[i] || []).filter((c) => HEADER_HINTS.has(normKey(c))).length;
      if (hits >= 2) { headerIdx = i; break; }
    }
    if (headerIdx === -1) continue;

    const colMap = {};
    (grid[headerIdx] || []).forEach((c, i) => { colMap[i] = normKey(c); });

    const dataRows = grid.slice(headerIdx + 1);
    for (let i = 0; i < dataRows.length; i++) {
      const arr = dataRows[i] || [];
      const obj = {};
      arr.forEach((v, idx) => { if (colMap[idx]) obj[colMap[idx]] = v; });
      const empCode = pick(obj, EMPCODE_KEYS);
      const name = pick(obj, NAME_KEYS);
      // Skip footer/summary rows ("Total Employees:" etc.) and blank rows.
      if (!name) continue;
      if (/total\s*employees/i.test(cellStr(arr[0]))) continue;
      rows.push({
        rowRef: `${sheetName}!${headerIdx + i + 2}`,
        sheetName,
        empCode, name,
        department: pick(obj, DEPT_KEYS),
        designation: pick(obj, DESIG_KEYS),
        mobile: pick(obj, MOBILE_KEYS),
      });
    }
  }
  return rows;
}

async function replaceBranch(branch, branchRows) {
  const branchId = branch.id;
  const deptTally = new Map();
  for (const r of branchRows) {
    if (!r.deptName) continue;
    const t = deptTally.get(r.deptName) || { blue: 0, white: 0 };
    if (r.employeeCollar === "BLUE_COLLAR") t.blue++; else t.white++;
    deptTally.set(r.deptName, t);
  }
  const deptDefs = [...deptTally.entries()].map(([name, t]) => ({
    name, collarType: t.blue > t.white ? "BLUE_COLLAR" : "WHITE_COLLAR",
  }));
  const keptCodes = [...new Set(branchRows.map((r) => r.empCode))];
  const passwords = await Promise.all(branchRows.map((r) => bcrypt.hash(String(r.empCode), SALT_ROUNDS)));

  return prisma.$transaction(async (tx) => {
    const staleUsers = await tx.user.findMany({
      where: {
        AND: [
          { OR: [{ branchId }, { department: { branchId } }] },
          { role: { in: ["EMPLOYEE", "HOD"] } },
          { empCode: { not: null } },
          { empCode: { notIn: keptCodes } },
        ],
      },
      select: { id: true, empCode: true, name: true, mobile: true, designation: true, createdAt: true, department: { select: { name: true } } },
    });
    if (staleUsers.length > 0) {
      await tx.archivedEmployee.createMany({
        data: staleUsers.map((u) => ({
          empCode: u.empCode, name: u.name, mobile: u.mobile, designation: u.designation,
          department: u.department?.name || "Unknown", joiningDate: u.createdAt,
          reasonLeaving: `Replaced by branch sheet import (${branch.name})`,
          archivedBy: "script:import-jaipur", originalUserId: u.id,
        })),
      });
    }
    await tx.user.deleteMany({
      where: { role: { in: ["EMPLOYEE", "HOD"] }, OR: [{ branchId }, { department: { branchId } }, { empCode: { in: keptCodes } }] },
    });
    await tx.department.deleteMany({ where: { branchId } });
    if (deptDefs.length > 0) {
      await tx.department.createMany({ data: deptDefs.map((d) => ({ name: d.name, branchId, collarType: d.collarType })) });
    }
    const freshDepts = await tx.department.findMany({ where: { branchId }, select: { id: true, name: true } });
    const deptIdByName = new Map(freshDepts.map((d) => [d.name, d.id]));
    await tx.user.createMany({
      data: branchRows.map((r, i) => ({
        empCode: r.empCode, name: r.name, password: passwords[i], role: "EMPLOYEE", branchId,
        departmentId: r.deptName ? (deptIdByName.get(r.deptName) || null) : null,
        collarType: r.employeeCollar, designation: r.designation || null, mobile: r.mobile || null,
      })),
      skipDuplicates: true,
    });
    return { departmentsCreated: deptDefs, employeesImported: branchRows.length, archived: staleUsers.length };
  }, { timeout: 60000, maxWait: 15000 });
}

async function main() {
  const workbook = XLSX.readFile(FILE);
  const raw = extractRows(workbook);

  const validRows = [];
  const errors = [];
  for (const r of raw) {
    if (!r.empCode) { errors.push(`${r.rowRef}: missing empCode — skipped`); continue; }
    if (!r.name) { errors.push(`${r.rowRef}: missing name — skipped`); continue; }
    r.deptName = r.department || deptNameFromTab(r.sheetName);
    r.employeeCollar = collarFromDesignationJaipur(r.designation);
    validRows.push(r);
  }

  // Dedupe by empCode — last wins (collapses the duplicate Distribution-Driver tab).
  const seen = new Map();
  for (const r of validRows) seen.set(r.empCode, r);
  const deduped = [...seen.values()];

  // Safety: never demote an ADMIN or a current BM/CM/HR/Committee role-holder.
  const allCodes = deduped.map((r) => r.empCode);
  const protectedUsers = await prisma.user.findMany({
    where: {
      empCode: { in: allCodes },
      OR: [
        { role: { in: ["ADMIN", "BRANCH_MANAGER", "CLUSTER_MANAGER", "HR", "COMMITTEE"] } },
        { bmAssignment: { isNot: null } },
        { cmBranchAssignments: { some: {} } },
        { hrBranchAssignments: { some: {} } },
        { committeeBranchAssignments: { some: {} } },
      ],
    },
    select: { empCode: true, name: true, role: true },
  });
  const protectedCodes = new Set(protectedUsers.map((u) => u.empCode));
  const importable = deduped.filter((r) => !protectedCodes.has(r.empCode));

  const branch = await prisma.branch.findFirst({
    where: { name: { equals: BRANCH_NAME, mode: "insensitive" } },
    select: { id: true, name: true, slug: true },
  });
  if (!branch) { console.error(`No branch found named "${BRANCH_NAME}". Aborting.`); process.exitCode = 1; return; }

  // Per-department breakdown for the preview / report.
  const deptBreakdown = new Map();
  let whiteCount = 0, blueCount = 0;
  for (const r of importable) {
    const t = deptBreakdown.get(r.deptName) || { blue: 0, white: 0 };
    if (r.employeeCollar === "WHITE_COLLAR") { t.white++; whiteCount++; } else { t.blue++; blueCount++; }
    deptBreakdown.set(r.deptName, t);
  }

  console.log(DRY_RUN ? "=== DRY RUN (no writes) ===" : "=== IMPORT (Jaipur) ===");
  console.log("Scanned rows:", raw.length, "| Valid:", validRows.length, "| Deduped:", deduped.length, "| Importable:", importable.length);
  console.log(`White-collar: ${whiteCount} | Blue-collar: ${blueCount}`);
  console.log(`Departments (${deptBreakdown.size}):`);
  for (const [name, t] of [...deptBreakdown.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const collar = t.blue > t.white ? "BLUE" : "WHITE";
    console.log(`  ${name}: ${t.white + t.blue} (white ${t.white}, blue ${t.blue}) -> dept[${collar}]`);
  }
  if (protectedUsers.length > 0) {
    console.log("Protected (skipped):", protectedUsers.map((u) => `${u.empCode} (${u.role})`).join(", "));
  }
  // Surface any suspiciously small empCodes (would indicate Sr.No. leaked into the code column).
  const tinyCodes = importable.filter((r) => String(r.empCode).replace(/\D/g, "").length > 0 && String(r.empCode).length <= 3);
  if (tinyCodes.length > 0) {
    console.log("WARNING — suspiciously short empCodes:", tinyCodes.map((r) => `${r.empCode} (${r.rowRef})`).join(", "));
  }

  if (DRY_RUN) {
    if (errors.length > 0) { console.log("\nErrors / skipped:"); errors.forEach((e) => console.log("  " + e)); }
    console.log("\nDry run complete — no database changes made.");
    return;
  }

  const res = await replaceBranch(branch, importable);
  console.log(`\nBranch: ${branch.name}`);
  console.log(`  Employees imported: ${res.employeesImported}`);
  console.log(`  Departments: ${res.departmentsCreated.map((d) => `${d.name}[${d.collarType === "BLUE_COLLAR" ? "BLUE" : "WHITE"}]`).join(", ")}`);
  console.log(`  Stale employees archived: ${res.archived}`);
  if (errors.length > 0) { console.log("\nErrors / skipped:"); errors.forEach((e) => console.log("  " + e)); }
}

main()
  .catch((e) => { console.error("IMPORT FAILED:", e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
