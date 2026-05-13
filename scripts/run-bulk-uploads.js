/**
 * End-to-end test of the per-branch employees-only bulk-upload logic.
 * Runs the same Prisma operations the route does, against the live DB.
 * Verifies the new multi-tab + Location filter + collar inference + ADMIN skip behaviour.
 *
 * Run: node scripts/run-bulk-uploads.js
 */
const XLSX = require("xlsx");
const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const SALT_ROUNDS = 10;

const FILES = [
  {
    branch: "Jaipur",
    path: "C:\\Users\\Dinesh\\Downloads\\self_assessment_-Jaipur_EMployee_Details-Main_list1.xlsx",
  },
  {
    branch: "Ajmer",
    path: "C:\\Users\\Dinesh\\Downloads\\Employee Self-Assessment Sheet_AJM_BARAN_BIK_JLW_JDP (1).xlsx",
  },
  {
    branch: "Baran",
    path: "C:\\Users\\Dinesh\\Downloads\\Employee Self-Assessment Sheet_AJM_BARAN_BIK_JLW_JDP (1).xlsx",
  },
  {
    branch: "Bikaner",
    path: "C:\\Users\\Dinesh\\Downloads\\Employee Self-Assessment Sheet_AJM_BARAN_BIK_JLW_JDP (1).xlsx",
  },
  {
    branch: "Jhalawar",
    path: "C:\\Users\\Dinesh\\Downloads\\Employee Self-Assessment Sheet_AJM_BARAN_BIK_JLW_JDP (1).xlsx",
  },
  {
    branch: "Jodhpur",
    path: "C:\\Users\\Dinesh\\Downloads\\Employee Self-Assessment Sheet_AJM_BARAN_BIK_JLW_JDP (1).xlsx",
  },
];

const COLLAR_MAP = {
  blue_collar: "BLUE_COLLAR", bluecollar: "BLUE_COLLAR", blue: "BLUE_COLLAR", bc: "BLUE_COLLAR",
  white_collar: "WHITE_COLLAR", whitecollar: "WHITE_COLLAR", white: "WHITE_COLLAR", wc: "WHITE_COLLAR",
};
const EMPCODE_KEYS  = ["empcode", "employeecode", "empid", "code"];
const NAME_KEYS     = ["name", "employeename", "fullname"];
const DEPT_KEYS     = ["department", "dept", "departmentname", "departmentdescription"];
const MOBILE_KEYS   = ["mobile", "mobileno", "phone", "contact"];
const DESIG_KEYS    = ["designation", "designationdescription", "position", "title"];
const COLLAR_KEYS   = ["collar", "collartype"];
const LOCATION_KEYS = ["location", "locationdescription", "branch", "branchname"];
const DIVISION_KEYS = ["division", "divisiondescription"];

function normKey(k) { return String(k).trim().toLowerCase().replace(/[^a-z0-9]/g, ""); }
function normRow(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) out[normKey(k)] = typeof v === "string" ? v.trim() : v;
  return out;
}
function pick(row, keys) {
  for (const k of keys) if (row[k] !== undefined && row[k] !== null && row[k] !== "") return String(row[k]).trim();
  return "";
}
function deriveCollar(row, sheetName) {
  const explicit = pick(row, COLLAR_KEYS).toLowerCase().replace(/[^a-z_]/g, "");
  if (explicit && COLLAR_MAP[explicit]) return COLLAR_MAP[explicit];
  const division = pick(row, DIVISION_KEYS).toLowerCase();
  if (division.includes("worker")) return "BLUE_COLLAR";
  if (division.includes("management") || division.includes("staff")) return "WHITE_COLLAR";
  const tab = String(sheetName || "").toLowerCase();
  if (/\bblue\s*coll/.test(tab) || tab.includes("blue collar")) return "BLUE_COLLAR";
  if (/\bwhite\s*coll/.test(tab) || tab.includes("white collar")) return "WHITE_COLLAR";
  return "WHITE_COLLAR";
}
function defaultPasswordFor({ empCode }) { return String(empCode); }

