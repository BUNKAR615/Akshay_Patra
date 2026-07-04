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
    // Log the full error server-side, but never echo it to the (public,
    // unauthenticated) /api/health response — the raw Prisma error can include
    // the database host/connection string.
    console.error('[HEALTH] Database check failed:', error)
    return NextResponse.json({
      status: 'error',
      database: 'disconnected'
    }, { status: 500 })
  }
}
