/**
 * One-off: import NDW (Nathdwara) & BHL (Bhilwara) employees.
 *
 * Mirrors app/api/admin/branches/import/route.js (small-branch mode):
 * per-branch full replacement — clears each branch's old employees,
 * departments and role mappings, then recreates from the sheet.
 * EMPLOYEE password = empCode. Run: node scripts/import-ndw-bhl-branches.js
 *
 * NOTE: the sheet spells the branch "Nathadwara"; the DB branch is
 * "Nathdwara" — mapped via LOCATION_ALIAS below (confirmed: same branch).
 */
const XLSX = require("xlsx");
const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const SALT_ROUNDS = 10;
const FILE = "C:/Users/Dinesh/Downloads/Employee Assesment data sheet NDW & BHL.xlsx";

// Sheet location (normalized) -> DB branch name (normalized).
const LOCATION_ALIAS = { nathadwara: "nathdwara" };

const normKey = (k) => String(k ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
const cellStr = (v) => (v === null || v === undefined ? "" : String(v).trim());

const EMPCODE_KEYS = ["empcode", "employeecode", "empid", "code"];
const NAME_KEYS = ["name", "employeename", "fullname"];
const DEPT_KEYS = ["department", "dept", "departmentname", "departmentdescription"];
const MOBILE_KEYS = ["mobile", "mobileno", "mobilenumber", "phone", "contact"];
const DESIG_KEYS = ["designation", "designationdescription", "position", "title"];
const LOCATION_KEYS = ["location", "locationdescription", "branch", "branchname", "branchlocation"];
const HEADER_HINTS = new Set([...EMPCODE_KEYS, ...NAME_KEYS, ...DEPT_KEYS, ...MOBILE_KEYS, ...DESIG_KEYS, ...LOCATION_KEYS]);

const BLUE_KEYWORDS = ["helper", "security", "cook", "driver"];
const collarFromDesignation = (d) =>
  BLUE_KEYWORDS.some((k) => String(d || "").toLowerCase().includes(k)) ? "BLUE_COLLAR" : "WHITE_COLLAR";

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
    const grid = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, blankrows: false, defval: null });
    if (!Array.isArray(grid) || grid.length === 0) continue;
    const headerHits = (grid[0] || []).filter((c) => HEADER_HINTS.has(normKey(c))).length;
    const hasHeader = headerHits >= 2;
    const colMap = {};
    (grid[0] || []).forEach((c, i) => { colMap[i] = normKey(c); });
    const dataRows = hasHeader ? grid.slice(1) : grid;
    for (let i = 0; i < dataRows.length; i++) {
      const arr = dataRows[i] || [];
      const obj = {};
      arr.forEach((v, idx) => { if (colMap[idx]) obj[colMap[idx]] = v; });
      const empCode = pick(obj, EMPCODE_KEYS);
      const name = pick(obj, NAME_KEYS);
      if (!empCode && !name) continue;
      rows.push({
        rowRef: `${sheetName}!${i + 2}`,
        empCode, name,
        department: pick(obj, DEPT_KEYS),
        designation: pick(obj, DESIG_KEYS),
        mobile: pick(obj, MOBILE_KEYS),
        location: pick(obj, LOCATION_KEYS),
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
          archivedBy: "script:import-ndw-bhl", originalUserId: u.id,
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
    r.deptName = r.department;
    r.employeeCollar = collarFromDesignation(r.designation);
    validRows.push(r);
  }

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

  // Group by location (alias-normalized).
  const groups = new Map();
  for (const r of importable) {
    if (!r.location) { errors.push(`${r.rowRef}: missing location — skipped`); continue; }
    let key = r.location.trim().toLowerCase();
    key = LOCATION_ALIAS[normKey(key)] || key;
    if (!groups.has(key)) groups.set(key, { matchKey: key, sheetLabel: r.location.trim(), rows: [] });
    groups.get(key).rows.push(r);
  }

  const allBranches = await prisma.branch.findMany({ select: { id: true, name: true, slug: true } });
  const results = [];
  for (const { matchKey, sheetLabel, rows } of groups.values()) {
    const branch = allBranches.find((b) => b.name.trim().toLowerCase() === matchKey);
    if (!branch) { errors.push(`No branch found for "${sheetLabel}" (matchKey "${matchKey}") — group skipped`); continue; }
    const res = await replaceBranch(branch, rows);
    results.push({ branch: branch.name.trim(), sheetLabel, ...res });
  }

  console.log("=== IMPORT COMPLETE ===");
  console.log("Scanned rows:", raw.length, "| Valid:", validRows.length, "| Deduped:", deduped.length);
  if (protectedUsers.length > 0) {
    console.log("Protected (skipped):", protectedUsers.map((u) => `${u.empCode} (${u.role})`).join(", "));
  }
  for (const r of results) {
    console.log(`\nBranch: ${r.branch}  (sheet label: "${r.sheetLabel}")`);
    console.log(`  Employees imported: ${r.employeesImported}`);
    console.log(`  Departments: ${r.departmentsCreated.map((d) => `${d.name}[${d.collarType === "BLUE_COLLAR" ? "BLUE" : "WHITE"}]`).join(", ")}`);
    console.log(`  Stale employees archived: ${r.archived}`);
  }
  if (errors.length > 0) {
    console.log("\nErrors / skipped:");
    errors.forEach((e) => console.log("  " + e));
  }
}

main()
  .catch((e) => { console.error("IMPORT FAILED:", e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
