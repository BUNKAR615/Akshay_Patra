/**
 * Backfill User.branchId from the user's department.branchId.
 *
 * Run:  node scripts/backfill-user-branchid.js
 */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
    const users = await prisma.user.findMany({
        where: { branchId: null, departmentId: { not: null } },
        select: { id: true, departmentId: true, department: { select: { branchId: true } } },
    });

    console.log(`Found ${users.length} users without branchId`);

    let updated = 0;
    for (const u of users) {
        const branchId = u.department?.branchId;
        if (!branchId) continue;
        await prisma.user.update({ where: { id: u.id }, data: { branchId } });
        updated++;
    }

    console.log(`Updated ${updated} users with branchId`);
}

main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(async () => { await prisma.$disconnect(); });
