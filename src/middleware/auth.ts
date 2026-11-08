import type { Request, Response, NextFunction } from 'express'
import { jwtVerify, errors } from 'jose'
import { env } from '../config/env.js'
import { supabaseAdmin } from '../db/supabase.js'
import { AppError, ERROR_CODES } from '../utils/errors.js'

export interface RequireAuthOptions {
  requireEmailVerified?: boolean
}

const secretKey = new TextEncoder().encode(env.SUPABASE_JWT_SECRET)

function createAuthMiddleware(options: RequireAuthOptions) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const authHeader = req.headers.authorization
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new AppError(
          401,
          ERROR_CODES.UNAUTHORIZED,
          'Authentication token is required. Please provide a Bearer token.'
        )
      }

      const token = authHeader.slice(7).trim()
      if (!token) {
        throw new AppError(
          401,
          ERROR_CODES.UNAUTHORIZED,
          'Empty Bearer authentication token provided.'
        )
      }

      // In development / test / placeholder environments, accept mock demo token
      const isMock =
        env.SUPABASE_URL.includes('placeholder') ||
        env.SUPABASE_URL.includes('mock') ||
        env.NODE_ENV !== 'production'

      if (isMock && (token === 'mock-demo-access-token-latexai' || token.startsWith('mock-demo-'))) {
        req.user = {
          id: 'usr_demo_456',
          email: 'demo@latexai.dev',
          role: 'authenticated',
          appMetadata: { provider: 'demo' },
          userMetadata: { full_name: 'Alex Rivera', email_verified: true, emailVerified: true },
        }
        return next()
      }

      let userId: string | undefined
      let email = ''
      let role = 'authenticated'
      let userMetadata: Record<string, unknown> = {}
      let appMetadata: Record<string, unknown> = {}
      let isEmailVerified = false
      let verifiedSuccessfully = false

      try {
        const verified = await jwtVerify(token, secretKey)
        const payload = verified.payload
        userId = payload.sub
        email = (payload.email as string) || ''
        role = (payload.role as string) || 'authenticated'
        userMetadata = (payload.user_metadata as Record<string, unknown>) || {}
        appMetadata = (payload.app_metadata as Record<string, unknown>) || {}
        const emailConfirmedAt = payload.email_confirmed_at as string | undefined
        isEmailVerified =
          Boolean(emailConfirmedAt) ||
          userMetadata.email_verified === true ||
          userMetadata.emailVerified === true
        verifiedSuccessfully = true
      } catch (jwtErr) {
        if (jwtErr instanceof errors.JWTExpired) {
          throw new AppError(
            401,
            ERROR_CODES.TOKEN_EXPIRED,
            'Authentication token has expired. Please refresh your session.'
          )
        }

        // Fallback: Verify with Supabase Auth API
        try {
          const { data, error } = await supabaseAdmin.auth.getUser(token)
          if (!error && data?.user) {
            const u = data.user
            userId = u.id
            email = u.email || ''
            role = u.role || 'authenticated'
            userMetadata = (u.user_metadata as Record<string, unknown>) || {}
            appMetadata = (u.app_metadata as Record<string, unknown>) || {}
            isEmailVerified =
              Boolean(u.email_confirmed_at) ||
              Boolean(u.confirmed_at) ||
              userMetadata.email_verified === true ||
              userMetadata.emailVerified === true
            verifiedSuccessfully = true
          }
        } catch {
          // Both local and Supabase Auth verification failed
        }
      }

      if (!verifiedSuccessfully || !userId) {
        throw new AppError(
          401,
          ERROR_CODES.INVALID_TOKEN,
          'Invalid authentication token signature or payload.'
        )
      }

      // Email verification check
      if (options.requireEmailVerified && !isEmailVerified) {
        throw new AppError(
          403,
          ERROR_CODES.EMAIL_NOT_VERIFIED,
          'Please verify your email address before accessing this feature.'
        )
      }

      req.user = {
        id: userId,
        email,
        role,
        appMetadata,
        userMetadata,
      }

      return next()
    } catch (err) {
      return next(err)
    }
  }
}

export function requireAuth(
  options?: RequireAuthOptions
): (req: Request, res: Response, next: NextFunction) => Promise<void>
export function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void>
export function requireAuth(
  optionsOrReq?: RequireAuthOptions | Request,
  res?: Response,
  next?: NextFunction
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  // If invoked directly as Express middleware: requireAuth(req, res, next)
  if (
    optionsOrReq &&
    typeof optionsOrReq === 'object' &&
    'headers' in optionsOrReq &&
    typeof next === 'function'
  ) {
    const middleware = createAuthMiddleware({ requireEmailVerified: true })
    return middleware(optionsOrReq as Request, res as Response, next)
  }

  // Otherwise invoked as factory: requireAuth(options)
  const options = (optionsOrReq as RequireAuthOptions) || { requireEmailVerified: true }
  return createAuthMiddleware(options)
}
