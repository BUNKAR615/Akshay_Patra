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
 *   - Non-destructive sync of Jaipur only: employees in the sheet are UPDATED
 *     IN PLACE (matched by empCode) so their User.id — and every Stage 1 /
 *     evaluation record FK'd to it — survives a department/profile change.
 *     Departed employees (absent from the sheet) are archived, then detached
 *     from the branch when they carry assessment history (kept so old
 *     assessments stay visible) or hard-deleted only when they have none.
 *     ADMIN and current BM/CM/HR/Committee role-holders are never demoted.
 *   - New EMPLOYEE password = empCode (existing passwords are left untouched).
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

// History-bearing tables keyed to a User. Used to decide whether a departed
// employee may be hard-deleted or must be detach-and-kept so their Stage 1 and
// later-stage evaluation records stay visible on the site.
async function userIdsWithHistory(tx, userIds) {
  if (userIds.length === 0) return new Set();
  const byUser = { userId: { in: userIds } };
  const byEmp = { employeeId: { in: userIds } };
  const rows = await Promise.all([
    tx.selfAssessment.findMany({ where: byUser, select: { userId: true } }),
    tx.branchShortlistStage1.findMany({ where: byUser, select: { userId: true } }),
    tx.branchShortlistStage2.findMany({ where: byUser, select: { userId: true } }),
    tx.branchShortlistStage3.findMany({ where: byUser, select: { userId: true } }),
    tx.branchShortlistStage4.findMany({ where: byUser, select: { userId: true } }),
    tx.branchBestEmployee.findMany({ where: byUser, select: { userId: true } }),
    tx.shortlistStage1.findMany({ where: byUser, select: { userId: true } }),
    tx.shortlistStage2.findMany({ where: byUser, select: { userId: true } }),
    tx.shortlistStage3.findMany({ where: byUser, select: { userId: true } }),
    tx.bestEmployee.findMany({ where: byUser, select: { userId: true } }),
    tx.supervisorEvaluation.findMany({ where: byEmp, select: { employeeId: true } }),
    tx.hodEvaluation.findMany({ where: byEmp, select: { employeeId: true } }),
    tx.branchManagerEvaluation.findMany({ where: byEmp, select: { employeeId: true } }),
    tx.clusterManagerEvaluation.findMany({ where: byEmp, select: { employeeId: true } }),
    tx.hrEvaluation.findMany({ where: byEmp, select: { employeeId: true } }),
  ]);
  const set = new Set();
  for (const list of rows) for (const r of list) set.add(r.userId ?? r.employeeId);
  return set;
}

