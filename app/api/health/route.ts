import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`
    const [users, questions, quarters] =
      await Promise.all([
        prisma.user.count(),
        prisma.question.count(),
        prisma.quarter.count(),
      ])
    return NextResponse.json({
      status: 'ok',
      database: 'connected',
      counts: { users, questions, quarters }
    })
  } catch (error) {
    return NextResponse.json({
      status: 'error',
      database: 'disconnected',
      error: String(error)
    }, { status: 500 })
  }
}
