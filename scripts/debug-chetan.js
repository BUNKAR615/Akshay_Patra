const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

(async () => {
  const user = await prisma.user.findFirst({
    where: { empCode: "5100029" },
    select: {
      id: true,
      name: true,
      empCode: true,
      role: true,
      password: true,
      departmentId: true,
      branchId: true,
    },
  });
  console.log("user", user ? { ...user, password: user.password ? "<set>" : null } : null);

  if (!user) {
    await prisma.$disconnect();
    return;
  }

  const hrs = await prisma.hrBranchAssignment.findMany({
    where: { hrUserId: user.id },
    select: { branchId: true, assignedAt: true, branch: { select: { name: true, branchType: true } } },
    orderBy: { assignedAt: "asc" },
  });
  console.log("hrAssignments", hrs);

  const q = await prisma.quarter.findFirst({ where: { status: "ACTIVE" }, select: { id: true, name: true } });
  console.log("activeQuarter", q);

  if (q && hrs.length) {
    const branchIds = hrs.map((r) => r.branchId);
    const s3 = await prisma.branchShortlistStage3.count({ where: { quarterId: q.id, branchId: { in: branchIds } } });
    const hrEvals = await prisma.hrEvaluation.count({ where: { quarterId: q.id, hrUserId: user.id } });
    console.log("stage3CandidatesInAssignedBranches", s3);
    console.log("hrEvaluationsByUser", hrEvals);
  }

  await prisma.$disconnect();
})();
