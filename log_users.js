const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const users = await prisma.user.findMany({ select: { email: true, role: true } });
    const fs = require('fs');
    fs.writeFileSync('all_emails.txt', users.map(u => u.email).join('\n'));
    console.log("Wrote " + users.length + " emails to all_emails.txt");
}
main().catch(console.error).finally(() => prisma.$disconnect());
