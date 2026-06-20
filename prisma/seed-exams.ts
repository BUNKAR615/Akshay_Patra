/**
 * Additive, idempotent seed for the Online Exam module.
 *
 * Unlike prisma/seed.ts this does NOT truncate anything — it only (re)creates a
 * known set of seed exams (deleting any prior copies by title first) and wires
 * them to REAL seeded employees so the list, analytics, and leaderboard render
 * with live data. Safe to re-run.
 *
 *   npm run seed:exams
 */
import { PrismaClient, ExamQuestionType } from "@prisma/client";

const prisma = new PrismaClient();

const SEED_TITLES = [
    "Food Safety & Hygiene Certification",
    "Branch Manager Leadership Assessment",
    "Kitchen Operations Standards",
    "New Joiner Orientation Quiz",
    "Regional Manager Strategy Review",
    "Q2 Compliance Refresher",
];

const rand = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));
const sample = <T,>(arr: T[], n: number) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a.slice(0, Math.min(n, a.length));
};

function fillerQuestions(n: number) {
    return Array.from({ length: n }).map((_, i) => ({
        order: i,
        type: "SINGLE" as ExamQuestionType,
        text: `Standards check question ${i + 1}`,
        required: true,
        points: 0,
        choices: {
            create: [
                { order: 0, label: "Option A", isCorrect: i % 2 === 0 },
                { order: 1, label: "Option B", isCorrect: i % 2 === 1 },
                { order: 2, label: "Option C", isCorrect: false },
            ],
        },
    }));
}

async function createSimpleExam(opts: {
    title: string; description?: string; status: "DRAFT" | "SCHEDULED" | "ACTIVE" | "COMPLETED";
    qCount: number; createdById: string; audience?: { mode: any; recipients?: number } | null;
}) {
    return prisma.exam.create({
        data: {
            title: opts.title,
            description: opts.description || null,
            status: opts.status,
            timeLimitMin: 30,
            passMark: 70,
            createdById: opts.createdById,
            questions: { create: fillerQuestions(opts.qCount) },
            ...(opts.audience ? { audience: { create: { mode: opts.audience.mode, recipients: opts.audience.recipients ?? 0 } } } : {}),
        },
        include: { questions: { include: { choices: true } } },
    });
}

async function inviteAndRespond(examId: string, employeeIds: string[], completeCount: number, startedExtra: number) {
    if (employeeIds.length === 0) return;
    await prisma.examInvite.createMany({ data: employeeIds.map((employeeId) => ({ examId, employeeId })), skipDuplicates: true });

    const completers = employeeIds.slice(0, Math.min(completeCount, employeeIds.length));
    for (const employeeId of completers) {
        await prisma.examResponse.create({
            data: {
                examId, employeeId,
                startedAt: new Date(Date.now() - rand(20, 60) * 60000),
                submittedAt: new Date(Date.now() - rand(1, 19) * 60000),
                marks: rand(30, 99),
                timeTakenSec: rand(12, 34) * 60,
            },
        });
    }
    // Some "started but not submitted".
    const started = employeeIds.slice(completers.length, completers.length + startedExtra);
    for (const employeeId of started) {
        await prisma.examResponse.create({ data: { examId, employeeId, startedAt: new Date() } });
        await prisma.examInvite.updateMany({ where: { examId, employeeId }, data: { status: "STARTED" } });
    }
    await prisma.examInvite.updateMany({ where: { examId, employeeId: { in: completers } }, data: { status: "COMPLETED" } });
}

