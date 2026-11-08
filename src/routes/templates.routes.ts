/**
 * Templates Routes.
 * Complies with tasks BE-3.05 - BE-3.11.
 */

import { Router, type Request, type Response, type NextFunction } from 'express'
import multer from 'multer'
import { requireAuth } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { ok } from '../utils/response.js'
import { AppError } from '../utils/errors.js'
import { TemplateService } from '../services/template.service.js'
import {
  createTemplateSchema,
  updateTemplateSchema,
  duplicateTemplateSchema,
  previewTemplateSchema,
} from './templates.schema.js'

export const templatesRouter = Router()

// In-memory Multer for .tex file uploads up to 2MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB limit
  },
  fileFilter: (_req, file, cb) => {
    const isTexExtension = file.originalname.toLowerCase().endsWith('.tex')
    const isTexMime =
      file.mimetype === 'text/x-tex' ||
      file.mimetype === 'application/x-tex' ||
      file.mimetype === 'text/plain' ||
      file.mimetype === 'application/octet-stream'

    if (isTexExtension || isTexMime) {
      cb(null, true)
    } else {
      cb(new AppError(400, 'INVALID_FILE_TYPE', 'Only LaTeX (.tex) files are allowed.'))
    }
  },
})

/**
 * GET /api/v1/templates
 * Lists all system templates and user's custom templates (BE-3.05)
 */
templatesRouter.get(
  '/',
  requireAuth(),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const templates = await TemplateService.listTemplates(req.user!.id)
      ok(res, templates)
    } catch (err) {
      next(err)
    }
  }
)

/**
 * GET /api/v1/templates/:id
 * Retrieves single template details (BE-3.05)
 */
templatesRouter.get(
  '/:id',
  requireAuth(),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const template = await TemplateService.getTemplateById(req.params.id as string, req.user!.id)
      ok(res, template)
    } catch (err) {
      next(err)
    }
  }
)

/**
 * POST /api/v1/templates
 * Creates a new custom template from JSON or uploaded .tex file (BE-3.06)
 */
templatesRouter.post(
  '/',
  requireAuth(),
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      let name = req.body.name as string
      const description = req.body.description as string | undefined
      const category = req.body.category as string | undefined
      let latexCode = req.body.latexCode as string | undefined

      // If a file was uploaded via multipart/form-data
      if (req.file) {
        latexCode = req.file.buffer.toString('utf8')
        if (!name) {
          name = req.file.originalname.replace(/\.tex$/i, '')
        }
      }

      // Validate payload against schema
      const parseResult = createTemplateSchema.safeParse({
        name,
        description,
        category,
        latexCode,
      })

      if (!parseResult.success) {
        next(AppError.validation(parseResult.error.format()))
        return
      }

      const created = await TemplateService.createTemplate(req.user!.id, parseResult.data)
      ok(res, created, 201)
    } catch (err) {
      next(err)
    }
  }
)

/**
 * PUT /api/v1/templates/:id
 * Updates an existing custom template (BE-3.07)
 */
templatesRouter.put(
  '/:id',
  requireAuth(),
  validate({ body: updateTemplateSchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const updated = await TemplateService.updateTemplate(
        req.params.id as string,
        req.user!.id,
        req.body
      )
      ok(res, updated)
    } catch (err) {
      next(err)
    }
  }
)

/**
 * DELETE /api/v1/templates/:id
 * Deletes custom template with fallback activation rule (BE-3.07)
 */
templatesRouter.delete(
  '/:id',
  requireAuth(),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await TemplateService.deleteTemplate(req.params.id as string, req.user!.id)
      ok(res, result)
    } catch (err) {
      next(err)
    }
  }
)

/**
 * POST /api/v1/templates/:id/duplicate
 * Duplicates a template into a custom template for user (BE-3.08)
 */
templatesRouter.post(
  '/:id/duplicate',
  requireAuth(),
  validate({ body: duplicateTemplateSchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const duplicated = await TemplateService.duplicateTemplate(
        req.params.id as string,
        req.user!.id,
        req.body.name
      )
      ok(res, duplicated, 201)
    } catch (err) {
      next(err)
    }
  }
)

/**
 * POST /api/v1/templates/:id/activate
 * Sets the active template for user profile (BE-3.09)
 */
templatesRouter.post(
  '/:id/activate',
  requireAuth(),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await TemplateService.activateTemplate(req.params.id as string, req.user!.id)
      ok(res, result)
    } catch (err) {
      next(err)
    }
  }
)

/**
 * POST /api/v1/templates/:id/preview
 * Renders sample or profile data into temporary PDF preview (BE-3.10)
 */
templatesRouter.post(
  '/:id/preview',
  requireAuth(),
  validate({ body: previewTemplateSchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const preview = await TemplateService.previewTemplate(req.params.id as string, req.user!.id, {
        profileData: req.body.profileData,
        latexOverride: req.body.latexOverride,
      })

      if (req.headers.accept?.includes('application/pdf')) {
        const buffer = Buffer.from(preview.pdfBase64, 'base64')
        res.setHeader('Content-Type', 'application/pdf')
        res.setHeader('Content-Disposition', `inline; filename="preview-${req.params.id}.pdf"`)
        res.send(buffer)
        return
      }

      ok(res, preview)
    } catch (err) {
      next(err)
    }
  }
)

/**
 * GET /api/v1/templates/:id/placeholders
 * Retrieves placeholders information for template editor (BE-3.11)
 */
templatesRouter.get(
  '/:id/placeholders',
  requireAuth(),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await TemplateService.getTemplatePlaceholders(
        req.params.id as string,
        req.user!.id
      )
      ok(res, result)
    } catch (err) {
      next(err)
    }
  }
)
