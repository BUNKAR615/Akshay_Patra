import prisma from "../../../../../lib/prisma";
import { withRole } from "../../../../../lib/withRole";
import { created, fail, conflict, serverError, validateBody } from "../../../../../lib/api-response";
import { startQuarterSchema } from "../../../../../lib/validators";
import { notifyAllEmployees, createNotification } from "../../../../../lib/notifications";
import { getDepartmentSize, logSmallDepartmentRule } from "../../../../../lib/department-rules";

// ── Fisher-Yates (Knuth) shuffle — true O(n) randomness ──
function fisherYatesShuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

/**
 * Select SELF-level questions with category-balance constraints.
 * Guarantees ≥2 from each category, then fills remaining randomly.
 */
function selectSelfQuestions(questions, count) {
    // Group by category
    const byCategory = {};
    for (const q of questions) {
        if (!byCategory[q.category]) byCategory[q.category] = [];
        byCategory[q.category].push(q);
    }

    const categories = Object.keys(byCategory);
    const minPerCategory = 2;
    const minRequired = categories.length * minPerCategory;

    if (count < minRequired) {
        // If requested count is less than min required, just take 1 from each + fill
        const selected = [];
        for (const cat of categories) {
            const shuffled = fisherYatesShuffle(byCategory[cat]);
            selected.push(shuffled[0]);
        }
        // Fill remaining randomly from unused
        const usedIds = new Set(selected.map(q => q.id));
        const remaining = fisherYatesShuffle(questions.filter(q => !usedIds.has(q.id)));
        const needed = Math.min(count - selected.length, remaining.length);
        selected.push(...remaining.slice(0, needed));
        return fisherYatesShuffle(selected);
    }

    // Pick minPerCategory from each
    const selected = [];
    const usedIds = new Set();
    for (const cat of categories) {
        const shuffled = fisherYatesShuffle(byCategory[cat]);
        const picks = shuffled.slice(0, minPerCategory);
        selected.push(...picks);
        picks.forEach(q => usedIds.add(q.id));
    }

    // Fill remaining slots randomly from unused questions
    const remaining = fisherYatesShuffle(questions.filter(q => !usedIds.has(q.id)));
    const slotsLeft = count - selected.length;
    selected.push(...remaining.slice(0, slotsLeft));

    return fisherYatesShuffle(selected);
}

/**
 * Select SUPERVISOR questions: ≥2 from PERFORMANCE, rest from BEHAVIOR/RELIABILITY.
 */
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

/**
 * Simple random selection for BM / CM levels.
 */
function selectSimple(questions, count) {
    return fisherYatesShuffle(questions).slice(0, Math.min(count, questions.length));
}

/**
 * POST /api/admin/quarters/start
 */
