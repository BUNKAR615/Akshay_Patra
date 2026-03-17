const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
    console.log("Fetching users...");
    const users = await prisma.user.findMany({ select: { email: true, role: true, password: true } });
    console.log(`Found ${users.length} users.`);

    // Print first 5
    for (let i = 0; i < Math.min(5, users.length); i++) {
        console.log(`User ${i + 1}: ${users[i].email} Role: ${users[i].role}`);
    }

    // Try verifying admin@akshayapatra.org
    const admin = users.find(u => u.email === "admin@akshayapatra.org");
    if (admin) {
        const match = await bcrypt.compare("Akshaya@2025", admin.password);
        console.log(`admin password match: ${match}`);
    } else {
        console.log("admin@akshayapatra.org NOT FOUND");
    }

    // Try verifying emp1.operations@akshayapatra.org
    const emp1 = users.find(u => u.email === "emp1.operations@akshayapatra.org");
    if (emp1) {
        const match2 = await bcrypt.compare("Akshaya@2025", emp1.password);
        console.log(`emp1 password match: ${match2}`);
    } else {
        console.log("emp1 NOT FOUND");
    }
}
main().catch(console.error).finally(() => prisma.$disconnect());
