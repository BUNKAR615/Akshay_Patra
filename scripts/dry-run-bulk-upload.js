/**
 * Dry-run the new bulk-upload parsing logic against the actual xlsx files.
 * Does NOT write to the DB. Reports per-branch row counts, collar inference,
 * and which rows would be skipped.
 */
const XLSX = require("xlsx");

const FILES = [
  {
    label: "Jaipur (multi-tab dept-wise)",
    path: "C:\\Users\\Dinesh\\Downloads\\self_assessment_-Jaipur_EMployee_Details-Main_list1.xlsx",
    branch: "Jaipur",
  },
  {
    label: "Small branches (single tab)",
    path: "C:\\Users\\Dinesh\\Downloads\\Employee Self-Assessment Sheet_AJM_BARAN_BIK_JLW_JDP (1).xlsx",
    branchesToTest: ["Ajmer", "Baran", "Bikaner", "Jhalawar", "Jodhpur"],
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
  for (const [k, v] of Object.entries(row)) {
    out[normKey(k)] = typeof v === "string" ? v.trim() : v;
  }
  return out;
}
function pick(row, keys) {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && row[k] !== "") return String(row[k]).trim();
  }
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

function parseFile(path, targetBranchName) {
  const workbook = XLSX.readFile(path);
  const targetKey = targetBranchName.trim().toLowerCase();
  const rows = [];
  const skipped = [];
  const errors = [];
  let scannedRows = 0;

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
    for (let i = 0; i < rawRows.length; i++) {
      scannedRows++;
      const r = normRow(rawRows[i]);
      const rowRef = `${sheetName}!${i + 2}`;
      const empCode = pick(r, EMPCODE_KEYS);
      const name = pick(r, NAME_KEYS);
      if (!empCode && !name) continue;
      if (!empCode) { errors.push(`${rowRef}: missing empCode`); continue; }
      if (!name) { errors.push(`${rowRef}: missing name`); continue; }

      const location = pick(r, LOCATION_KEYS);
      if (location && location.trim().toLowerCase() !== targetKey) {
        skipped.push({ rowRef, empCode, location });
        continue;
      }

      const department = pick(r, DEPT_KEYS);
      if (!department) { errors.push(`${rowRef}: missing department`); continue; }

      const collarType = deriveCollar(r, sheetName);
      rows.push({ rowRef, sheetName, empCode: String(empCode), name, department, collarType });
    }
  }

  // Dedupe within file
  const seen = new Map();
  for (const r of rows) seen.set(r.empCode, r);
  const dedup = [...seen.values()];
  return { rows: dedup, skipped, errors, scannedRows, duplicatesInFile: rows.length - dedup.length };
}

function summarize(result, label) {
  console.log(`\n=== ${label} ===`);
  console.log(`Scanned rows: ${result.scannedRows}`);
  console.log(`Importable rows (deduped): ${result.rows.length}`);
  console.log(`Duplicates in file: ${result.duplicatesInFile}`);
  console.log(`Skipped (other branch): ${result.skipped.length}`);
  console.log(`Errors: ${result.errors.length}`);

  // Department + collar breakdown
  const deptStats = new Map();
  for (const r of result.rows) {
    const key = `${r.department} (${r.collarType})`;
    deptStats.set(key, (deptStats.get(key) || 0) + 1);
  }
  console.log(`Departments:`);
  for (const [k, v] of [...deptStats.entries()].sort()) {
    console.log(`  ${k}: ${v}`);
  }

  if (result.errors.length > 0) {
    console.log(`First 5 errors:`);
    for (const e of result.errors.slice(0, 5)) console.log(`  ${e}`);
  }
  if (result.skipped.length > 0 && result.skipped.length <= 5) {
    console.log(`Skipped:`);
    for (const s of result.skipped) console.log(`  ${s.rowRef} (${s.empCode}) → ${s.location}`);
  }
}

for (const f of FILES) {
  console.log("\n" + "█".repeat(80));
  console.log("FILE:", f.label);
  console.log("█".repeat(80));

  if (f.branch) {
    summarize(parseFile(f.path, f.branch), `Upload as branch="${f.branch}"`);
  } else if (f.branchesToTest) {
    for (const b of f.branchesToTest) {
      summarize(parseFile(f.path, b), `Upload as branch="${b}"`);
    }
  }
}
