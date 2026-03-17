const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function testStartQuarter() {
    try {
        // Mock data matching the start quarter route
        const data = {
            name: "QTest-2025",
            startDate: "2025-01-01",
            endDate: "2025-03-31",
            questionCount: 15
        };
        const start = new Date(data.startDate);
        const end = new Date(data.endDate);

        // -- The exact logic from route.js --
        // Guard: only one ACTIVE quarter allowed
        const activeQuarter = await prisma.quarter.findFirst({ where: { status: "ACTIVE" } });
        if (activeQuarter) {
            console.log("Conflict: Active quarter exists");
            return;
        }

        // Fetch questions
        const selfQuestions = await prisma.question.findMany({ where: { level: "SELF", isActive: true } });
        const supQuestions = await prisma.question.findMany({ where: { level: "SUPERVISOR", isActive: true } });
        const bmQuestions = await prisma.question.findMany({ where: { level: "BRANCH_MANAGER", isActive: true } });
        const cmQuestions = await prisma.question.findMany({ where: { level: "CLUSTER_MANAGER", isActive: true } });

        console.log("Self:", selfQuestions.length, "Sup:", supQuestions.length, "BM:", bmQuestions.length, "CM:", cmQuestions.length);

        if (selfQuestions.length < 15) throw new Error("Not enough self questions - " + selfQuestions.length);
        if (supQuestions.length < 5) throw new Error("Not enough sup questions");
        if (bmQuestions.length < 4) throw new Error("Not enough bm questions");
        if (cmQuestions.length < 3) throw new Error("Not enough cm questions");

        function fisherYatesShuffle(arr) {
            const a = [...arr];
            for (let i = a.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [a[i], a[j]] = [a[j], a[i]];
            }
            return a;
        }

        function selectSelfQuestions(questions, count) {
            const byCategory = {};
            for (const q of questions) {
                if (!byCategory[q.category]) byCategory[q.category] = [];
                byCategory[q.category].push(q);
            }
            const categories = Object.keys(byCategory);
            const minPerCategory = 2;
            const minRequired = categories.length * minPerCategory;
            if (count < minRequired) { return []; }
            const selected = [];
            const usedIds = new Set();
            for (const cat of categories) {
                const shuffled = fisherYatesShuffle(byCategory[cat]);
                const picks = shuffled.slice(0, minPerCategory);
                selected.push(...picks);
                picks.forEach(q => usedIds.add(q.id));
            }
            const remaining = fisherYatesShuffle(questions.filter(q => !usedIds.has(q.id)));
            const slotsLeft = count - selected.length;
            selected.push(...remaining.slice(0, slotsLeft));
            return fisherYatesShuffle(selected);
        }

        function selectSupervisorQuestions(questions, count) {
            const performance = questions.filter(q => q.category === "PERFORMANCE");
            const others = questions.filter(q => q.category !== "PERFORMANCE");
            const perfPicks = fisherYatesShuffle(performance).slice(0, Math.min(2, performance.length));
            const usedIds = new Set(perfPicks.map(q => q.id));
            const otherPool = fisherYatesShuffle(others.filter(q => !usedIds.has(q.id)));
            const remaining = count - perfPicks.length;
            const otherPicks = otherPool.slice(0, remaining);
            return fisherYatesShuffle([...perfPicks, ...otherPicks]);
        }

        console.log("Selected self:", selectSelfQuestions(selfQuestions, 15).length);
        console.log("Selected sup:", selectSupervisorQuestions(supQuestions, 5).length);

        console.log("SUCCESS! No errors in question mapping.");

    } catch (err) {
        console.error("FAIL:", err);
    }
}

testStartQuarter().finally(() => prisma.$disconnect());
