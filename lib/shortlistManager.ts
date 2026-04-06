import { prisma } from './prisma'
import { getDepartmentSize } from './department-rules'

/**
 * Recompute Stage 1 shortlist (top N employees by self-assessment score)
 * for a given department + quarter.
 *
 * Size rules (single source of truth — getDepartmentSize):
 *   ≥ 10 employees  →  top 10 advance
 *   5–9 employees   →  ALL who submitted advance
 *   3–4 employees   →  ALL who submitted advance
 *   2 employees     →  ALL who submitted advance
 *   1 employee      →  ALL (the single employee) advances
 *
 * FREEZE RULE: Once any supervisor evaluation exists for this department
 * + quarter, the Stage 1 shortlist is frozen. New self-assessment submissions
 * still record their scores, but the shortlist is not recalculated.
 * This prevents employees from being removed mid-evaluation when a
 * later-submitting employee scores higher.
 */
export async function updateStage1Shortlist(
  tx: any,
  departmentId: string,
  quarterId: string
) {
  // ── Freeze check: if a supervisor has started evaluating, lock the list ──
  const supervisorEvalsExist = await tx.supervisorEvaluation.count({
    where: {
      quarterId,
      employee: { departmentId }
    }
  })
  if (supervisorEvalsExist > 0) {
    // Shortlist is frozen — supervisor round is in progress.
    // The self-assessment score is still saved (by the caller), but
    // the ranking won't change until next quarter.
    return
  }

  // Use getDepartmentSize as the single source of truth for Stage 1 limit
  const deptLimits = await getDepartmentSize(departmentId)
  // stage1Limit === null means "take ALL who submitted" (no cap)
  const shortlistSize = deptLimits.stage1Limit ?? undefined  // undefined → Prisma skips take

  // Get all submitted assessments for this department, ranked by score
  // SelfAssessment does NOT have departmentId — must join through user
  const assessments = await tx.selfAssessment.findMany({
    where: {
      quarterId,
      user: { departmentId, role: 'EMPLOYEE' }
    },
    orderBy: [
      { normalizedScore: 'desc' },
      { completionTimeSeconds: 'asc' } // Tie-break: faster completion time wins
    ],
    ...(shortlistSize !== undefined ? { take: shortlistSize } : {}),
    select: { userId: true, normalizedScore: true }
  })

  // Clear existing shortlist for this department+quarter
  await tx.shortlistStage1.deleteMany({
    where: { departmentId, quarterId }
  })

  // Insert ranked shortlist
  for (let i = 0; i < assessments.length; i++) {
    const a = assessments[i]
    await tx.shortlistStage1.create({
      data: {
        userId: a.userId,
        quarterId,
        departmentId,
        selfScore: a.normalizedScore,
        rank: i + 1
      }
    })
  }
}
