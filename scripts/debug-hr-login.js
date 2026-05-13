const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

(async () => {
  const name = "Chetan Singh Bhatti";
  const users = await prisma.user.findMany({
    where: { name: { equals: name, mode: "insensitive" } },
    select: {
      id: true,
      name: true,
      empCode: true,
      role: true,
      departmentId: true,
      branchId: true,
      password: true,
      passwordHod: true,
    },
  });

  console.log(
    "users",
    users.map((u) => ({
      ...u,
      password: u.password ? "<set>" : null,
      passwordHod: u.passwordHod ? "<set>" : null,
    }))
  );

  for (const u of users) {
    const hrs = await prisma.hrBranchAssignment.findMany({
      where: { hrUserId: u.id },
      select: {
        branchId: true,
        branch: { select: { name: true, branchType: true } },
        assignedAt: true,
      },
    });
    console.log("hrAssignments for", u.id, hrs);
  }

  const q = await prisma.quarter.findFirst({
    where: { status: "ACTIVE" },
    select: { id: true, name: true },
  });
  console.log("activeQuarter", q);

  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
