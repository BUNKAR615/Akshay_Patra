const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

(async () => {
  const hrUsers = await prisma.user.findMany({
    where: { role: "HR" },
    select: { id: true, name: true, empCode: true },
  });

  const suspicious = hrUsers.filter((u) => {
    const code = u.empCode || "";
    return code !== code.trim() || /\s/.test(code) || /[^0-9]/.test(code);
  });

  console.log("totalHR", hrUsers.length);
  console.log("suspiciousHR", suspicious);

  const bhatiLike = await prisma.user.findMany({
    where: { role: "HR", name: { contains: "BHATI", mode: "insensitive" } },
    select: { id: true, name: true, empCode: true },
  });
  console.log("bhatiLike", bhatiLike);

  await prisma.$disconnect();
})();
