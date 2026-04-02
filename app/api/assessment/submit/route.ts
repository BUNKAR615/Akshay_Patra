import { NextResponse } from 'next/server'
import prisma from "../../../../lib/prisma"
import { updateStage1Shortlist } from "../../../../lib/shortlistManager"

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const userId = request.headers.get("x-user-id");
    const role = request.headers.get("x-user-role");

    if (!userId || role !== 'EMPLOYEE') 
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 }
      )

    const body = await request.json()
    const { answers, completionTimeSeconds = 0 } = body
    // answers = [{ questionId: string, score: number }]

    // Validate answers array
    if (!answers || !Array.isArray(answers) || 
        answers.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'No answers provided'
      }, { status: 400 })
    }

    // Validate each score is -2, -1, 0, 1, or 2
    const validScores = [-2, -1, 0, 1, 2]
    for (const ans of answers) {
      if (!validScores.includes(ans.score)) {
        return NextResponse.json({
          success: false,
          message: `Invalid score ${ans.score}. Must be -2, -1, 0, 1, or 2.`
        }, { status: 400 })
      }
    }

    // Get active quarter
    const quarter = await prisma.quarter.findFirst({
      where: { status: 'ACTIVE' },
      select: { id: true, name: true }
    })
    if (!quarter) return NextResponse.json({
      success: false,
      message: 'No active quarter found.'
    }, { status: 404 })

    // Check duplicate submission
    const existing = await prisma.selfAssessment.findFirst({
      where: { 
        userId: userId, 
        quarterId: quarter.id 
      }
    })
    if (existing) return NextResponse.json({
      success: false,
      message: 'Assessment already submitted for this quarter.'
    }, { status: 409 })

    // Validate questionIds belong to this employee's assigned set (or quarter pool as fallback)
    let validIds: string[] = [];

    // Try per-employee assigned questions first
    const assignedQs = await prisma.employeeQuarterQuestions.findMany({
      where: { employeeId: userId, quarterId: quarter.id },
      select: { questionId: true }
    })

    if (assignedQs.length > 0) {
      validIds = assignedQs.map(q => q.questionId)
    } else {
      // Fallback: validate against quarter-level pool (backwards compat)
      const quarterQuestionIds = await prisma.quarterQuestion.findMany({
        where: { quarterId: quarter.id },
        select: { questionId: true }
      })
      validIds = quarterQuestionIds.map(q => q.questionId)
    }

    for (const ans of answers) {
      if (!validIds.includes(ans.questionId)) {
        return NextResponse.json({
          success: false,
          message: 'Invalid question in submission. You must answer only your assigned questions.'
        }, { status: 400 })
      }
    }

    // CALCULATE SCORE — simple addition
    const rawScore = answers.reduce(
      (sum: number, ans: any) => sum + ans.score, 0
    )
    const maxScore = answers.length * 2
    const normalizedScore = Math.round(
      (rawScore / maxScore) * 100 * 100
    ) / 100

    // Get employee department
    const empUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { departmentId: true }
    })

    // Save in transaction
    await prisma.$transaction(async (tx) => {
      // Save assessment
      await tx.selfAssessment.create({
        data: {
          userId: userId,
          quarterId: quarter.id,
          answers: answers,
          rawScore,
          maxScore,
          normalizedScore,
          completionTimeSeconds,
          submittedAt: new Date()
        }
      })

      // Update stage 1 ranking for this department
      if (empUser?.departmentId) {
        await updateStage1Shortlist(
          tx, 
          empUser.departmentId, 
          quarter.id
        )
      }

      // Create notification
      await tx.notification.create({
        data: {
          userId: userId,
          message: `Your self-assessment for ${quarter.name} has been submitted successfully.`,
          isRead: false
        }
      })
    })

    return NextResponse.json({
      success: true,
      data: {
        submitted: true,
        submittedAt: new Date().toISOString(),
        totalQuestions: answers.length,
        message: 'Assessment submitted successfully!'
      }
    })

  } catch (error) {
    console.error('Submit error:', error)
    return NextResponse.json(
      { success: false, message: 'Server error. Try again.' },
      { status: 500 }
    )
  }
}
