const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
    const users = await prisma.user.findMany({ select: { email: true, password: true } });
    const emp1 = users.find(u => u.email === "emp1.kitchen@akshayapatra.org");
    if (emp1) {
        const match = await bcrypt.compare("Akshaya@2025", emp1.password);
        console.log(`emp1 password match: ${match}`);
    } else {
        console.log("emp1 NOT FOUND");
    }
}
main().catch(console.error).finally(() => prisma.$disconnect());
