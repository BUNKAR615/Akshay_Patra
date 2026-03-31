import { prisma } from './prisma'

export async function updateStage1Shortlist(
  tx: any,
  departmentId: string,
  quarterId: string
) {
  // Count total employees in department
  const totalEmployees = await tx.user.count({
    where: { departmentId, role: 'EMPLOYEE' }
  })

  // Determine shortlist size based on dept size
  let shortlistSize: number
  if (totalEmployees >= 10) shortlistSize = 10
  else shortlistSize = totalEmployees // promote all

  // Get all submitted assessments for this department
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
    take: shortlistSize,
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

export async function updateStage2Shortlist(
  tx: any,
  departmentId: string,
  quarterId: string
) {
  const totalInStage2 = await tx.shortlistStage2.count({
    where: { quarterId, departmentId }
  })

  let shortlistSize: number
  if (totalInStage2 >= 5) shortlistSize = 5
  else shortlistSize = totalInStage2

  // Fetch ALL evaluatees in the department first to sort them in JS for tie-breaking
  const evaluated = await tx.supervisorEvaluation.findMany({
    where: { quarterId, departmentId },
    select: { 
      employeeId: true, 
      stage2CombinedScore: true,
      supervisorNormalized: true,
      employee: {
        select: {
          selfAssessments: {
            where: { quarterId },
            select: { completionTimeSeconds: true }
          }
        }
      }
    }
  })

  // Tie-break: if scores are equal, sort by self-assessment completionTimeSeconds ascending
  evaluated.sort((a: any, b: any) => {
    if (b.stage2CombinedScore !== a.stage2CombinedScore) {
      return b.stage2CombinedScore - a.stage2CombinedScore
    }
    const timeA = a.employee?.selfAssessments?.[0]?.completionTimeSeconds || 0
    const timeB = b.employee?.selfAssessments?.[0]?.completionTimeSeconds || 0
    return timeA - timeB
  })

  const topEvaluated = evaluated.slice(0, shortlistSize)

  for (const e of topEvaluated) {
    await tx.shortlistStage3.upsert({
      where: {
        userId_quarterId: {
          userId: e.employeeId,
          quarterId
        }
      },
      create: {
        userId: e.employeeId,
        quarterId,
        departmentId,
        stage2Score: e.stage2CombinedScore
      },
      update: {
        stage2Score: e.stage2CombinedScore
      }
    })
  }
}

export async function updateStage3Shortlist(
  tx: any,
  departmentId: string,
  quarterId: string
) {
  const totalInStage3 = await tx.shortlistStage3.count({
    where: { quarterId, departmentId }
  })

  let shortlistSize: number
  if (totalInStage3 >= 3) shortlistSize = 3
  else shortlistSize = totalInStage3

  // Fetch ALL evaluatees and sort in JS for tie-breaking
  const evaluated = await tx.branchManagerEvaluation.findMany({
    where: { quarterId, departmentId },
    select: { 
      employeeId: true, 
      stage3CombinedScore: true,
      employee: {
        select: {
          selfAssessments: {
            where: { quarterId },
            select: { completionTimeSeconds: true }
          }
        }
      }
    }
  })

  // Tie-break by completion time
  evaluated.sort((a: any, b: any) => {
    if (b.stage3CombinedScore !== a.stage3CombinedScore) {
      return b.stage3CombinedScore - a.stage3CombinedScore
    }
    const timeA = a.employee?.selfAssessments?.[0]?.completionTimeSeconds || 0
    const timeB = b.employee?.selfAssessments?.[0]?.completionTimeSeconds || 0
    return timeA - timeB
  })

  const topEvaluated = evaluated.slice(0, shortlistSize)

  for (const e of topEvaluated) {
    await tx.shortlistStage4.upsert({
      where: {
        userId_quarterId: {
          userId: e.employeeId,
          quarterId
        }
      },
      create: {
        userId: e.employeeId,
        quarterId,
        departmentId,
        stage3Score: e.stage3CombinedScore
      },
      update: {
        stage3Score: e.stage3CombinedScore
      }
    })
  }
}
