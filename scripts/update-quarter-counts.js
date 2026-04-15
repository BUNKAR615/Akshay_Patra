/**
 * Update all existing Quarters to use the new bmQuestionCount=15 and
 * cmQuestionCount=10. Self question count is left untouched.
 *
 * Run:  node scripts/update-quarter-counts.js
 */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
    const result = await prisma.quarter.updateMany({
        data: { bmQuestionCount: 15, cmQuestionCount: 10, hodQuestionCount: 15 },
    });
    console.log(`Updated ${result.count} quarters`);
}

main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(async () => { await prisma.$disconnect(); });
