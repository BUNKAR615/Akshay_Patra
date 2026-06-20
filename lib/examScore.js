// Auto-grading for online exams.
//
// Choice questions with correct answers (SINGLE / MULTIPLE / TRUE_FALSE /
// PICTURE) are auto-graded. Opinion/open types (SHORT / LONG / RATING / LIKERT /
// RANKING / POLL / WORD_CLOUD) carry no marks — they count toward completion
// only (manual review is out of scope for this module).

import { GRADABLE_TYPES } from "./examValidators";

/**
 * @param {Array} questions - [{ id, type, points, choices: [{ id, isCorrect }] }]
 * @param {Object} answersByQ - map questionId -> { choiceIds?: string[] }
 * @returns {{ marks: number, earned: number, possible: number }} marks is 0–100
 */
export function gradeExam(questions, answersByQ) {
    let earned = 0;
    let possible = 0;

    for (const q of questions) {
        if (!GRADABLE_TYPES.includes(q.type)) continue;
        const pts = q.points || 0;
        possible += pts;

        const correctIds = (q.choices || []).filter((c) => c.isCorrect).map((c) => c.id).sort();
        const picked = [...((answersByQ[q.id] && answersByQ[q.id].choiceIds) || [])].sort();

        const isCorrect =
            correctIds.length > 0 &&
            picked.length === correctIds.length &&
            picked.every((id, i) => id === correctIds[i]);

        if (isCorrect) earned += pts;
    }

    const marks = possible > 0 ? Math.round((earned / possible) * 100) : 0;
    return { marks, earned, possible };
}

/** Distribute 100 points evenly across gradable questions (used when a builder
 *  doesn't set explicit points). Mutates nothing — returns a points map. */
export function autoPoints(questions) {
    const gradable = questions.filter((q) => GRADABLE_TYPES.includes(q.type));
    if (gradable.length === 0) return {};
    const each = Math.floor(100 / gradable.length);
    const remainder = 100 - each * gradable.length;
    const map = {};
    gradable.forEach((q, i) => { map[q.id ?? i] = each + (i === 0 ? remainder : 0); });
    return map;
}
