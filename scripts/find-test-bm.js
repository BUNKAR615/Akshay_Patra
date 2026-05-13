/* Find a BIG-branch BM for verification — prints empCode + branch. */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

(async () => {
  const bms = await prisma.branchManagerAssignment.findMany({
    include: {
      bm: { select: { id: true, name: true, empCode: true } },
      branch: { select: { id: true, name: true, branchType: true } },
    },
  });
  for (const r of bms) {
    if (r.branch?.branchType === "BIG") {
      console.log(`BIG-BM: ${r.bm?.name} | empCode=${r.bm?.empCode} | branch=${r.branch.name}`);
    }
  }
  // Also any ADMIN with passwordHod set + active HodAssignment
  const adminHods = await prisma.user.findMany({
    where: { role: "ADMIN", passwordHod: { not: null } },
    select: { id: true, name: true, empCode: true },
  });
  console.log("\nADMINS with passwordHod set:");
  for (const u of adminHods) {
    const ha = await prisma.hodAssignment.findFirst({
      where: { hodUserId: u.id, quarter: { status: "ACTIVE" } },
      select: { id: true },
    });
    console.log(`  ${u.name} (${u.empCode}) — active HOD assignment: ${ha ? "YES" : "NO"}`);
  }
  await prisma.$disconnect();
})();
