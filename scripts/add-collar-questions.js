/**
 * add-collar-questions.js — purely ADDITIVE loader for the category-specific
 * (blue-collar / white-collar) questions defined in prisma/seed-data/questions.ts.
 *
 * Why a separate script instead of sync-question-bank.js?
 *   sync-question-bank.js DEACTIVATES any managed-level question that is not in
 *   the seed. This loader only ever upserts the collar-tagged questions and
 *   never deactivates anything — so it is safe to run against a live database
 *   even if an admin has added questions through the UI.
 *
 * It is idempotent (re-running makes no further changes) and matches on
 * (text, level). It does NOT touch the active quarter — a running quarter's
 * questions are already locked in QuarterQuestion / EmployeeQuarterQuestions.
 *
 * Run:  node scripts/add-collar-questions.js
 */
const path = require("path");
const fs = require("fs");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// The seed file is plain data in TS syntax — read the single QUESTIONS array
// literal and eval it (same approach as scripts/sync-question-bank.js).
function loadQuestionsFromSeed() {
    const src = fs.readFileSync(path.join(__dirname, "..", "prisma", "seed-data", "questions.ts"), "utf8");
    const arrStart = src.indexOf("[");
    const arrEnd = src.lastIndexOf("]");
    // eslint-disable-next-line no-eval
    return eval(src.slice(arrStart, arrEnd + 1));
}

async function main() {
    const all = loadQuestionsFromSeed();
    const collarQuestions = all.filter((q) => q.collarType === "BLUE_COLLAR" || q.collarType === "WHITE_COLLAR");
    console.log(`Seed defines ${collarQuestions.length} category-specific questions.`);

    let created = 0;
    let updated = 0;
    for (const q of collarQuestions) {
        const existing = await prisma.question.findFirst({ where: { text: q.text, level: q.level } });
        if (existing) {
            await prisma.question.update({
                where: { id: existing.id },
                data: { textHindi: q.textHindi || "", category: q.category, collarType: q.collarType, isActive: true },
            });
            updated++;
        } else {
            await prisma.question.create({
                data: { text: q.text, textHindi: q.textHindi || "", category: q.category, level: q.level, collarType: q.collarType, isActive: true },
            });
            created++;
        }
    }
    console.log(`Done. created=${created}, updated=${updated} (no questions deactivated).`);

    const grp = await prisma.question.groupBy({
        by: ["level", "collarType"],
        where: { level: { in: ["SELF", "BRANCH_MANAGER", "CLUSTER_MANAGER"] }, isActive: true },
        _count: true,
        orderBy: [{ level: "asc" }],
    });
    console.log("Active managed-level questions by level / collarType:");
    for (const r of grp) console.log(`  ${r.level.padEnd(16)} ${String(r.collarType).padEnd(14)} ${r._count}`);
}

main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(async () => { await prisma.$disconnect(); });