async function importBranch({ branch, path }) {
  console.log(`\n${"━".repeat(60)}\nImporting: ${branch}\n${"━".repeat(60)}`);

  const branchRow = await prisma.branch.findFirst({
    where: { name: { contains: branch, mode: "insensitive" } },
    select: { id: true, name: true, branchType: true },
  });
  if (!branchRow) {
    console.log(`  ✗ Branch "${branch}" not found in DB. Skipping.`);
    return;
  }
  const branchId = branchRow.id;
  const targetKey = branchRow.name.trim().toLowerCase();

  const wb = XLSX.readFile(path);
  const rows = [];
  const skipped = [];
  let scanned = 0;

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
    for (let i = 0; i < rawRows.length; i++) {
      scanned++;
      const r = normRow(rawRows[i]);
      const empCode = pick(r, EMPCODE_KEYS);
      const name = pick(r, NAME_KEYS);
      if (!empCode && !name) continue;
      if (!empCode || !name) continue;
      const location = pick(r, LOCATION_KEYS);
      if (location && location.trim().toLowerCase() !== targetKey) {
        skipped.push({ empCode, location });
        continue;
      }
      const department = pick(r, DEPT_KEYS);
      if (!department) continue;
      const collarType = deriveCollar(r, sheetName);
      const designation = pick(r, DESIG_KEYS);
      const mobile = pick(r, MOBILE_KEYS);
      rows.push({ empCode: String(empCode), name, department, collarType, designation, mobile, sheetName });
    }
  }

  // Dedupe
  const seen = new Map();
  for (const r of rows) seen.set(r.empCode, r);
  const dedup = [...seen.values()];

  // ADMIN-skip
  const admins = await prisma.user.findMany({
    where: { empCode: { in: dedup.map((r) => r.empCode) }, role: "ADMIN" },
    select: { empCode: true, name: true },
  });
  const adminCodes = new Set(admins.map((u) => u.empCode));
  const importable = dedup.filter((r) => !adminCodes.has(r.empCode));

  // Build (deptName, collar) pairs for collar-aware lookup
  const deptKeyOf = (n, c) => `${n}::${c}`;
  const deptPairs = new Set();
  for (const r of importable) deptPairs.add(deptKeyOf(r.department, r.collarType));

  // Pre-hash
  const hashes = new Map();
  for (const r of importable) {
    hashes.set(r.empCode, await bcrypt.hash(defaultPasswordFor({ empCode: r.empCode }), SALT_ROUNDS));
  }

  let created = 0, updated = 0;
  const deptsCreated = [];
  const deptResolutionLog = [];
  const collarSuffix = (c) => c === "WHITE_COLLAR" ? "White Collar" : "Blue Collar";
  await prisma.$transaction(async (tx) => {
    const deptMap = new Map();
    for (const key of deptPairs) {
      const [deptName, collarType] = key.split("::");
      let dept = await tx.department.findFirst({ where: { branchId, name: deptName, collarType } });
      let via = "exact-name-collar";
      if (!dept) {
        dept = await tx.department.findFirst({
          where: { branchId, collarType, name: { startsWith: deptName, mode: "insensitive" } },
        });
        if (dept) via = "suffix-variant";
      }
      if (!dept) {
        dept = await tx.department.findFirst({ where: { branchId, name: deptName } });
        if (dept) via = "name-only-fallback";
      }
      if (!dept) {
        const sameNameOther = await tx.department.findFirst({ where: { branchId, name: deptName } });
        const finalName = sameNameOther ? `${deptName} ${collarSuffix(collarType)}` : deptName;
        dept = await tx.department.create({ data: { name: finalName, branchId, collarType } });
        deptsCreated.push(finalName);
        via = "created";
      }
      deptMap.set(key, dept.id);
      deptResolutionLog.push({ deptName, collarType, resolvedTo: dept.name, via });
    }
    for (const r of importable) {
      const departmentId = deptMap.get(deptKeyOf(r.department, r.collarType));
      const existing = await tx.user.findUnique({ where: { empCode: r.empCode } });
      if (existing) {
        await tx.user.update({
          where: { empCode: r.empCode },
          data: {
            name: r.name, role: "EMPLOYEE", branchId, departmentId,
            collarType: r.collarType,
            designation: r.designation || null, mobile: r.mobile || null,
          },
        });
        updated++;
      } else {
        await tx.user.create({
          data: {
            empCode: r.empCode, name: r.name, role: "EMPLOYEE",
            password: hashes.get(r.empCode),
            branchId, departmentId, collarType: r.collarType,
            designation: r.designation || null, mobile: r.mobile || null,
          },
        });
        created++;
      }
    }
  });

  console.log(`  Branch:        ${branchRow.name} (${branchRow.branchType})`);
  console.log(`  Scanned:       ${scanned}`);
  console.log(`  Importable:    ${importable.length}`);
  console.log(`  Dupes in file: ${dedup.length - importable.length + (rows.length - dedup.length)}`);
  console.log(`  ADMIN skipped: ${admins.length} ${admins.map((a) => a.empCode + " " + a.name).join(", ")}`);
  console.log(`  Other branch:  ${skipped.length}`);
  console.log(`  Departments+:  ${deptsCreated.length} (${deptsCreated.join(", ")})`);
  console.log(`  Created:       ${created}`);
  console.log(`  Updated:       ${updated}`);
  console.log(`  Dept resolution:`);
  for (const e of deptResolutionLog) {
    if (e.deptName !== e.resolvedTo || e.via !== "exact-name-collar") {
      console.log(`    ${e.deptName} (${e.collarType}) → "${e.resolvedTo}" via ${e.via}`);
    }
  }
}

async function finalReport() {
  console.log(`\n${"═".repeat(60)}\nFINAL DB STATE\n${"═".repeat(60)}`);
  const users = await prisma.user.groupBy({
    by: ["role"], _count: { role: true },
  });
  console.log("Users by role:");
  users.forEach((u) => console.log(`  ${u.role}: ${u._count.role}`));

  const branches = await prisma.branch.findMany({
    select: { id: true, name: true, branchType: true,
      _count: { select: { scopedUsers: true, departments: true } },
    },
    orderBy: { name: "asc" },
  });
  console.log("\nPer-branch employee + department counts:");
  for (const b of branches) {
    const empCount = await prisma.user.count({ where: { branchId: b.id, role: "EMPLOYEE" } });
    console.log(`  ${b.name.padEnd(15)} (${b.branchType}): ${empCount} employees, ${b._count.departments} depts`);
  }

  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" }, select: { empCode: true, name: true, role: true, branchId: true } });
  console.log(`\nAdmin preserved: ${admin ? `${admin.empCode} ${admin.name} (role=${admin.role}, branchId=${admin.branchId || "null"})` : "NONE"}`);
}

async function main() {
  for (const f of FILES) {
    try { await importBranch(f); }
    catch (e) { console.error(`  ✗ Error: ${e.message}`); }
  }
  await finalReport();
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
