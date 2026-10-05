// ═══════════════════════════════════════════════════════════════
//  Fixed stage weightage — the core invariant of the scoring engine.
//
//  Every questionnaire stage (self / BM / HOD / CM) is first normalized here
//  to a question-count-independent percentage: rawScore is the sum of the
//  per-question answers, maxPossible = questionCount × maxPerQuestion. The
//  stage combiners below then apply FIXED weights to that percentage, so the
//  total weightage of a stage never depends on how many questions the admin
//  configured — each question automatically carries stageWeight/questionCount
//  marks. 10 questions → each worth W/10; 20 questions → each worth W/20.
//  Adding, removing, or reordering questions never changes a stage's total.
//
//  Two answer scales exist:
//    • Self assessment (Stage 1) — Likert -2..+2, max 2 per question (default).
//    • Evaluator stages (BM / HOD Stage 2 and CM Stage 3) — 1..5 marks,
//      max 5 per question (EVALUATOR_MAX_SCORE). Records submitted before that
//      change keep their stored -2..+2 scores (see evaluatorScaleMax).
// ═══════════════════════════════════════════════════════════════
const SELF_MAX_SCORE = 2
const EVALUATOR_MIN_SCORE = 1
const EVALUATOR_MAX_SCORE = 5

function normalizeScore(
    rawScore: number,
    questionCount: number,
    maxPerQuestion: number = SELF_MAX_SCORE
): number {
    const maxPossible = questionCount * maxPerQuestion
    if (maxPossible === 0) return 0
    const normalized = (rawScore / maxPossible) * 100
    return Math.round(normalized * 100) / 100
}

// Which per-question maximum (2 = legacy -2..+2, 5 = current 1..5) produced a
// stored evaluator record? Inferred from the stored raw/normalized pair so no
// schema change is needed: the two scales only agree when raw is 0, and a
// 1..5 record can never have raw 0 (its minimum is questionCount × 1).
function evaluatorScaleMax(
    rawScore: number | null | undefined,
    normalized: number | null | undefined,
    answerCount: number
): number {
    if (typeof rawScore !== "number") return EVALUATOR_MAX_SCORE
    if (rawScore <= 0) return SELF_MAX_SCORE
    if (typeof normalized !== "number" || answerCount <= 0) return EVALUATOR_MAX_SCORE
    return Math.abs(normalized - normalizeScore(rawScore, answerCount, SELF_MAX_SCORE)) < 0.02
        ? SELF_MAX_SCORE
        : EVALUATOR_MAX_SCORE
}

function calculateStage2Score(
    selfNormalized: number,
    supervisorNormalized: number
): {
    selfContribution: number
    supervisorContribution: number
    combined: number
} {
    const selfContribution = Math.round((selfNormalized / 100) * 65 * 100) / 100
    const supervisorContribution = Math.round((supervisorNormalized / 100) * 35 * 100) / 100
    const combined = Math.round((selfContribution + supervisorContribution) * 100) / 100
    return { selfContribution, supervisorContribution, combined }
}

function calculateStage3Score(
    selfNormalized: number,
    supervisorNormalized: number,
    bmNormalized: number
): {
    selfContribution: number
    supervisorContribution: number
    bmContribution: number
    combined: number
} {
    const selfContribution = Math.round((selfNormalized / 100) * 55 * 100) / 100
    const supervisorContribution = Math.round((supervisorNormalized / 100) * 30 * 100) / 100
    const bmContribution = Math.round((bmNormalized / 100) * 15 * 100) / 100
    const combined = Math.round(
        (selfContribution + supervisorContribution + bmContribution) * 100
    ) / 100
    return { selfContribution, supervisorContribution, bmContribution, combined }
}