export const POST = withRole(["ADMIN"], async (request, { user }) => {
    try {
        // Parse body — allow empty body for auto-defaults
        let data = {};
        try {
            const body = await request.json();
            data = body || {};
        } catch {
            // empty body is fine — we'll use defaults
        }

        // Auto-generate quarter name if not provided
        if (!data.name) {
            const now = new Date();
            const month = now.getMonth(); // 0-11
            const year = now.getFullYear();
            const qNum = month < 3 ? 4 : month < 6 ? 1 : month < 9 ? 2 : 3;
            // Financial year: Q4 belongs to previous year start
            const fyYear = qNum >= 1 && qNum <= 3 ? year : year - 1;
            data.name = `Q${qNum}-${fyYear}`;
        }

        // Default dates
        const start = data.startDate ? new Date(data.startDate) : new Date();
        const end = data.endDate ? new Date(data.endDate) : new Date(Date.now() + 90 * 24 * 60 * 60 * 1000); // 90 days
        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            return fail("Invalid date format. Use ISO format (YYYY-MM-DD)");
        }
        if (end <= start) return fail("endDate must be after startDate");

        // Default question count
        data.questionCount = data.questionCount || 15;

        // Guard: only one ACTIVE quarter allowed
        const activeQuarter = await prisma.quarter.findFirst({ where: { status: "ACTIVE" } });
        if (activeQuarter) {
            return conflict(`An active quarter "${activeQuarter.name}" already exists. Close it first.`);
        }

        // Guard: duplicate name
        const existing = await prisma.quarter.findUnique({ where: { name: data.name } });
        if (existing) return conflict(`Quarter "${data.name}" already exists`);

        // ── Check if question bank is EMPTY ──
        const totalQuestions = await prisma.question.count({ where: { isActive: true } });
        if (totalQuestions === 0) {
            return fail("Cannot start quarter. No questions in the question bank. Please add questions first.");
        }

        // ── Fetch active questions per level ──
        const selfQuestions = await prisma.question.findMany({ where: { level: "SELF", isActive: true } });
        const supQuestions = await prisma.question.findMany({ where: { level: "SUPERVISOR", isActive: true } });
        const bmQuestions = await prisma.question.findMany({ where: { level: "BRANCH_MANAGER", isActive: true } });
        const cmQuestions = await prisma.question.findMany({ where: { level: "CLUSTER_MANAGER", isActive: true } });

        const selfCount = data.questionCount || 15; // admin-set, default 15
        const supCount = 5;
        const bmCount = 4;
        const cmCount = 3;

        // Validate sufficient questions
        if (selfQuestions.length < selfCount) {
            return fail(`Not enough active SELF questions. Need ${selfCount}, found ${selfQuestions.length}. Add more questions.`);
        }
        if (supQuestions.length < supCount) {
            return fail(`Not enough active SUPERVISOR questions. Need ${supCount}, found ${supQuestions.length}. Add more questions.`);
        }
        if (bmQuestions.length < bmCount) {
            return fail(`Not enough active BRANCH_MANAGER questions. Need ${bmCount}, found ${bmQuestions.length}. Add more questions.`);
        }
        if (cmQuestions.length < cmCount) {
            return fail(`Not enough active CLUSTER_MANAGER questions. Need ${cmCount}, found ${cmQuestions.length}. Add more questions.`);
        }

        // ── Select random questions per level ──
        const selectedSelf = selectSelfQuestions(selfQuestions, selfCount);
        const selectedSup = selectSupervisorQuestions(supQuestions, supCount);
        const selectedBm = selectSimple(bmQuestions, bmCount);
        const selectedCm = selectSimple(cmQuestions, cmCount);

        const allSelectedIds = [
            ...selectedSelf.map(q => q.id),
            ...selectedSup.map(q => q.id),
            ...selectedBm.map(q => q.id),
            ...selectedCm.map(q => q.id),
        ];

        const quarter = await prisma.$transaction(async (tx) => {
            const q = await tx.quarter.create({
                data: { name: data.name, status: "ACTIVE", startDate: start, endDate: end, questionCount: data.questionCount || 15 },
            });
            await tx.quarterQuestion.createMany({
                data: allSelectedIds.map((questionId) => ({ quarterId: q.id, questionId })),
            });
            return q;
        });

        console.log("Saved to DB (Quarter):", quarter);

        await prisma.auditLog.create({
            data: { userId: user.userId, action: "QUARTER_STARTED", details: { quarterId: quarter.id, name: quarter.name, questionCount: data.questionCount, totalLocked: allSelectedIds.length, selfCount: selectedSelf.length, supCount: selectedSup.length, bmCount: selectedBm.length, cmCount: selectedCm.length } },
        });

        // Notify all employees
        await notifyAllEmployees(`${data.name} evaluation is now open. Please complete your self-assessment.`);

        // ── Auto-winner check for single-employee departments ──
        const allDepartments = await prisma.department.findMany({ select: { id: true, name: true } });
        const autoWinners = [];

        for (const dept of allDepartments) {
            const deptLimits = await getDepartmentSize(dept.id);
            if (deptLimits.autoWinner) {
                const singleEmployee = await prisma.user.findFirst({
                    where: { departmentId: dept.id, role: "EMPLOYEE" },
                    select: { id: true, name: true, email: true },
                });

                if (singleEmployee) {
                    const existingWinner = await prisma.bestEmployee.findUnique({ where: { quarterId: quarter.id } });
                    if (!existingWinner) {
                        await prisma.bestEmployee.create({
                            data: {
                                userId: singleEmployee.id, quarterId: quarter.id, departmentId: dept.id,
                                selfScore: 0, supervisorScore: 0, bmScore: 0, cmScore: 0, finalScore: 0,
                            },
                        });
                    }

                    autoWinners.push({ userId: singleEmployee.id, name: singleEmployee.name, departmentName: dept.name });

                    await prisma.auditLog.create({
                        data: {
                            userId: user.userId,
                            action: "AUTO_WINNER_SINGLE_EMPLOYEE",
                            details: {
                                quarterId: quarter.id, employeeId: singleEmployee.id, employeeName: singleEmployee.name,
                                departmentId: dept.id, departmentName: dept.name,
                                message: `Auto-winner due to single employee in department "${dept.name}"`,
                            },
                        },
                    });

                    await createNotification(
                        singleEmployee.id,
                        `🏆 You are automatically the Best Employee of ${data.name} (only employee in ${dept.name}).`
                    );

                    logSmallDepartmentRule({
                        userId: user.userId, departmentId: dept.id, departmentName: dept.name,
                        caseNumber: 4, totalEmployees: 1, quarterId: quarter.id,
                        action: "SMALL_DEPT_AUTO_WINNER",
                    });
                }
            }
        }

        const result = await prisma.quarter.findUnique({
            where: { id: quarter.id },
            include: { quarterQuestions: { include: { question: { select: { id: true, text: true, textHindi: true, category: true, level: true } } } } },
        });

        const deptsWithoutSupervisor = await prisma.department.findMany({
            where: { departmentRoles: { none: { role: "SUPERVISOR" } } },
            select: { name: true },
        });

        let warningMsg = "";
        if (deptsWithoutSupervisor.length > 0) {
            const names = deptsWithoutSupervisor.map(d => d.name).join(", ");
            warningMsg = ` WARNING: ${deptsWithoutSupervisor.length} department(s) have no assigned supervisor (${names}). Employees there cannot submit assessments!`;
        }

        const responseData = {
            message: `Quarter "${data.name}" started with ${allSelectedIds.length} questions locked (${selectedSelf.length} SELF, ${selectedSup.length} SUP, ${selectedBm.length} BM, ${selectedCm.length} CM).${warningMsg}`,
            quarter: result,
        };
        if (autoWinners.length > 0) {
            responseData.autoWinners = autoWinners;
            responseData.message += ` ${autoWinners.length} auto-winner(s) declared for single-employee departments.`;
        }

        return created(responseData);
    } catch (err) {
        console.error("Start quarter error:", err);
        require("fs").writeFileSync("c:/Users/Dinesh/Desktop/Akshaya_Patra/err.txt", String(err.stack || err));
        return serverError();
    }
});
