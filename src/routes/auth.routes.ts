import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { AuthService } from '../services/auth.service.js'
import { requireAuth } from '../middleware/auth.js'
import { authRateLimiter, exportRateLimiter } from '../middleware/rateLimiter.js'
import { validate } from '../middleware/validate.js'
import { ok } from '../utils/response.js'

export const authRouter = Router()

// Request validation schemas
const signupSchema = {
  body: z.object({
    email: z.string().email('Please provide a valid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters long'),
    fullName: z.string().min(1).max(100).optional(),
  }),
}

const loginSchema = {
  body: z.object({
    email: z.string().email('Please provide a valid email address'),
    password: z.string().min(1, 'Password is required'),
  }),
}

const updateProfileSchema = {
  body: z.object({
    fullName: z.string().max(100).optional(),
    headline: z.string().max(200).optional(),
    activeTemplateId: z.string().optional(),
  }),
}

const completeOnboardingSchema = {
  body: z.object({
    fullName: z.string().max(100).optional(),
    headline: z.string().max(200).optional(),
    targetRole: z.string().max(100).optional(),
    industry: z.string().max(100).optional(),
    experienceLevel: z.string().max(50).optional(),
    templateId: z.string().optional(),
    tonePreference: z.string().optional(),
    bulletDensity: z.string().optional(),
  }),
}

const updatePasswordSchema = {
  body: z.object({
    currentPassword: z.string().optional(),
    newPassword: z.string().min(8, 'New password must be at least 8 characters long'),
  }),
}

const pushTokenSchema = {
  body: z.object({
    token: z.string().min(1, 'Push token is required'),
    platform: z.string().optional(),
    appVersion: z.string().optional(),
  }),
}

/**
 * POST /api/v1/auth/signup
 * Optional proxy signup endpoint
 */
authRouter.post(
  '/signup',
  authRateLimiter,
  validate(signupSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password, fullName } = req.body
      const result = await AuthService.signup(email, password, fullName)
      return ok(res, result, 201)
    } catch (err) {
      return next(err)
    }
  }
)

/**
 * POST /api/v1/auth/login
 * Optional proxy login endpoint
 */
authRouter.post(
  '/login',
  authRateLimiter,
  validate(loginSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password } = req.body
      const result = await AuthService.login(email, password)
      return ok(res, result, 200)
    } catch (err) {
      return next(err)
    }
  }
)

/**
 * POST /api/v1/auth/demo
 * Returns demo session for development/demo testing
 */
authRouter.post(
  '/demo',
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await AuthService.getDemoSession()
      return ok(res, result, 200)
    } catch (err) {
      return next(err)
    }
  }
)

/**
 * GET /api/v1/auth/me
 * Retrieves authenticated user identity, onboarding status, and profile completeness
 */
authRouter.get(
  '/me',
  requireAuth({ requireEmailVerified: true }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const profile = await AuthService.getMe(req.user!.id, req.user!.email)
      return ok(res, profile, 200)
    } catch (err) {
      return next(err)
    }
  }
)

/**
 * PATCH /api/v1/auth/me
 * Partially updates user profile info (name, headline, active template)
 */
authRouter.patch(
  '/me',
  requireAuth({ requireEmailVerified: true }),
  validate(updateProfileSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const updated = await AuthService.updateProfile(req.user!.id, req.body)
      return ok(res, updated, 200)
    } catch (err) {
      return next(err)
    }
  }
)

/**
 * PUT /api/v1/auth/me
 * Full/partial update alias for client compatibility
 */
authRouter.put(
  '/me',
  requireAuth({ requireEmailVerified: true }),
  validate(updateProfileSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const updated = await AuthService.updateProfile(req.user!.id, req.body)
      return ok(res, updated, 200)
    } catch (err) {
      return next(err)
    }
  }
)

/**
 * POST /api/v1/auth/onboarding/complete
 * Persists onboarding completion status and preferences
 */
authRouter.post(
  '/onboarding/complete',
  requireAuth({ requireEmailVerified: true }),
  validate(completeOnboardingSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await AuthService.completeOnboarding(req.user!.id, req.body)
      return ok(res, result, 200)
    } catch (err) {
      return next(err)
    }
  }
)

/**
 * POST /api/v1/auth/password
 * Updates account password
 */
authRouter.post(
  '/password',
  authRateLimiter,
  requireAuth({ requireEmailVerified: true }),
  validate(updatePasswordSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await AuthService.updatePassword(req.user!.id, req.body.newPassword)
      return ok(res, result, 200)
    } catch (err) {
      return next(err)
    }
  }
)

/**
 * GET /api/v1/auth/export
 * Exports complete account data archive
 */
authRouter.get(
  '/export',
  exportRateLimiter,
  requireAuth({ requireEmailVerified: true }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const archive = await AuthService.exportData(req.user!.id)
      return ok(res, archive, 200)
    } catch (err) {
      return next(err)
    }
  }
)

/**
 * POST /api/v1/auth/push-token
 * Registers client push notification token for compilation alerts
 */
authRouter.post(
  '/push-token',
  requireAuth({ requireEmailVerified: false }),
  validate(pushTokenSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { token, platform, appVersion } = req.body
      const result = await AuthService.registerPushToken(req.user!.id, token, platform, appVersion)
      return ok(res, result, 200)
    } catch (err) {
      return next(err)
    }
  }
)

/**
 * DELETE /api/v1/auth/account
 * Cascades deletion of all storage files and account records
 */
authRouter.delete(
  '/account',
  authRateLimiter,
  requireAuth({ requireEmailVerified: true }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await AuthService.deleteAccount(req.user!.id)
      return ok(res, result, 200)
    } catch (err) {
      return next(err)
    }
  }
)
