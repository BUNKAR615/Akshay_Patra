import { NextResponse } from 'next/server'
import prisma from "../../../../lib/prisma"
import { updateStage1Shortlist, updateBranchStage1Shortlist } from "../../../../lib/shortlistManager"
import { normalizeScore } from "../../../../lib/scoreCalculator"
import { stageGate } from "../../../../lib/stageScheduler"
import { runAfterResponse } from "../../../../lib/afterResponse"

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

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

    // ── Cheap in-memory validation first (no DB round-trips) ──
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

    // Get active quarter (needed before the per-quarter lookups below)
    const quarter = await prisma.quarter.findFirst({
      where: { status: 'ACTIVE' },
      select: { id: true, name: true }
    })
    if (!quarter) return NextResponse.json({
      success: false,
      message: 'No active quarter found.'
    }, { status: 404 })

    // ── Fire every independent pre-check in ONE round-trip wave instead of
    //    round-tripping to Neon one query at a time. ──
    const [gate, existing, assignedQs, empUser] = await Promise.all([
      // Stage 1 must be the active stage. Scheduled/paused/completed all close
      // submissions with a friendly message. Fails OPEN on any DB hiccup.
      stageGate(quarter.id, 1),
      // Duplicate-submission early exit (the DB unique index is the real guard).
      prisma.selfAssessment.findFirst({
        where: { userId, quarterId: quarter.id },
        select: { id: true }
      }),
      // Per-employee assigned questions (preferred validation set).
      prisma.employeeQuarterQuestions.findMany({
        where: { employeeId: userId, quarterId: quarter.id },
        select: { questionId: true }
      }),
      // Department + branch — needed for the (deferred) shortlist recompute.
      prisma.user.findUnique({
        where: { id: userId },
        select: { departmentId: true, department: { select: { branchId: true } } }
      }),
    ])

    if (!gate.open) return NextResponse.json({
      success: false,
      message: gate.message
    }, { status: 403 })

    if (existing) return NextResponse.json({
      success: false,
      message: 'Assessment already submitted for this quarter.'
    }, { status: 409 })

    // Validate questionIds belong to this employee's assigned set (or quarter pool as fallback)
    let validIds: string[]
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

    const validIdSet = new Set(validIds)
    const seenIds = new Set<string>()
    for (const ans of answers) {
      if (!validIdSet.has(ans.questionId)) {
        return NextResponse.json({
          success: false,
          message: 'Invalid question in submission. You must answer only your assigned questions.'
        }, { status: 400 })
      }
      // A duplicated questionId would double that question's share of the
      // stage weight — every question must carry exactly stageWeight/count.
      if (seenIds.has(ans.questionId)) {
        return NextResponse.json({
          success: false,
          message: 'Duplicate answer in submission. Each question can only be answered once.'
        }, { status: 400 })
      }
      seenIds.add(ans.questionId)
    }

    // When a per-employee assigned set exists, ALL of it must be answered —
    // a partial submission would silently shift the per-question weight
    // (the form auto-records 0 for timed-out questions, so a full set is
    // always sent by the real client). The quarter-pool fallback has no
    // fixed expected count, so it keeps the membership-only validation.
    if (assignedQs.length > 0 && answers.length !== assignedQs.length) {
      return NextResponse.json({
        success: false,
        message: `Incomplete submission. All ${assignedQs.length} assigned questions must be answered.`
      }, { status: 400 })
    }

    // CALCULATE SCORE — raw sum, then the count-independent percentage that
    // keeps the total stage weightage fixed for any question count (the
    // shared normalizeScore is the single source of truth for this).
    const rawScore = answers.reduce(
      (sum: number, ans: any) => sum + ans.score, 0
    )
    const maxScore = answers.length * 2
    const normalizedScore = normalizeScore(rawScore, answers.length)

    // ── CRITICAL PATH: persist the evaluation and nothing else. ──
    // A single create is atomic on its own; the self_assessments_userId_quarterId
    // unique index guarantees only ONE record can ever be saved for this
    // employee + quarter, so concurrent double-submits collapse safely (P2002).
    await prisma.selfAssessment.create({
      data: {
        userId,
        quarterId: quarter.id,
        answers,
        rawScore,
        maxScore,
        normalizedScore,
        completionTimeSeconds,
        submittedAt: new Date()
      }
    })

    const branchId = empUser?.department?.branchId
    const departmentId = empUser?.departmentId

    // ── DEFERRED: derived work that the user does not need to wait for. ──
    // Shortlist ranking is recomputed-from-scratch + idempotent, so running it
    // just after the response is both faster (perceived-instant submit) AND more
    // correct under concurrency — by the time it runs, every racing insert has
    // already committed and is included in the ranking.
    runAfterResponse(async () => {
      await prisma.$transaction(async (tx) => {
        // Branch-level Stage 1 ranking (top N%)
        if (branchId) {
          await updateBranchStage1Shortlist(tx, branchId, quarter.id)
        }
        // Legacy department-level shortlist (backward compatibility)
        if (departmentId) {
          await updateStage1Shortlist(tx, departmentId, quarter.id)
        }
      }, { timeout: 20000 })

      // Submission-confirmation notification (non-critical).
      await prisma.notification.create({
        data: {
          userId,
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

  } catch (error: any) {
    // A concurrent double-submit loses the race on the
    // self_assessments_userId_quarterId unique index — report it cleanly
    // instead of as a generic 500.
    if (error?.code === 'P2002') {
      return NextResponse.json(
        { success: false, message: 'Assessment already submitted for this quarter.' },
        { status: 409 }
      )
    }
    console.error('Submit error:', error)
    return NextResponse.json(
      { success: false, message: 'Server error. Try again.' },
      { status: 500 }
    )
  }
}
