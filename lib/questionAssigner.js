/**
 * questionAssigner.js
 *
 * Assigns a unique, randomized set of SELF-level questions to each employee
 * for a given quarter. Uses Fisher-Yates shuffle with category-balanced selection.
 *
 * Called inside the quarter-start transaction.
 */

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
 * Select `count` questions from `questions` ensuring ≥2 from each category present.
 * Returns a Fisher-Yates-shuffled array (determines display order).
 */
function selectBalancedQuestions(questions, count) {
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
        // Fewer slots than categories×2 — take 1 from each + fill randomly
        const selected = [];
        for (const cat of categories) {
            const shuffled = fisherYatesShuffle(byCategory[cat]);
            selected.push(shuffled[0]);
        }
        const usedIds = new Set(selected.map(q => q.id));
        const remaining = fisherYatesShuffle(questions.filter(q => !usedIds.has(q.id)));
        const needed = Math.min(count - selected.length, remaining.length);
        selected.push(...remaining.slice(0, needed));
        return fisherYatesShuffle(selected);
    }

    // Pick minPerCategory from each category
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
 * @param {Array}  selfQuestions — All active SELF-level questions (full pool)
 * @param {number} questionCount — How many questions each employee gets
 * @returns {object} — { totalEmployees, totalAssigned, duplicateSets }
 */
async function assignQuestionsToEmployees(tx, quarterId, selfQuestions, questionCount) {
    // Fetch all employees
    const employees = await tx.user.findMany({
        where: { role: "EMPLOYEE" },
        select: { id: true },
    });

    const usedFingerprints = new Set();
    let duplicateSets = 0;
    const MAX_RETRIES = 5; // max attempts to get a unique set

    // Build all assignment rows in memory, then bulk insert
    const allRows = [];

    for (const emp of employees) {
        let selectedQuestions = null;
        let fingerprint = null;

        // Attempt to generate a unique question set
        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            const candidate = selectBalancedQuestions(selfQuestions, questionCount);
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
