import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jwtVerify } from 'jose'

const PUBLIC_PATHS = [
  '/login',
  '/select-role',
  '/api/auth/login',
  '/api/auth/select-role',
  '/api/health',
]

const getSecret = () =>
  new TextEncoder().encode(
    process.env.JWT_SECRET || 'fallback'
  )

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

    // Add user info to request headers for downstream use
    const response = NextResponse.next()
    response.headers.set('x-user-id', String(payload.userId || ''))
    response.headers.set('x-user-empcode', String(payload.empCode || ''))
    response.headers.set('x-user-role', String(payload.role || ''))

    // departmentIds as JSON array string
    const departmentIds = Array.isArray(payload.departmentIds) ? payload.departmentIds : []
    response.headers.set('x-user-department-ids', JSON.stringify(departmentIds))
    // Backward compat: first departmentId
    response.headers.set('x-user-department-id', String(departmentIds[0] || ''))

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
