/** Read-only: show current DB state for the Sheet1 empCodes. No writes. */
const XLSX = require("xlsx");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const FILE = "C:/Users/Dinesh/Downloads/Copy of Employees_list_all_branches-1-HR Comments.xlsx";
const EXCLUDE = new Set(["1800002", "1800012"]);
const cell = (v) => (v === null || v === undefined ? "" : String(v).trim());

async function main() {
  const wb = XLSX.readFile(FILE);
  const grid = XLSX.utils.sheet_to_json(wb.Sheets["Sheet1"], { header: 1, defval: null, blankrows: false });
  const header = grid[0];
  const rows = grid.slice(1).filter((r) => r && r.some((c) => cell(c) !== ""));
  const codes = rows.map((r) => { const o = {}; header.forEach((h, i) => (o[cell(h)] = r[i])); return cell(o["Emp Code"]); })
    .filter((c) => c && !EXCLUDE.has(c));

  const users = await prisma.user.findMany({
    where: { empCode: { in: codes } },
    select: {
      empCode: true, name: true, role: true, collarType: true, designation: true, mobile: true,
      scopedBranch: { select: { name: true } },
      department: { select: { name: true, branch: { select: { name: true } } } },
    },
    orderBy: { empCode: "asc" },
  });
  const byCode = new Map(users.map((u) => [u.empCode, u]));

  console.log(`Sheet1 employees (excluding 2): ${codes.length}`);
  console.log(`Currently in DB: ${users.length} | Not yet in DB: ${codes.length - users.length}\n`);

  console.log("=== ALREADY IN DATABASE ===");
  console.log("empCode  | name                       | role     | branch       | department        | collar");
  console.log("-".repeat(110));
  for (const u of users) {
    const branch = (u.scopedBranch?.name || u.department?.branch?.name || "—").trim();
    console.log(
      `${(u.empCode || "").padEnd(8)} | ${(u.name || "").padEnd(26)} | ${(u.role || "").padEnd(8)} | ${branch.padEnd(12)} | ${(u.department?.name || "—").padEnd(17)} | ${u.collarType || "—"}`
    );
  }

  const missing = codes.filter((c) => !byCode.has(c));
  console.log(`\n=== NOT IN DATABASE (would be created): ${missing.length} ===`);
  console.log(missing.join(", "));
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