async function main() {
    console.log("Seeding Online Exam module…");

    const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
    if (!admin) { console.log("  ✗ No ADMIN user found. Run the main seed first (npm run seed)."); return; }
    const createdById = admin.id;

    const employees = await prisma.user.findMany({ where: { role: "EMPLOYEE" }, select: { id: true } });
    const empIds = employees.map((e) => e.id);
    const bms = await prisma.user.findMany({ where: { role: "BRANCH_MANAGER" }, select: { id: true } });

    // Idempotent: drop any prior seed exams (cascades to questions/invites/responses).
    const deleted = await prisma.exam.deleteMany({ where: { title: { in: SEED_TITLES } } });
    if (deleted.count) console.log(`  · removed ${deleted.count} previously-seeded exams`);

    // ── 1) Food Safety & Hygiene — Active, ALL, full question set + analytics ──
    const food = await prisma.exam.create({
        data: {
            title: SEED_TITLES[0],
            description: "Mandatory hygiene & HACCP certification for all kitchen and serving staff.",
            status: "ACTIVE", timeLimitMin: 45, passMark: 70, createdById,
            shuffle: true, requireCompletion: true,
            audience: { create: { mode: "ALL", recipients: empIds.length } },
            questions: {
                create: [
                    { order: 0, type: "SINGLE", text: "For how long should you wash your hands before handling food?", hint: "Select one option.", required: true, points: 50, choices: { create: [
                        { order: 0, label: "At least 5 seconds", isCorrect: false },
                        { order: 1, label: "At least 20 seconds", isCorrect: true },
                        { order: 2, label: "At least 60 seconds", isCorrect: false },
                        { order: 3, label: "No fixed duration", isCorrect: false },
                    ] } },
                    { order: 1, type: "MULTIPLE", text: "Which of the following require cold-chain storage?", hint: "Select all that apply.", required: true, points: 50, choices: { create: [
                        { order: 0, label: "Cooked dal", isCorrect: true },
                        { order: 1, label: "Fresh dairy", isCorrect: true },
                        { order: 2, label: "Dry rice", isCorrect: false },
                        { order: 3, label: "Prepared curd", isCorrect: true },
                    ] } },
                    { order: 2, type: "RATING", text: "Rate your confidence in following HACCP procedures.", hint: "1 = not confident, 5 = very confident.", required: false, points: 0 },
                    { order: 3, type: "SHORT", text: "State the safe minimum internal temperature for cooked poultry.", hint: "One short answer.", required: true, points: 0 },
                    { order: 4, type: "LONG", text: "Describe the correct steps for an end-of-day kitchen deep-clean.", hint: "A few sentences.", required: false, points: 0 },
                ],
            },
        },
        include: { questions: { include: { choices: true } } },
    });

    // Invite up to 200 employees; 142 complete, 30 started.
    const invited = sample(empIds, Math.min(200, empIds.length));
    const completeN = Math.min(142, invited.length);
    await inviteAndRespond(food.id, invited, completeN, Math.min(30, Math.max(0, invited.length - completeN)));

    // Populate the Q1 answer distribution (~58% pick the correct option).
    const q1 = food.questions.find((q) => q.order === 0)!;
    const correct = q1.choices.find((c) => c.isCorrect)!;
    const others = q1.choices.filter((c) => !c.isCorrect);
    const completedResponses = await prisma.examResponse.findMany({ where: { examId: food.id, submittedAt: { not: null } }, select: { id: true } });
    for (const r of completedResponses) {
        const pickCorrect = Math.random() < 0.58;
        const choice = pickCorrect ? correct : others[rand(0, others.length - 1)];
        await prisma.examAnswer.create({ data: { responseId: r.id, questionId: q1.id, choiceIds: [choice.id] } });
    }
    console.log(`  ✓ ${SEED_TITLES[0]} (invited ${invited.length}, completed ${completeN})`);

    // ── 2) Branch Manager Leadership — Active, BM audience ──
    const bmExam = await createSimpleExam({ title: SEED_TITLES[1], description: "Leadership & people-management assessment for branch managers.", status: "ACTIVE", qCount: 6, createdById, audience: { mode: "BM", recipients: bms.length } });
    if (bms.length) await inviteAndRespond(bmExam.id, bms.map((b) => b.id), Math.ceil(bms.length * 0.65), 0);
    console.log(`  ✓ ${SEED_TITLES[1]} (${bms.length} BMs)`);

    // ── 3) Kitchen Operations — Completed, branch ──
    const kitchen = await createSimpleExam({ title: SEED_TITLES[2], description: "Operational standards for kitchen teams.", status: "COMPLETED", qCount: 5, createdById, audience: { mode: "BRANCH" } });
    const kInvited = sample(empIds, Math.min(40, empIds.length));
    await inviteAndRespond(kitchen.id, kInvited, kInvited.length, 0); // 100% completed
    console.log(`  ✓ ${SEED_TITLES[2]} (completed ${kInvited.length}/${kInvited.length})`);

    // ── 4) New Joiner Orientation — Active, RANDOM ──
    const nj = await createSimpleExam({ title: SEED_TITLES[3], description: "Orientation quiz for new joiners.", status: "ACTIVE", qCount: 5, createdById, audience: { mode: "RANDOM" } });
    const njInvited = sample(empIds, Math.min(60, empIds.length));
    await inviteAndRespond(nj.id, njInvited, Math.min(22, njInvited.length), 8);
    console.log(`  ✓ ${SEED_TITLES[3]} (invited ${njInvited.length})`);

    // ── 5) Regional Manager Strategy — Scheduled, RM (no invites yet) ──
    await createSimpleExam({ title: SEED_TITLES[4], description: "Strategy review for regional managers.", status: "SCHEDULED", qCount: 5, createdById, audience: { mode: "RM" } });
    console.log(`  ✓ ${SEED_TITLES[4]} (scheduled)`);

    // ── 6) Q2 Compliance Refresher — Draft (no audience) ──
    await createSimpleExam({ title: SEED_TITLES[5], description: "Quarterly compliance refresher.", status: "DRAFT", qCount: 4, createdById, audience: null });
    console.log(`  ✓ ${SEED_TITLES[5]} (draft)`);

    console.log("Done. 6 exams seeded.");
}

main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(async () => { await prisma.$disconnect(); });
