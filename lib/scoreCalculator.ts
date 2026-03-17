function normalizeScore(rawScore: number, questionCount: number): number {
    const maxPossible = questionCount * 2
    if (maxPossible === 0) return 0
    const normalized = (rawScore / maxPossible) * 100
    return Math.round(normalized * 100) / 100
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

export { normalizeScore, calculateStage2Score, calculateStage3Score, calculateFinalScore }
