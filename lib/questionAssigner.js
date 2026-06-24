/**
 * questionAssigner.js
 *
 * Assigns a unique, randomized set of SELF-level questions to each employee
 * for a given quarter. Uses a plain Fisher-Yates shuffle (the old
 * category-balanced selection was removed with the category restriction).
 *
 * Each employee's pool is filtered to the questions applicable to their
 * employee category (collar): shared questions (collarType = null) plus any
 * tagged for that employee's collar. Blue-collar staff never receive
 * white-collar-only questions and vice-versa.
 *
 * Called inside the quarter-start transaction.
 */

import { effectiveCollar, filterQuestionsByCollar } from "./questionCollar";

// ── Fisher-Yates (Knuth) shuffle ──
function fisherYatesShuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

/**
 * Select `count` questions at random from `questions`. The previous
 * category-balanced selection (≥2 per category) was removed together with the
 * question-category restriction feature, so this is now a plain Fisher-Yates
 * pick — every question is equally eligible. The shuffle also determines the
 * per-employee display order.
 */
function selectBalancedQuestions(questions, count) {
    return fisherYatesShuffle(questions).slice(0, Math.min(count, questions.length));
}

/**
 * Generate a fingerprint (sorted comma-joined IDs) for a question set
 * to check uniqueness across employees.
 */
function setFingerprint(questions) {
    return questions.map(q => q.id).sort().join(',');
}

/**
 * Assign unique, randomized question sets to all employees for a quarter.
 *
 * @param {PrismaClient} tx   — Prisma transaction client
 * @param {string} quarterId  — The quarter ID
 * @param {Array}  selfQuestions — All active SELF-level questions (full pool, incl. collarType)
 * @param {number} questionCount — How many questions each employee gets
 * @returns {object} — { totalEmployees, totalAssigned, duplicateSets }
 */
async function assignQuestionsToEmployees(tx, quarterId, selfQuestions, questionCount) {
    // Fetch all employees. Collar is stored per-employee (departments are no
    // longer collar-tagged); effectiveCollar falls back to BLUE_COLLAR.
    const employees = await tx.user.findMany({
        where: { role: "EMPLOYEE" },
        select: { id: true, collarType: true },
    });

    const usedFingerprints = new Set();
    let duplicateSets = 0;
    const MAX_RETRIES = 5; // max attempts to get a unique set

    // Build all assignment rows in memory, then bulk insert
    const allRows = [];

    for (const emp of employees) {
        let selectedQuestions = null;
        let fingerprint = null;

        // Restrict this employee's pool to the questions applicable to their
        // collar (shared + own-collar). Guard against a mis-tagged bank that
        // would leave an employee with nothing by falling back to the full pool.
        const empCollar = effectiveCollar(emp.collarType);
        const applicablePool = filterQuestionsByCollar(selfQuestions, empCollar);
        const pool = applicablePool.length > 0 ? applicablePool : selfQuestions;

        // Attempt to generate a unique question set
        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            const candidate = selectBalancedQuestions(pool, questionCount);
            const fp = setFingerprint(candidate);

            if (!usedFingerprints.has(fp) || attempt === MAX_RETRIES - 1) {
                selectedQuestions = candidate;
                fingerprint = fp;
                if (usedFingerprints.has(fp)) duplicateSets++;
                usedFingerprints.add(fp);
                break;
            }
        }

        // Create assignment rows with orderIndex for display ordering
        for (let i = 0; i < selectedQuestions.length; i++) {
            allRows.push({
                employeeId: emp.id,
                quarterId: quarterId,
                questionId: selectedQuestions[i].id,
                orderIndex: i,
            });
        }
    }

    // Bulk insert all assignments
    if (allRows.length > 0) {
        await tx.employeeQuarterQuestions.createMany({ data: allRows });
    }

    return {
        totalEmployees: employees.length,
        totalAssigned: allRows.length,
        questionsPerEmployee: questionCount,
        duplicateSets,
    };
}

export {
    fisherYatesShuffle,
    selectBalancedQuestions,
    assignQuestionsToEmployees,
};