// Non-destructive sync of one branch from the sheet.
//
// Employees present in the sheet are UPDATED IN PLACE (matched by empCode) so
// their User.id — and therefore every Stage 1 / evaluation record FK'd to it —
// survives a department or profile change. This is the core fix: the previous
// delete+recreate cascade-deleted history whenever a re-imported employee moved
// department. Departed employees (not in the sheet) are archived and then either
// hard-deleted (only when they carry NO assessment history) or detached from the
// branch (when they do), so valid historical assessment data is never lost.
async function importBranch(branch, branchRows) {
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

  return prisma.$transaction(async (tx) => {
    // 1) Upsert departments (create missing, refresh collar on existing). No
    //    department is deleted while it may still own employees.
    for (const d of deptDefs) {
      await tx.department.upsert({
        where: { name_branchId: { name: d.name, branchId } },
        update: { collarType: d.collarType },
        create: { name: d.name, branchId, collarType: d.collarType },
      });
    }
    const freshDepts = await tx.department.findMany({ where: { branchId }, select: { id: true, name: true } });
    const deptIdByName = new Map(freshDepts.map((d) => [d.name, d.id]));

    // 2) Upsert employees by empCode. Existing rows are UPDATED (id preserved →
    //    history preserved); only genuinely new rows are created. Role and
    //    password are left untouched on update so org structure and existing
    //    credentials survive a profile/department change.
    const existing = await tx.user.findMany({
      where: { empCode: { in: keptCodes } },
      select: { id: true, empCode: true },
    });
    const idByCode = new Map(existing.map((u) => [u.empCode, u.id]));
    let created = 0, updated = 0;
    for (const r of branchRows) {
      const departmentId = r.deptName ? (deptIdByName.get(r.deptName) || null) : null;
      const existingId = idByCode.get(r.empCode);
      if (existingId) {
        await tx.user.update({
          where: { id: existingId },
          data: {
            name: r.name,
            branchId,
            departmentId,
            collarType: r.employeeCollar,
            designation: r.designation || null,
            mobile: r.mobile || null,
          },
        });
        updated++;
      } else {
        await tx.user.create({
          data: {
            empCode: r.empCode, name: r.name,
            password: await bcrypt.hash(String(r.empCode), SALT_ROUNDS),
            role: "EMPLOYEE", branchId, departmentId,
            collarType: r.employeeCollar, designation: r.designation || null, mobile: r.mobile || null,
          },
        });
        created++;
      }
    }

    // 3) Departed employees (in this branch, EMPLOYEE/HOD, absent from sheet).
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
    let archived = 0, detached = 0, removed = 0;
    if (staleUsers.length > 0) {
      await tx.archivedEmployee.createMany({
        data: staleUsers.map((u) => ({
          empCode: u.empCode, name: u.name, mobile: u.mobile, designation: u.designation,
          department: u.department?.name || "Unknown", joiningDate: u.createdAt,
          reasonLeaving: `Not present in latest ${branch.name} sheet import`,
          archivedBy: "script:import-jaipur", originalUserId: u.id,
        })),
      });
      archived = staleUsers.length;

      const staleIds = staleUsers.map((u) => u.id);
      const withHistory = await userIdsWithHistory(tx, staleIds);
      const detachIds = staleIds.filter((id) => withHistory.has(id));
      const deleteIds = staleIds.filter((id) => !withHistory.has(id));

      // Keep history-bearing leavers but pull them out of the active branch so
      // their old assessments remain visible without cluttering current lists.
      if (detachIds.length > 0) {
        await tx.user.updateMany({
          where: { id: { in: detachIds } },
          data: { departmentId: null, branchId: null },
        });
        detached = detachIds.length;
      }
      // Safe to hard-delete only those with no assessment history at all.
      if (deleteIds.length > 0) {
        await tx.user.deleteMany({ where: { id: { in: deleteIds } } });
        removed = deleteIds.length;
      }
    }

    // 4) Remove now-empty departments left behind by the sheet (no employees,
    //    no FK shortcuts) so the org tree stays clean. Departments still owning
    //    users are never touched.
    const emptyDepts = await tx.department.findMany({
      where: { branchId, users: { none: {} } },
      select: { id: true },
    });
    if (emptyDepts.length > 0) {
      await tx.department.deleteMany({ where: { id: { in: emptyDepts.map((d) => d.id) } } });
    }

    return { departmentsCreated: deptDefs, employeesImported: branchRows.length, created, updated, archived, detached, removed };
  }, { timeout: 120000, maxWait: 20000 });
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

  const res = await importBranch(branch, importable);
  console.log(`\nBranch: ${branch.name}`);
  console.log(`  Employees in sheet: ${res.employeesImported} (updated in place: ${res.updated}, newly created: ${res.created})`);
  console.log(`  Departments: ${res.departmentsCreated.map((d) => `${d.name}[${d.collarType === "BLUE_COLLAR" ? "BLUE" : "WHITE"}]`).join(", ")}`);
  console.log(`  Departed employees archived: ${res.archived} (detached, history kept: ${res.detached}; removed, no history: ${res.removed})`);
  if (errors.length > 0) { console.log("\nErrors / skipped:"); errors.forEach((e) => console.log("  " + e)); }
}

main()
  .catch((e) => { console.error("IMPORT FAILED:", e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
