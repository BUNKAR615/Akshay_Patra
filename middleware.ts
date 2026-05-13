import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jwtVerify } from 'jose'
import { DASHBOARD_HOME } from './lib/dashboardNav'

const PUBLIC_PATHS = [
  '/login',
  '/api/auth/login',
  // Stage-2 of two-step login flows: the user does not yet have a `token`
  // cookie, but is authenticated via the short-lived stage-1 cookie that the
  // endpoint itself verifies (branchSelectToken / roleSelectToken).
  '/api/auth/select-branch',
  '/api/auth/select-role',
  '/api/health',
]

// Maps a /dashboard/<segment> URL prefix to the role permitted to access it.
// Used to block cross-role URL navigation (e.g. a Branch Manager typing
// /dashboard/admin in the address bar) before any page renders.
const DASHBOARD_ROLE_BY_PREFIX: Record<string, string> = {
  admin: 'ADMIN',
  'branch-manager': 'BRANCH_MANAGER',
  'cluster-manager': 'CLUSTER_MANAGER',
  hod: 'HOD',
  hr: 'HR',
  committee: 'COMMITTEE',
  employee: 'EMPLOYEE',
}

const getSecret = () => {
  const secret = process.env.JWT_SECRET
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is not set. Refusing to verify tokens with an insecure fallback.')
  }
  return new TextEncoder().encode(secret)
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow public paths
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // Allow static assets
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.match(/\.(png|jpg|jpeg|svg|ico|css|js)$/)
  ) {
    return NextResponse.next()
  }

  // Get token from cookie or Authorization header
  const token =
    request.cookies.get('token')?.value ||
    request.headers.get('authorization')?.replace('Bearer ', '')

  if (!token) {
    // For API routes return 401 JSON, for pages redirect to login
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { success: false, message: 'Authentication required' },
        { status: 401 }
      )
    }
    return NextResponse.redirect(
      new URL('/login', request.url)
    )
  }

  // Verify token
  try {
    const { payload } = await jwtVerify(token, getSecret())
    const sessionRole = String(payload.role || '')

    // Dashboard URL isolation: each /dashboard/<segment> belongs to exactly one
    // role. If the user's JWT role doesn't match the segment, redirect them to
    // their own dashboard (never silently render the wrong shell). API routes
    // are NOT gated here — they enforce role at the handler level via
    // withRole([...]) — so this only affects browser-facing /dashboard/* pages.
    if (pathname.startsWith('/dashboard/')) {
      const segment = pathname.split('/')[2] || ''
      const requiredRole = DASHBOARD_ROLE_BY_PREFIX[segment]
      if (requiredRole && sessionRole !== requiredRole) {
        const home = (DASHBOARD_HOME as Record<string, string>)[sessionRole]
        if (home) {
          return NextResponse.redirect(new URL(home, request.url))
        }
        // Unknown role on the token — safest is to drop them at /login rather
        // than land them on a default dashboard.
        const loginUrl = new URL('/login', request.url)
        loginUrl.searchParams.set('error', 'Your account has no valid role. Please sign in again.')
        const resp = NextResponse.redirect(loginUrl)
        resp.cookies.delete('token')
        resp.cookies.delete('refreshToken')
        return resp
      }
    }

    // Add user info to request headers for downstream use
    const response = NextResponse.next()
    response.headers.set('x-user-id', String(payload.userId || ''))
    response.headers.set('x-user-empcode', String(payload.empCode || ''))
    response.headers.set('x-user-role', sessionRole)

    // departmentIds as JSON array string
    const departmentIds = Array.isArray(payload.departmentIds) ? payload.departmentIds : []
    response.headers.set('x-user-department-ids', JSON.stringify(departmentIds))
    // Backward compat: first departmentId
    response.headers.set('x-user-department-id', String(departmentIds[0] || ''))

    // Branch info for branch-level evaluation
    response.headers.set('x-user-branch-id', String(payload.branchId || ''))
    response.headers.set('x-user-branch-type', String(payload.branchType || ''))

    return response
  } catch {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { success: false, message: 'Invalid or expired token' },
        { status: 401 }
      )
    }
    // Session expired — redirect to login with message
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('error', 'Your session expired. Please login again.')
    const response = NextResponse.redirect(loginUrl)
    response.cookies.delete('token')
    response.cookies.delete('refreshToken')
    return response
  }
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.jpg$|.*\\.jpeg$|.*\\.svg$|.*\\.webp$|.*\\.ico$).*)',
  ],
}
