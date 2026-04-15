/**
 * Sync the question bank to the seed file. Idempotent.
 *
 *   - Upserts every question from prisma/seed-data/questions.ts by (text, level).
 *   - Sets isActive=true on all rows in the seed.
 *   - Deactivates any DB row at level SELF/BRANCH_MANAGER/CLUSTER_MANAGER whose
 *     text is NOT present in the seed — unless that row is still referenced
 *     by EmployeeQuarterQuestions for an ACTIVE quarter (safety for in-flight
 *     evaluations).
 *   - Never touches rows at legacy levels (SUPERVISOR, HOD, HR) — they stay
 *     as-is so historical records keep rendering.
 *
 * Run:  node scripts/sync-question-bank.js
 */
const path = require("path");
const fs = require("fs");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// The seed file is written in TS syntax — for a simple shape like this we can
// parse it with eval after stripping the leading "export const ... =" line.
function loadQuestionsFromSeed() {
    const src = fs.readFileSync(path.join(__dirname, "..", "prisma", "seed-data", "questions.ts"), "utf8");
    const arrStart = src.indexOf("[");
    const arrEnd = src.lastIndexOf("]");
    const arrSrc = src.slice(arrStart, arrEnd + 1);
    // eslint-disable-next-line no-eval
    return eval(arrSrc);
}

async function main() {
    const seedQuestions = loadQuestionsFromSeed();
    console.log(`Seed contains ${seedQuestions.length} questions`);

    const MANAGED_LEVELS = ["SELF", "BRANCH_MANAGER", "CLUSTER_MANAGER"];

    // Upsert every seed question
    for (const q of seedQuestions) {
        const existing = await prisma.question.findFirst({
            where: { text: q.text, level: q.level },
        });
        if (existing) {
            await prisma.question.update({
                where: { id: existing.id },
                data: {
                    textHindi: q.textHindi || "",
                    category: q.category,
                    isActive: true,
                },
            });
        } else {
            await prisma.question.create({
                data: {
                    text: q.text,
                    textHindi: q.textHindi || "",
                    category: q.category,
                    level: q.level,
                    isActive: true,
                },
            });
        }
    }

    // Deactivate managed-level rows missing from the seed, unless in use
    const seedKeys = new Set(seedQuestions.map((q) => `${q.level}::${q.text}`));
    const managed = await prisma.question.findMany({
        where: { level: { in: MANAGED_LEVELS } },
        select: { id: true, text: true, level: true, isActive: true },
    });

    for (const row of managed) {
        const key = `${row.level}::${row.text}`;
        if (seedKeys.has(key)) continue; // present in seed — keep active
        // Not in seed — check if still referenced by an active quarter
        const inUse = await prisma.employeeQuarterQuestions.findFirst({
            where: {
                questionId: row.id,
                quarter: { status: "ACTIVE" },
            },
            select: { id: true },
        });
        if (inUse) {
            console.log(`Keeping stale question (active quarter ref): ${row.text.slice(0, 60)}...`);
            continue;
        }
        if (row.isActive) {
            await prisma.question.update({ where: { id: row.id }, data: { isActive: false } });
            console.log(`Deactivated stale question: ${row.text.slice(0, 60)}...`);
        }
    }

    const counts = await prisma.question.groupBy({
        by: ["level"],
        where: { isActive: true },
        _count: true,
    });
    console.log("Active question counts:", counts);
}

main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(async () => { await prisma.$disconnect(); });
