import { SignJWT, jwtVerify } from 'jose'
import { v4 as uuidv4 } from 'uuid'
import { env } from '../../src/config/env.js'

export interface TestJwtPayload {
  sub: string
  email: string
  role?: string
  aud?: string
  app_metadata?: Record<string, unknown>
  user_metadata?: Record<string, unknown>
  email_confirmed_at?: string | null
}

const secretKey = new TextEncoder().encode(env.SUPABASE_JWT_SECRET)

/**
 * Generates a valid mock Supabase JWT token.
 */
export async function generateTestToken(
  payloadOverrides: Partial<TestJwtPayload> = {},
  expiresIn = '1h'
): Promise<string> {
  const userId = payloadOverrides.sub || uuidv4()
  const email = payloadOverrides.email || `user_${userId.slice(0, 8)}@example.com`

  const payload: TestJwtPayload = {
    sub: userId,
    email,
    role: 'authenticated',
    aud: 'authenticated',
    app_metadata: {
      provider: 'email',
      providers: ['email'],
    },
    user_metadata: {
      fullName: 'Test Candidate',
    },
    email_confirmed_at: new Date().toISOString(),
    ...payloadOverrides,
  }

  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer('supabase')
    .setExpirationTime(expiresIn)
    .sign(secretKey)
}

/**
 * Generates an expired mock Supabase JWT token.
 */
export async function generateExpiredToken(
  payloadOverrides: Partial<TestJwtPayload> = {}
): Promise<string> {
  const userId = payloadOverrides.sub || uuidv4()
  const email = payloadOverrides.email || `user_${userId.slice(0, 8)}@example.com`

  const payload: TestJwtPayload = {
    sub: userId,
    email,
    role: 'authenticated',
    aud: 'authenticated',
    ...payloadOverrides,
  }

  // Set expiration to 1 hour in the past
  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
    .setIssuer('supabase')
    .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
    .sign(secretKey)
}

/**
 * Verifies a JWT token using the configured secret key.
 */
export async function verifyTestToken(token: string) {
  return await jwtVerify(token, secretKey, {
    issuer: 'supabase',
  })
}