function calculateFinalScore(
    selfNormalized: number,
    supervisorNormalized: number,
    bmNormalized: number,
    cmNormalized: number
): {
    selfContribution: number
    supervisorContribution: number
    bmContribution: number
    cmContribution: number
    finalScore: number
} {
    const selfContribution = Math.round((selfNormalized / 100) * 45 * 100) / 100
    const supervisorContribution = Math.round((supervisorNormalized / 100) * 30 * 100) / 100
    const bmContribution = Math.round((bmNormalized / 100) * 15 * 100) / 100
    const cmContribution = Math.round((cmNormalized / 100) * 10 * 100) / 100
    const finalScore = Math.round(
        (selfContribution + supervisorContribution + bmContribution + cmContribution) * 100
    ) / 100
    return { selfContribution, supervisorContribution, bmContribution, cmContribution, finalScore }
}

// ═══════════════════════════════════════════════════════════════
//  NEW — Branch-level evaluation weights (60/40 → 40/30/30 → 30/25/25/20)
// ═══════════════════════════════════════════════════════════════

function calculateBranchStage2Score(
    selfNormalized: number,
    evaluatorNormalized: number
): {
    selfContribution: number
    evaluatorContribution: number
    combined: number
} {
    const selfContribution = Math.round((selfNormalized / 100) * 60 * 100) / 100
    const evaluatorContribution = Math.round((evaluatorNormalized / 100) * 40 * 100) / 100
    const combined = Math.round((selfContribution + evaluatorContribution) * 100) / 100
    return { selfContribution, evaluatorContribution, combined }
}

function calculateBranchStage3Score(
    selfNormalized: number,
    evaluatorNormalized: number,
    cmNormalized: number
): {
    selfContribution: number
    evaluatorContribution: number
    cmContribution: number
    combined: number
} {
    const selfContribution = Math.round((selfNormalized / 100) * 40 * 100) / 100
    const evaluatorContribution = Math.round((evaluatorNormalized / 100) * 30 * 100) / 100
    const cmContribution = Math.round((cmNormalized / 100) * 30 * 100) / 100
    const combined = Math.round(
        (selfContribution + evaluatorContribution + cmContribution) * 100
    ) / 100
    return { selfContribution, evaluatorContribution, cmContribution, combined }
}

// ── HR Stage-4 band scoring ──
// HR's 20-mark round is split 10 (attendance) + 10 (punctuality). Each half is
// scored in 10-percentage-point bands, dropping 1 mark per band:
//   ≥90 → 10 · 80s → 9 · 70s → 8 · 60s → 7 · 50s → 6 · 40s → 5 ·
//   30s → 4 · 20s → 3 · 10s → 2 · <10 → 1
function hrBandMarks(pct: number): number {
    if (!Number.isFinite(pct) || pct < 0) return 0
    return Math.min(10, Math.floor(pct / 10) + 1)
}

function calculateBranchFinalScore(
    selfNormalized: number,
    evaluatorNormalized: number,
    cmNormalized: number,
    hrNormalized: number
): {
    selfContribution: number
    evaluatorContribution: number
    cmContribution: number
    hrContribution: number
    finalScore: number
} {
    const selfContribution = Math.round((selfNormalized / 100) * 30 * 100) / 100
    const evaluatorContribution = Math.round((evaluatorNormalized / 100) * 25 * 100) / 100
    const cmContribution = Math.round((cmNormalized / 100) * 25 * 100) / 100
    const hrContribution = Math.round((hrNormalized / 100) * 20 * 100) / 100
    const finalScore = Math.round(
        (selfContribution + evaluatorContribution + cmContribution + hrContribution) * 100
    ) / 100
    return { selfContribution, evaluatorContribution, cmContribution, hrContribution, finalScore }
}

export {
    SELF_MAX_SCORE,
    EVALUATOR_MIN_SCORE,
    EVALUATOR_MAX_SCORE,
    evaluatorScaleMax,
    normalizeScore,
    calculateStage2Score,
    calculateStage3Score,
    calculateFinalScore,
    calculateBranchStage2Score,
    calculateBranchStage3Score,
    calculateBranchFinalScore,
    hrBandMarks
}
