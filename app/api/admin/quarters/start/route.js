export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

import prisma from "../../../../../lib/prisma";
import { withRole } from "../../../../../lib/withRole";
import { created, fail, conflict, serverError, validateBody } from "../../../../../lib/api-response";
import { isTransientDbError } from "../../../../../lib/http";
import { startQuarterSchema } from "../../../../../lib/validators";
import { notifyAllEmployees, createNotification } from "../../../../../lib/notifications";
import { getDepartmentSize, logSmallDepartmentRule } from "../../../../../lib/department-rules";
import { assignQuestionsToEmployees } from "../../../../../lib/questionAssigner";
import { resetHodStateForQuarters } from "../../../../../lib/auth/quarterReset";

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

        // ── Defensive HOD reset: clear any stale HodAssignment /
        //    EmployeeHodAssignment / role-mapping rows left behind by
        //    previously-closed quarters. This catches data from any quarter
        //    that was closed BEFORE the quarterReset hook landed on the
        //    close route (e.g. Rishpal's Q02-2026 leftovers). Failure here
        //    is logged but doesn't block starting the new quarter.
        let priorHodReset = null;
        try {
            const closedQuarters = await prisma.quarter.findMany({
                where: { status: "CLOSED" },
                select: { id: true },
            });
            const closedIds = closedQuarters.map((q) => q.id);
            if (closedIds.length > 0) {
                priorHodReset = await resetHodStateForQuarters(closedIds);
            }
        } catch (resetErr) {
            console.error("[QUARTER-START] Defensive HOD reset failed:", resetErr);
        }

        // ── Check if question bank is EMPTY ──
        const totalQuestions = await prisma.question.count({ where: { isActive: true } });
        if (totalQuestions === 0) {
            return fail("Cannot start quarter. No questions in the question bank. Please add questions first.");
        }

        // ── Fetch active questions per level ──
        // Note: HOD evaluators reuse the BRANCH_MANAGER question bank, so there is no separate HOD level.
        const selfQuestions = await prisma.question.findMany({ where: { level: "SELF", isActive: true } });
        const bmQuestions = await prisma.question.findMany({ where: { level: "BRANCH_MANAGER", isActive: true } });
        const cmQuestions = await prisma.question.findMany({ where: { level: "CLUSTER_MANAGER", isActive: true } });

        const selfCount = data.questionCount; // strictly admin-set
        const bmCount = data.bmQuestionCount || 15;
        const cmCount = data.cmQuestionCount || 10;

        // Validate sufficient questions
        if (selfQuestions.length < selfCount) {
            return fail(`Not enough active SELF questions. Need ${selfCount}, found ${selfQuestions.length}. Add more questions.`);
        }
        if (bmQuestions.length < bmCount) {
            return fail(`Not enough active BRANCH_MANAGER questions. Need ${bmCount}, found ${bmQuestions.length}. Add more questions.`);
        }
        if (cmQuestions.length < cmCount) {
            return fail(`Not enough active CLUSTER_MANAGER questions. Need ${cmCount}, found ${cmQuestions.length}. Add more questions.`);
        }

        // ── Select random questions per level ──
        const selectedSelf = selectSelfQuestions(selfQuestions, selfCount);
        const selectedBm = selectSimple(bmQuestions, bmCount);
        const selectedCm = selectSimple(cmQuestions, cmCount);

        const allSelectedIds = [
            ...selectedSelf.map(q => q.id),
            ...selectedBm.map(q => q.id),
            ...selectedCm.map(q => q.id),
        ];

        const { quarter, assignmentStats } = await prisma.$transaction(async (tx) => {
            const q = await tx.quarter.create({
                data: { name: data.quarterName, status: "ACTIVE", startDate: start, endDate: end, questionCount: data.questionCount, bmQuestionCount: bmCount, hodQuestionCount: bmCount, cmQuestionCount: cmCount },
            });
            await tx.quarterQuestion.createMany({
                data: allSelectedIds.map((questionId) => ({ quarterId: q.id, questionId })),
            });

            // ── Assign per-employee randomized SELF question sets ──
            const stats = await assignQuestionsToEmployees(tx, q.id, selfQuestions, selfCount);

            return { quarter: q, assignmentStats: stats };
        }, { maxWait: 8000, timeout: 20000 });

        // ── Everything below runs AFTER the quarter is already committed. ──
        // None of it may fail the request: a throw here would return a 500
        // even though the quarter exists, trapping the admin in a
        // "quarter already exists" retry loop. Each step is best-effort and
        // failures are collected into `warnings` instead of crashing.
        const warnings = [];

        await prisma.auditLog.create({
            data: { userId: user.userId, action: "QUARTER_STARTED", details: { quarterId: quarter.id, name: quarter.name, questionCount: data.questionCount, totalLocked: allSelectedIds.length, selfCount: selectedSelf.length, bmCount: selectedBm.length, cmCount: selectedCm.length, priorHodReset } },
        }).catch((e) => { console.error("[QUARTER-START] Audit log failed:", e); });

        // Notify all employees
        try {
            await notifyAllEmployees(`New evaluation quarter started for ${data.quarterName}. Please complete your self-assessment.`);
        } catch (e) {
            console.error("[QUARTER-START] notifyAllEmployees failed:", e);
            warnings.push("Employee notifications could not be sent.");
        }

        // ── Auto-winner check for single-employee departments ──
        const autoWinners = [];
        try {
            const allDepartments = await prisma.department.findMany({ select: { id: true, name: true } });
            for (const dept of allDepartments) {
                // Guard per-department: a stale/deleted department (a throwing
                // getDepartmentSize) must not abort the loop or fail the request.
                try {
                    const deptLimits = await getDepartmentSize(dept.id);
                    if (!deptLimits.autoWinner) continue;

                    const singleEmployee = await prisma.user.findFirst({
                        where: { departmentId: dept.id, role: "EMPLOYEE" },
                        select: { id: true, name: true },
                    });
                    if (!singleEmployee) continue;

                    // Check if winner already exists for this specific department+quarter
                    const existingWinner = await prisma.bestEmployee.findFirst({
                        where: { quarterId: quarter.id, departmentId: dept.id },
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
                    }).catch(() => {});

                    await createNotification(
                        singleEmployee.id,
                        `🏆 You are automatically the Best Employee of ${data.quarterName} (only employee in ${dept.name}).`
                    ).catch(() => {});

                    logSmallDepartmentRule({
                        userId: user.userId, departmentId: dept.id, departmentName: dept.name,
                        caseNumber: 4, totalEmployees: 1, quarterId: quarter.id,
                        action: "SMALL_DEPT_AUTO_WINNER",
                    });
                } catch (deptErr) {
                    console.error(`[QUARTER-START] Auto-winner check failed for department ${dept.id}:`, deptErr);
                }
            }
        } catch (e) {
            console.error("[QUARTER-START] Auto-winner scan failed:", e);
            warnings.push("Single-employee auto-winner check could not complete.");
        }

        // Fetch the full quarter for the response — fall back to the already
        // committed `quarter` object if this read blips.
        let result = quarter;
        try {
            const full = await prisma.quarter.findUnique({
                where: { id: quarter.id },
                include: { quarterQuestions: { include: { question: { select: { id: true, text: true, textHindi: true, category: true, level: true } } } } },
            });
            if (full) result = full;
        } catch (e) {
            console.error("[QUARTER-START] Quarter re-fetch failed:", e);
        }

        // Warn on branches without BM assigned
        let warningMsg = "";
        try {
            const branchesWithoutBm = await prisma.branch.findMany({
                where: { scopedUsers: { none: { role: "BRANCH_MANAGER" } } },
                select: { name: true },
            });
            if (branchesWithoutBm.length > 0) {
                const names = branchesWithoutBm.map(b => b.name).join(", ");
                warningMsg = ` WARNING: ${branchesWithoutBm.length} branch(es) have no assigned Branch Manager (${names}). Stage 2 evaluations in those branches cannot proceed!`;
            }
        } catch (e) {
            console.error("[QUARTER-START] branchesWithoutBm check failed:", e);
        }

        const responseData = {
            message: `Quarter "${data.quarterName}" started with ${allSelectedIds.length} questions locked (${selectedSelf.length} SELF, ${selectedBm.length} BM, ${selectedCm.length} CM). ${assignmentStats.totalEmployees} employees assigned unique question sets.${warningMsg}`,
            quarter: result,
            assignmentStats,
            warnings,
        };
        if (autoWinners.length > 0) {
            responseData.autoWinners = autoWinners;
            responseData.message += ` ${autoWinners.length} auto-winner(s) declared for single-employee departments.`;
        }

        return created(responseData);
    } catch (err) {
        // Log to stdout/stderr so Vercel's runtime captures the stack — DO
        // NOT write to a hard-coded Windows path here. The previous
        // `fs.writeFileSync("c:/Users/Dinesh/...")` call worked only on the
        // dev machine and threw an EPERM on Vercel's Linux runtime,
        // masking the real error.
        console.error("Start quarter error:", err?.stack || err);
        // Transient DB connection blips (cold start / pool wake-up) surface
        // as a retryable 503 rather than a dead 500.
        if (isTransientDbError(err)) {
            return fail("Service is starting up. Please try again in a moment.", 503);
        }
        return serverError();
    }
});
