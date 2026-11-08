import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import rateLimit from 'express-rate-limit'
import { requireAuth } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { ok } from '../utils/response.js'
import { GenerationService } from '../services/generation.service.js'
import { safeFetchUrl } from '../jobs/safeFetch.js'
import { extractJobFromHtml } from '../jobs/htmlParser.js'

export const generateRouter = Router()

// Route-level rate limiter for generation endpoints (BE-4.24)
const generateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many generation requests, please slow down.',
    },
  },
})

const createGenerationSchema = z
  .object({
    jobDescription: z.string().optional(),
    jobText: z.string().optional(),
    jobTitle: z.string().optional(),
    companyName: z.string().optional(),
    jobUrl: z.string().url('A valid URL is required').optional(),
    templateId: z.string().optional(),
    targetPageCount: z.number().int().min(1).max(3).optional().default(1),
    sourceGenerationId: z.string().uuid().optional(),
  })
  .refine(
    (data) => data.jobDescription || data.jobText || data.jobUrl || data.sourceGenerationId,
    {
      message: 'Either jobDescription, jobUrl, or sourceGenerationId must be provided.',
      path: ['jobDescription'],
    }
  )

/**
 * POST /generate
 * Accepts job inputs or historical generation ID, returning 202 Accepted (BE-4.20).
 */
generateRouter.post(
  '/',
  requireAuth,
  generateLimiter,
  validate({ body: createGenerationSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const jobDescription = req.body.jobDescription || req.body.jobText
      const result = await GenerationService.createGeneration(req.user!.id, {
        ...req.body,
        jobDescription,
      })
      return res.status(202).json({
        success: true,
        data: result,
      })
    } catch (err) {
      return next(err)
    }
  }
)

/**
 * POST /generate/parse-url
 * Job URL content extractor fallback alias for client compatibility.
 */
generateRouter.post(
  '/parse-url',
  requireAuth,
  validate({ body: z.object({ url: z.string().url('A valid URL is required') }) }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { url } = req.body
      const fetchResult = await safeFetchUrl(url)
      const extracted = extractJobFromHtml(fetchResult.body, fetchResult.statusCode)
      return ok(res, {
        ...extracted,
        jobDescriptionText: extracted.rawText,
        company: extracted.companyName,
      })
    } catch (err) {
      return next(err)
    }
  }
)

/**
 * GET /generate/usage
 * Retrieves user daily generation quota and consumption metrics.
 */
generateRouter.get(
  '/usage',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const summary = await GenerationService.getDashboardSummary(req.user!.id)
      return ok(res, {
        dailyLimit: summary.quotas.dailyLimit,
        usedToday: summary.quotas.dailyUsed,
        remainingToday: summary.quotas.dailyRemaining,
        resetsAt: new Date(new Date().setHours(24, 0, 0, 0)).toISOString(),
      })
    } catch (err) {
      return next(err)
    }
  }
)

/**
 * GET /generate/:id/status
 * Lightweight status polling endpoint (BE-4.22).
 */
generateRouter.get(
  '/:id/status',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const status = await GenerationService.getGenerationStatus(req.user!.id, req.params.id!)
      return ok(res, status)
    } catch (err) {
      return next(err)
    }
  }
)

/**
 * GET /generate/:id/pdf-url
 * Retrieves short-lived signed PDF download/view URL.
 */
generateRouter.get(
  '/:id/pdf-url',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const download = await GenerationService.getResumeDownloadUrl(
        req.user!.id,
        req.params.id!,
        'pdf',
        3600
      )
      return ok(res, {
        compiledPdfUrl: download.downloadUrl,
        expiresAt: download.expiresAt,
      })
    } catch (err) {
      return next(err)
    }
  }
)

/**
 * GET /generate/:id
 * Full generation detail retrieval including signed download URLs and attempt logs (BE-4.22).
 */
generateRouter.get('/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const detail = await GenerationService.getGenerationDetail(req.user!.id, req.params.id!)
    return ok(res, detail)
  } catch (err) {
    return next(err)
  }
})

/**
 * POST /generate/:id/cancel
 * Cancels an ongoing generation (BE-4.23).
 */
generateRouter.post(
  '/:id/cancel',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await GenerationService.cancelGeneration(req.user!.id, req.params.id!)
      return ok(res, result)
    } catch (err) {
      return next(err)
    }
  }
)

/**
 * POST /generate/:id/retry
 * Re-runs generation with previous inputs (BE-4.23).
 */
generateRouter.post(
  '/:id/retry',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await GenerationService.retryGeneration(req.user!.id, req.params.id!)
      return res.status(202).json({
        success: true,
        data: result,
      })
    } catch (err) {
      return next(err)
    }
  }
)

/**
 * GET /generate/:id/ats-score
 * Computes or retrieves weighted ATS score, breakdown, and keyword match analysis (BE-5.07).
 */
generateRouter.get(
  '/:id/ats-score',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const atsScore = await GenerationService.getAtsScore(req.user!.id, req.params.id!)
      return ok(res, atsScore)
    } catch (err) {
      return next(err)
    }
  }
)

const updateTailoredContentSchema = z.object({
  summary: z.string().optional(),
  experience: z
    .array(
      z.object({
        id: z.string(),
        company: z.string(),
        title: z.string(),
        location: z.string().optional(),
        startDate: z.string(),
        endDate: z.string().nullable().optional(),
        current: z.boolean().optional(),
        bullets: z.array(
          z.object({
            id: z.string(),
            sourceBulletId: z.string().optional(),
            text: z.string(),
            keywordsMatched: z.array(z.string()).optional(),
          })
        ),
      })
    )
    .optional(),
  education: z
    .array(
      z.object({
        id: z.string(),
        institution: z.string(),
        degree: z.string(),
        fieldOfStudy: z.string().optional(),
        location: z.string().optional(),
        startDate: z.string().optional(),
        endDate: z.string().nullable().optional(),
        gpa: z.string().optional(),
        honors: z.string().optional(),
      })
    )
    .optional(),
  skills: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        category: z.string(),
        isHighlighted: z.boolean().optional(),
      })
    )
    .optional(),
  projects: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        role: z.string().optional(),
        description: z.string(),
        techStack: z.array(z.string()).optional(),
        liveUrl: z.string().optional(),
        repoUrl: z.string().optional(),
      })
    )
    .optional(),
})

/**
 * PATCH /generate/:id/content
 * Allows manual user edits to tailored resume sections (BE-5.09).
 */
generateRouter.patch(
  '/:id/content',
  requireAuth,
  validate({ body: updateTailoredContentSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const updated = await GenerationService.updateTailoredContent(
        req.user!.id,
        req.params.id!,
        req.body
      )
      return ok(res, updated)
    } catch (err) {
      return next(err)
    }
  }
)

const rerenderSchema = z.object({
  templateId: z.string().optional(),
})

/**
 * POST /generate/:id/rerender
 * Re-compiles the document without re-running AI tailoring (BE-5.10).
 */
generateRouter.post(
  '/:id/rerender',
  requireAuth,
  validate({ body: rerenderSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await GenerationService.rerenderGeneration(
        req.user!.id,
        req.params.id!,
        req.body
      )
      return ok(res, result)
    } catch (err) {
      return next(err)
    }
  }
)

/**
 * POST /generate/:id/content/reset
 * Restores original AI-generated resume content prior to manual edits (BE-5.11).
 */
generateRouter.post(
  '/:id/content/reset',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await GenerationService.resetTailoredContent(
        req.user!.id,
        req.params.id!
      )
      return ok(res, result)
    } catch (err) {
      return next(err)
    }
  }
)

