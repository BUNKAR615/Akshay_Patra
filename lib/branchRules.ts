import { prisma } from './prisma'

export interface BranchLimits {
  branchId: string
  branchType: 'SMALL' | 'BIG'
  totalEmployees: number
  stage1Limit: number | null  // null = take ALL who submitted
  stage2Limit: number
  stage3Limit: number
  stage4Limit: number
}

/**
 * Get branch-level evaluation limits.
 * Small branch: top 50% → 10 → 5 → 3
 * Big branch WC: top 50% → 3 → 2 → 1
 * Big branch BC: top 50% → 10 → 5 → 3
 */
export async function getBranchLimits(
  branchId: string,
  quarterId?: string
): Promise<BranchLimits> {
  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: { id: true, branchType: true }
  })

  if (!branch) throw new Error(`Branch not found: ${branchId}`)

  const totalEmployees = await prisma.user.count({
    where: {
      role: 'EMPLOYEE',
      department: { branchId }
    }
  })

  // Check for custom config for this quarter
  if (quarterId) {
    const config = await prisma.branchEvalConfig.findUnique({
      where: { branchId_quarterId: { branchId, quarterId } }
    })
    if (config) {
      return {
        branchId,
        branchType: branch.branchType,
        totalEmployees,
        stage1Limit: null, // top 50% handled by cutoff percentage
        stage2Limit: config.stage2Limit,
        stage3Limit: config.stage3Limit,
        stage4Limit: config.stage4Limit
      }
    }
  }

  // Default limits based on branch type
  if (branch.branchType === 'BIG') {
    return {
      branchId,
      branchType: 'BIG',
      totalEmployees,
      stage1Limit: null,
      stage2Limit: 10,  // BC track; WC uses 3
      stage3Limit: 5,   // BC track; WC uses 2
      stage4Limit: 3    // BC track; WC uses 1
    }
  }

  // SMALL branch
  return {
    branchId,
    branchType: 'SMALL',
    totalEmployees,
    stage1Limit: null,
    stage2Limit: 10,
    stage3Limit: 5,
    stage4Limit: 3
  }
}

/**
 * Get the Stage 1 cutoff percentage for a branch.
 * Default 50% (0.5). Can be overridden in BranchEvalConfig.
 */
export async function getStage1CutoffPct(
  branchId: string,
  quarterId: string
): Promise<number> {
  const config = await prisma.branchEvalConfig.findUnique({
    where: { branchId_quarterId: { branchId, quarterId } }
  })
  return config?.stage1CutoffPct ?? 0.5
}

/**
 * Get collar-specific limits for big branches.
 */
export function getBigBranchCollarLimits(collarType: 'WHITE_COLLAR' | 'BLUE_COLLAR') {
  if (collarType === 'WHITE_COLLAR') {
    return { stage2Limit: 3, stage3Limit: 2, stage4Limit: 1 }
  }
  // BLUE_COLLAR
  return { stage2Limit: 10, stage3Limit: 5, stage4Limit: 3 }
}
