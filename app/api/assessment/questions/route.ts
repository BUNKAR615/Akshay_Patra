import { NextResponse } from 'next/server'
import prisma from "../../../../lib/prisma"

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Fisher-Yates shuffle — returns a new array, leaves the input untouched.
// Used to randomize the question sequence freshly on every assessment start,
// so no two employees see the same order and the order is not persisted.
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export async function GET(request: Request) {
  try {
    const userId = request.headers.get("x-user-id");
    const role = request.headers.get("x-user-role");

    if (!userId) return NextResponse.json(
      { success: false, message: 'Unauthorized' }, 
      { status: 401 }
    )
    if (role !== 'EMPLOYEE') return NextResponse.json(
      { success: false, message: 'Access denied' }, 
      { status: 403 }
    )

    // Get active quarter
    const quarter = await prisma.quarter.findFirst({
      where: { status: 'ACTIVE' },
      select: { id: true, name: true, questionCount: true }
    })
    if (!quarter) return NextResponse.json({
      success: false,
      message: 'No active quarter. Contact admin.'
    }, { status: 404 })

    // Check already submitted
    const existing = await prisma.selfAssessment.findFirst({
      where: { 
        userId: userId, 
        quarterId: quarter.id 
      }
    })
    if (existing) return NextResponse.json({
      success: false,
      message: 'You have already submitted this quarter.',
      alreadySubmitted: true
    }, { status: 409 })

    // ── Try per-employee assigned questions first (ordered by orderIndex) ──
    const assignedQuestions = await prisma.employeeQuarterQuestions.findMany({
      where: { employeeId: userId, quarterId: quarter.id },
      orderBy: { orderIndex: 'asc' },
      include: {
        question: {
          select: {
            id: true,
            text: true,
            textHindi: true,
            category: true,
            level: true
          }
        }
      }
    })

    if (assignedQuestions.length > 0) {
      // Serve per-employee assigned questions in their unique order
      return NextResponse.json({
        success: true,
        data: {
          quarter: { 
            id: quarter.id, 
            name: quarter.name,
            totalQuestions: assignedQuestions.length
          },
          questions: shuffle(assignedQuestions.map(aq => ({
            id: aq.question.id,
            text: aq.question.text,
            textHindi: aq.question.textHindi,
            category: aq.question.category
          })))
        }
      })
    }

    // ── Fallback: serve from QuarterQuestion (backwards compat) ──
    // Resolve the employee's effective collar so the shared SELF pool is also
    // category-filtered when no per-employee assignment row exists. Falls back
    // through live user value → department default → BLUE_COLLAR.
    const empForCollar = await prisma.user.findUnique({
      where: { id: userId },
      select: { collarType: true, department: { select: { collarType: true } } }
    })
    const empCollar = empForCollar?.collarType || empForCollar?.department?.collarType || 'BLUE_COLLAR'

    const quarterQuestions = await prisma.quarterQuestion.findMany({
      where: {
        quarterId: quarter.id,
        question: {
          level: 'SELF',
          isActive: true,
          OR: [{ collarType: null }, { collarType: empCollar }]
        }
      },
      include: {
        question: {
          select: {
            id: true,
            text: true,
            textHindi: true,
            category: true,
            level: true
          }
        }
      }
    })

    if (quarterQuestions.length === 0) return NextResponse.json({
      success: false,
      message: 'No questions found. Admin must start the quarter first.'
    }, { status: 404 })

    return NextResponse.json({
      success: true,
      data: {
        quarter: { 
          id: quarter.id, 
          name: quarter.name,
          totalQuestions: quarterQuestions.length
        },
        questions: shuffle(quarterQuestions.map(qq => ({
          id: qq.question.id,
          text: qq.question.text,
          textHindi: qq.question.textHindi,
          category: qq.question.category
        })))
      }
    })
  } catch (error) {
    console.error('Questions fetch error:', error)
    return NextResponse.json(
      { success: false, message: 'Server error' },
      { status: 500 }
    )
  }
}
