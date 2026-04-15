/**
 * Set every EMPLOYEE-role user's password to bcrypt(empCode).
 * Idempotent — re-running just re-hashes.
 *
 * Run:  node scripts/backfill-employee-passwords.js
 */
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const prisma = new PrismaClient();

async function main() {
    const employees = await prisma.user.findMany({
        where: { role: "EMPLOYEE", empCode: { not: null } },
        select: { id: true, empCode: true },
    });

    console.log(`Updating ${employees.length} employee passwords to empCode...`);

    for (const e of employees) {
        const hash = await bcrypt.hash(e.empCode, 10);
        await prisma.user.update({ where: { id: e.id }, data: { password: hash } });
    }

    console.log("Done.");
}

main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(async () => { await prisma.$disconnect(); });
