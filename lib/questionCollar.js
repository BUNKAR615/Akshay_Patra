/**
 * questionCollar.js — shared collar-applicability rules for evaluation questions.
 *
 * A Question may target an employee category via its `collarType`:
 *   - null           → applies to BOTH blue- and white-collar (shared / default)
 *   - "WHITE_COLLAR" → white-collar employees only
 *   - "BLUE_COLLAR"  → blue-collar employees only
 *
 * These are pure helpers used on BOTH the server (Stage 1 assignment + Stage
 * 2/3 evaluation validation) and the client (BM/CM dashboards) so the set of
 * questions shown to an evaluator always matches the set the server accepts.
 *
 * Backward-compatible by design: questions with a null collarType apply to
 * everyone, so until an admin tags a question by category, filtering is a
 * no-op and the evaluation flow is unchanged.
 */

const DEFAULT_COLLAR = "BLUE_COLLAR";

/**
 * Resolve an employee's effective collar. Falls back through the live user
 * value → department value → BLUE_COLLAR. This matches the existing
 * convention in lib/branchRules and app/api/branch-manager/stats
 * (`collarType || "BLUE_COLLAR"`).
 *
 * @param {string|null|undefined} userCollar
 * @param {string|null|undefined} deptCollar
 * @returns {"WHITE_COLLAR"|"BLUE_COLLAR"}
 */
export function effectiveCollar(userCollar, deptCollar) {
    return userCollar || deptCollar || DEFAULT_COLLAR;
}

/**
 * Is a question (identified by its stored collarType) applicable to an
 * employee whose effective collar is `employeeCollar`? Shared (null)
 * questions always apply.
 *
 * @param {string|null|undefined} questionCollar
 * @param {string} employeeCollar
 * @returns {boolean}
 */
export function isQuestionApplicable(questionCollar, employeeCollar) {
    return questionCollar == null || questionCollar === employeeCollar;
}

/**
 * Filter an array of question-like objects ({ collarType, ... }) to those
 * applicable to `employeeCollar`.
 *
 * @param {Array<{collarType?: string|null}>} questions
 * @param {string} employeeCollar
 */
export function filterQuestionsByCollar(questions, employeeCollar) {
    return (questions || []).filter((q) => isQuestionApplicable(q?.collarType, employeeCollar));
}

/**
 * Prisma `where` fragment matching questions applicable to `employeeCollar`
 * (shared OR exact-collar). Compose it inside an existing `question: { ... }`
 * clause — it ANDs with sibling conditions such as `level`.
 *
 * @param {string} employeeCollar
 */
export function collarPrismaFilter(employeeCollar) {
    return { OR: [{ collarType: null }, { collarType: employeeCollar }] };
}
