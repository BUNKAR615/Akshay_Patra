import { SignJWT, jwtVerify } from 'jose'

const getSecret = () => {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET not set')
  return new TextEncoder().encode(secret)
}

const getRefreshSecret = () => {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET not set')
  return new TextEncoder().encode(secret + '_refresh')
}

const getBranchSelectSecret = () => {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET not set')
  return new TextEncoder().encode(secret + '_branch_select')
}

const getRoleSelectSecret = () => {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET not set')
  return new TextEncoder().encode(secret + '_role_select')
}

export async function signToken(payload: Record<string, unknown>): Promise<string> {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(process.env.JWT_EXPIRES_IN || '8h')
    .sign(getSecret())
}

export async function signRefreshToken(payload: Record<string, unknown>): Promise<string> {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(getRefreshSecret())
}

export async function verifyToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, getSecret())
    return payload as Record<string, unknown>
  } catch {
    return null
  }
}

export async function verifyRefreshToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, getRefreshSecret())
    return payload as Record<string, unknown>
  } catch {
    return null
  }
}

// Stage-1 token issued during multi-branch login. 5-minute TTL.
// Carries only { userId, role, mode: "branch-select" } — never a branchId,
// because the branch is what the user is about to choose.
export async function signBranchSelectToken(payload: { userId: string; role: string }): Promise<string> {
  return await new SignJWT({ ...payload, mode: 'branch-select' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(getBranchSelectSecret())
}

export async function verifyBranchSelectToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, getBranchSelectSecret())
    if (payload.mode !== 'branch-select') return null
    return payload as Record<string, unknown>
  } catch {
    return null
  }
}

// Stage-1 token issued during the Admin+HOD role-picker login flow. 5-minute TTL.
// Carries only { userId, roles, mode: "role-select" } — never a final role,
// because the role is what the user is about to choose.
export async function signRoleSelectToken(payload: { userId: string; roles: string[] }): Promise<string> {
  return await new SignJWT({ ...payload, mode: 'role-select' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(getRoleSelectSecret())
}

export async function verifyRoleSelectToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, getRoleSelectSecret())
    if (payload.mode !== 'role-select') return null
    return payload as Record<string, unknown>
  } catch {
    return null
  }
}

export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null
  return authHeader.slice(7)
}

export function getTokenExpiry(hoursFromNow = 8): Date {
  return new Date(Date.now() + hoursFromNow * 60 * 60 * 1000)
}
