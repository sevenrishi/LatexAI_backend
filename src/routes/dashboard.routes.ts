import { Router, type Request, type Response, type NextFunction } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { ok } from '../utils/response.js'
import { GenerationService } from '../services/generation.service.js'
import { dashboardRateLimiter } from '../middleware/rateLimiter.js'

export const dashboardRouter = Router()

/**
 * GET /dashboard/summary
 * Aggregate metrics endpoint for frontend dashboards (BE-6.06).
 */
dashboardRouter.get(
  '/summary',
  requireAuth,
  dashboardRateLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const summary = await GenerationService.getDashboardSummary(req.user!.id)
      return ok(res, summary)
    } catch (err) {
      return next(err)
    }
  }
)

/**
 * GET /dashboard
 * Alias for /dashboard/summary
 */
dashboardRouter.get(
  '/',
  requireAuth,
  dashboardRateLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const summary = await GenerationService.getDashboardSummary(req.user!.id)
      return ok(res, summary)
    } catch (err) {
      return next(err)
    }
  }
)
