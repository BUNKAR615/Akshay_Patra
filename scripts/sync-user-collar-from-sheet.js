/**
 * Make User.collarType match the uploaded Jaipur sheet EXACTLY for every
 * EVALUATED employee present in it (role EMPLOYEE or HOD). ONLY the collarType
 * field is written; role, department, branch, password and profile are never
 * touched.
 *
 * Protected role-holders (BRANCH_MANAGER/CLUSTER_MANAGER/HR/COMMITTEE/ADMIN)
 * are intentionally EXCLUDED: they are not evaluated employees, they already
 * render correctly via the snapshot fallback, and writing a WHITE collar on
 * them could make them surface in the HOD-candidate list (a role-logic side
 * effect we must not introduce).
 *
 * Collar rule = the same Jaipur designation rule the importer uses.
 *
 *   Preview:  node scripts/sync-user-collar-from-sheet.js --dry
 *   Apply:    node scripts/sync-user-collar-from-sheet.js
 */
const XLSX = require("xlsx");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const FILE = "C:/Users/Dinesh/Downloads/self assessment -Jaipur EMployee Details-Main.xlsx";
const DRY = process.argv.includes("--dry");

const normKey = (k) => String(k ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
const cellStr = (v) => (v === null || v === undefined ? "" : String(v).trim());
const EMPCODE_KEYS = ["empcode", "employeecode", "empid", "code"];
const NAME_KEYS = ["name", "employeename", "fullname"];
const DESIG_KEYS = ["designation", "designationdescription", "position", "title"];
const HEADER_HINTS = new Set([...EMPCODE_KEYS, ...NAME_KEYS, ...DESIG_KEYS, "department", "mobile", "mobileno"]);
const WHITE_KEYWORDS = ["supervisor", "manager", "officer", "executive", "agm", "gm"];
const collarFor = (d) => WHITE_KEYWORDS.some((k) => String(d || "").toLowerCase().includes(k)) ? "WHITE_COLLAR" : "BLUE_COLLAR";
const pick = (obj, keys) => { for (const k of keys) { const v = cellStr(obj[k]); if (v) return v; } return ""; };

(async () => {
  const wb = XLSX.readFile(FILE);
  // empCode -> collar, last tab wins (matches importer dedupe)
  const collarByCode = new Map();
  for (const sn of wb.SheetNames) {
    if (normKey(sn) === normKey("MainF")) continue;
    const grid = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, blankrows: false, defval: null });
    let h = -1;
    for (let i = 0; i < grid.length; i++) {
      if ((grid[i] || []).filter((c) => HEADER_HINTS.has(normKey(c))).length >= 2) { h = i; break; }
    }
    if (h === -1) continue;
    const colMap = {};
    (grid[h] || []).forEach((c, i) => { colMap[i] = normKey(c); });
    for (const arr of grid.slice(h + 1)) {
      const obj = {};
      (arr || []).forEach((v, i) => { if (colMap[i]) obj[colMap[i]] = v; });
      const code = pick(obj, EMPCODE_KEYS);
      const name = pick(obj, NAME_KEYS);
      if (!code || !name) continue;
      if (/total\s*employees/i.test(cellStr((arr || [])[0]))) continue;
      collarByCode.set(code, collarFor(pick(obj, DESIG_KEYS)));
    }
  }

  const codes = [...collarByCode.keys()];
  const users = await prisma.user.findMany({
    where: { empCode: { in: codes }, role: { in: ["EMPLOYEE", "HOD"] } },
    select: { id: true, empCode: true, name: true, role: true, collarType: true },
  });

  const toFix = users.filter((u) => collarByCode.get(u.empCode) !== u.collarType);
  console.log(DRY ? "=== DRY RUN (no writes) ===" : "=== SYNC USER COLLAR FROM SHEET ===");
  console.log(`Sheet employees: ${codes.length} | matched users: ${users.length} | collar to fix: ${toFix.length}\n`);
  for (const u of toFix) {
    const want = collarByCode.get(u.empCode);
    console.log(`  ${u.empCode} ${u.name} [${u.role}]: ${u.collarType ?? "null"} -> ${want}`);
    if (!DRY) {
      await prisma.user.update({ where: { id: u.id }, data: { collarType: want } });
    }
  }
  console.log(`\n${DRY ? "Would fix" : "Fixed"} ${toFix.length} user(s).`);
})().catch((e) => { console.error("SYNC FAILED:", e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
