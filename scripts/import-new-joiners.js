/**
 * One-off: add newly joined employees from "Copy of Employees_Format_new.xlsx".
 * INSERT-ONLY: existing empCodes are skipped (never updated/overwritten). Touches only
 * `users` (and `departments` if a branch lacks the named department). Does not touch any
 * evaluation, quarter, stage, shortlist or winner data.
 *
 * Preview:  node scripts/import-new-joiners.js --dry
 * Execute:  node scripts/import-new-joiners.js
 */
const XLSX = require("xlsx");
const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const FILE = "C:/Users/Dinesh/Downloads/Copy of Employees_Format_new.xlsx";
const DRY = process.argv.includes("--dry");
const cell = (v) => (v == null ? "" : String(v).trim());
const normBranch = (s) => cell(s).toLowerCase().replace(/nathadwara/, "nathdwara");
const collarFrom = (s) => ({ "white collar": "WHITE_COLLAR", "blue collar": "BLUE_COLLAR" })[cell(s).toLowerCase()] || null;

async function main() {
  const wb = XLSX.readFile(FILE);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" }).map((o, i) => ({
    ref: `row ${i + 2}`, empCode: cell(o["Emp Code"]), name: cell(o["Name"]), dept: cell(o["Department"]),
    branch: cell(o["Branch"]), designation: cell(o["Designation"]), mobile: cell(o["Mobile"]),
    role: cell(o["Role"]), collar: collarFrom(o["Collar / Category"]),
  }));

  const errors = [];
  const branches = await prisma.branch.findMany({ select: { id: true, name: true } });
  const bByNorm = new Map(branches.map((b) => [normBranch(b.name), b]));
  const existing = new Set((await prisma.user.findMany({ where: { empCode: { in: rows.map((r) => r.empCode) } }, select: { empCode: true } })).map((u) => u.empCode));

  const toCreate = [], skipped = [];
  for (const r of rows) {
    if (!r.empCode || !r.name) { errors.push(`${r.ref}: missing code/name`); continue; }
    if (r.role) { errors.push(`${r.ref} ${r.empCode}: Role "${r.role}" given — not handled, skipped`); continue; }
    if (!r.collar) { errors.push(`${r.ref} ${r.empCode}: bad collar`); continue; }
    const b = bByNorm.get(normBranch(r.branch));
    if (!b) { errors.push(`${r.ref} ${r.empCode}: branch "${r.branch}" not found`); continue; }
    if (existing.has(r.empCode)) { skipped.push(`${r.empCode} ${r.name}`); continue; }
    r.branchId = b.id; r.branchName = b.name.trim();
    toCreate.push(r);
  }

  const depts = await prisma.department.findMany({ select: { id: true, name: true, branchId: true } });
  const dKey = (bid, n) => `${bid}::${n.toLowerCase()}`;
  const dMap = new Map(depts.map((d) => [dKey(d.branchId, d.name.trim()), d]));
  const newDepts = new Map();
  for (const r of toCreate) if (!dMap.has(dKey(r.branchId, r.dept))) newDepts.set(dKey(r.branchId, r.dept), `${r.branchName}::${r.dept}`);

  console.log(DRY ? "=== DRY RUN ===" : "=== IMPORT ===");
  console.log(`rows ${rows.length} | to create ${toCreate.length} | existing-skipped ${skipped.length} | errors ${errors.length}`);
  skipped.forEach((s) => console.log("  skip existing:", s));
  errors.forEach((e) => console.log("  ERROR:", e));
  console.log("New departments needed:", [...newDepts.values()]);
  const sum = {}; toCreate.forEach((r) => { const k = `${r.branchName}/${r.dept}`; sum[k] = (sum[k] || 0) + 1; });
  console.log(sum);
  if (DRY) return;
  if (errors.length) throw new Error("Refusing to import with errors");

  const res = await prisma.$transaction(async (tx) => {
    for (const [k, label] of newDepts) {
      const [branchId] = k.split("::"); const name = label.split("::")[1];
      const d = await tx.department.create({ data: { name, branchId }, select: { id: true, name: true, branchId: true } });
      dMap.set(k, d);
    }
    let n = 0;
    for (const r of toCreate) {
      await tx.user.create({ data: {
        empCode: r.empCode, name: r.name.toUpperCase(), password: await bcrypt.hash(r.empCode, 10),
        role: "EMPLOYEE", branchId: r.branchId, departmentId: dMap.get(dKey(r.branchId, r.dept)).id,
        collarType: r.collar, designation: r.designation || null, mobile: r.mobile || null,
      } });
      n++;
    }
    return n;
  }, { timeout: 120000, maxWait: 20000 });
  console.log(`Created ${res} employees.`);
}
main().catch((e) => { console.error("FAILED:", e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
