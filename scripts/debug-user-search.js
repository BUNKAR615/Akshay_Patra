const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

(async () => {
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { name: { contains: "Chetan", mode: "insensitive" } },
        { name: { contains: "Bhatti", mode: "insensitive" } },
      ],
    },
    select: { id: true, name: true, empCode: true, role: true, departmentId: true, branchId: true },
    take: 50,
  });
  console.log(users);
  await prisma.$disconnect();
})();
