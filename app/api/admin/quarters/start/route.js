export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../../lib/prisma";
import { withRole } from "../../../../../lib/withRole";
import { created, fail, conflict, serverError, validateBody } from "../../../../../lib/api-response";
import { startQuarterSchema } from "../../../../../lib/validators";
import { notifyAllEmployees, createNotification } from "../../../../../lib/notifications";
import { getDepartmentSize, logSmallDepartmentRule } from "../../../../../lib/department-rules";
import { assignQuestionsToEmployees } from "../../../../../lib/questionAssigner";

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
        const { data, error } = await validateBody(request, startQuarterSchema);
        if (error) return error;

        const start = new Date(data.dateRange.startDate);
        const end = new Date(data.dateRange.endDate);
        
        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            return fail("Invalid date format. Use ISO format (YYYY-MM-DD)");
        }
        if (end <= start) return fail("endDate must be after startDate");

        // Guard: only one ACTIVE quarter allowed
        const activeQuarter = await prisma.quarter.findFirst({ where: { status: "ACTIVE" } });
        if (activeQuarter) {
            return conflict(`An active quarter "${activeQuarter.name}" already exists. Close it first.`);
        }

        // Guard: duplicate name
        const existing = await prisma.quarter.findUnique({ where: { name: data.quarterName } });
        if (existing) return conflict(`Quarter "${data.quarterName}" already exists`);

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

        const selfCount = data.questionCount; // strictly admin-set
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

        const { quarter, assignmentStats } = await prisma.$transaction(async (tx) => {
            const q = await tx.quarter.create({
                data: { name: data.quarterName, status: "ACTIVE", startDate: start, endDate: end, questionCount: data.questionCount },
            });
            await tx.quarterQuestion.createMany({
                data: allSelectedIds.map((questionId) => ({ quarterId: q.id, questionId })),
            });

            // ── Assign per-employee randomized SELF question sets ──
            const stats = await assignQuestionsToEmployees(tx, q.id, selfQuestions, selfCount);

            return { quarter: q, assignmentStats: stats };
        });

        console.log("Saved to DB (Quarter):", quarter);

        await prisma.auditLog.create({
            data: { userId: user.userId, action: "QUARTER_STARTED", details: { quarterId: quarter.id, name: quarter.name, questionCount: data.questionCount, totalLocked: allSelectedIds.length, selfCount: selectedSelf.length, supCount: selectedSup.length, bmCount: selectedBm.length, cmCount: selectedCm.length } },
        });

        // Notify all employees
        await notifyAllEmployees(`New evaluation quarter started for ${data.quarterName}. Please complete your self-assessment.`);

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
                    // Check if winner already exists for this specific department+quarter
                    const existingWinner = await prisma.bestEmployee.findFirst({
                        where: { quarterId: quarter.id, departmentId: dept.id }
                    });
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
                        `🏆 You are automatically the Best Employee of ${data.quarterName} (only employee in ${dept.name}).`
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
            message: `Quarter "${data.quarterName}" started with ${allSelectedIds.length} questions locked (${selectedSelf.length} SELF, ${selectedSup.length} SUP, ${selectedBm.length} BM, ${selectedCm.length} CM). ${assignmentStats.totalEmployees} employees assigned unique question sets.${warningMsg}`,
            quarter: result,
            assignmentStats,
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
