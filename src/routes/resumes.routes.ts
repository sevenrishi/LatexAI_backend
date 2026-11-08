import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { ok } from '../utils/response.js'
import { GenerationService } from '../services/generation.service.js'
import { resumesRateLimiter, generateRateLimiter } from '../middleware/rateLimiter.js'

export const resumesRouter = Router()

// Request validation schemas
const listResumesQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 20))
    .pipe(z.number().int().min(1).max(50)),
  search: z.string().optional(),
  status: z.string().optional(),
  templateId: z.string().optional(),
})

const downloadQuerySchema = z.object({
  format: z.enum(['pdf', 'tex']).default('pdf'),
  expiresIn: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 300))
    .pipe(z.number().int().min(30).max(3600)),
})

const reuseBodySchema = z.object({
  templateId: z.string().optional(),
  targetPageCount: z.number().int().min(1).max(3).optional(),
  jobDescription: z.string().optional(),
})

/**
 * GET /resumes
 * Cursor-paginated history list with search and filtering parameters (BE-6.01).
 */
resumesRouter.get(
  '/',
  requireAuth,
  resumesRateLimiter,
  validate({ query: listResumesQuerySchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { cursor, limit, search, status, templateId } = req.query as unknown as {
        cursor?: string
        limit: number
        search?: string
        status?: string
        templateId?: string
      }

      const result = await GenerationService.listResumes(req.user!.id, {
        cursor,
        limit,
        search,
        status,
        templateId,
      })

      return ok(res, result)
    } catch (err) {
      return next(err)
    }
  }
)

/**
 * GET /resumes/:id
 * Generation detail retrieval with ATS scores and signed download URLs (BE-6.02).
 */
resumesRouter.get(
  '/:id',
  requireAuth,
  resumesRateLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const detail = await GenerationService.getGenerationDetail(req.user!.id, req.params.id!)
      return ok(res, detail)
    } catch (err) {
      return next(err)
    }
  }
)

/**
 * DELETE /resumes/:id
 * Deletes resume record and purges associated storage files (BE-6.03).
 */
resumesRouter.delete(
  '/:id',
  requireAuth,
  resumesRateLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await GenerationService.deleteResume(req.user!.id, req.params.id!)
      return ok(res, result)
    } catch (err) {
      return next(err)
    }
  }
)

/**
 * GET /resumes/:id/download
 * Short-lived signed download URL with sanitized filename for PDF or .tex (BE-6.04).
 */
resumesRouter.get(
  '/:id/download',
  requireAuth,
  resumesRateLimiter,
  validate({ query: downloadQuerySchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { format, expiresIn } = req.query as unknown as {
        format: 'pdf' | 'tex'
        expiresIn: number
      }

      const download = await GenerationService.getResumeDownloadUrl(
        req.user!.id,
        req.params.id!,
        format,
        expiresIn
      )

      return ok(res, download)
    } catch (err) {
      return next(err)
    }
  }
)

/**
 * POST /resumes/:id/reuse
 * Creates a new generation request from historical job description (BE-6.05).
 */
resumesRouter.post(
  '/:id/reuse',
  requireAuth,
  generateRateLimiter,
  validate({ body: reuseBodySchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await GenerationService.reuseResume(
        req.user!.id,
        req.params.id!,
        req.body
      )

      return res.status(202).json({
        success: true,
        data: result,
      })
    } catch (err) {
      return next(err)
    }
  }
)
