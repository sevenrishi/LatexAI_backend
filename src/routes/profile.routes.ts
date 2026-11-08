import { Router, type Request, type Response, type NextFunction } from 'express'
import multer from 'multer'
import { requireAuth } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { ok } from '../utils/response.js'
import { AppError } from '../utils/errors.js'
import { ProfileService, type ProfileSection } from '../services/profile.service.js'
import {
  updateProfileSchema,
  experienceSchema,
  educationSchema,
  skillSchema,
  bulkSkillsSchema,
  certificationSchema,
  projectSchema,
  reorderSchema,
  confirmImportSchema,
} from './profile.schema.js'

export const profileRouter = Router()

// Configure Multer for in-memory file uploads with 5MB limit
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
})

// Section schema registry
const SECTION_SCHEMAS: Record<
  ProfileSection,
  | typeof experienceSchema
  | typeof educationSchema
  | typeof skillSchema
  | typeof certificationSchema
  | typeof projectSchema
> = {
  experience: experienceSchema,
  education: educationSchema,
  skills: skillSchema,
  certifications: certificationSchema,
  projects: projectSchema,
}

const VALID_SECTIONS: ProfileSection[] = [
  'experience',
  'education',
  'skills',
  'certifications',
  'projects',
]

function validateSectionParam(req: Request, _res: Response, next: NextFunction) {
  const section = req.params.section as ProfileSection
  if (!VALID_SECTIONS.includes(section)) {
    return next(
      AppError.badRequest(
        `Invalid section '${section}'. Allowed sections: ${VALID_SECTIONS.join(', ')}`
      )
    )
  }
  next()
}

/**
 * GET /api/v1/profile
 * Returns aggregated full profile with completeness metrics
 */
profileRouter.get(
  '/',
  requireAuth({ requireEmailVerified: true }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const profile = await ProfileService.getFullProfile(req.user!.id, req.user!.email)
      return ok(res, profile, 200)
    } catch (err) {
      return next(err)
    }
  }
)

/**
 * PATCH /api/v1/profile
 * Updates root profile contact info, links, and summary
 */
profileRouter.patch(
  '/',
  requireAuth({ requireEmailVerified: true }),
  validate({ body: updateProfileSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const updated = await ProfileService.updateProfileRoot(req.user!.id, req.body)
      return ok(res, updated, 200)
    } catch (err) {
      return next(err)
    }
  }
)

/**
 * POST /api/v1/profile/skills/bulk
 * Bulk adds skills case-insensitively (BE-2.07)
 */
profileRouter.post(
  '/skills/bulk',
  requireAuth({ requireEmailVerified: true }),
  validate({ body: bulkSkillsSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const skills = await ProfileService.bulkAddSkills(req.user!.id, req.body.skills)
      return ok(res, skills, 200)
    } catch (err) {
      return next(err)
    }
  }
)

/**
 * PATCH /api/v1/profile/:section/reorder
 * Persists user-defined sorting sequence (BE-2.08)
 */
profileRouter.patch(
  '/:section/reorder',
  requireAuth({ requireEmailVerified: true }),
  validateSectionParam,
  validate({ body: reorderSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const section = req.params.section as ProfileSection
      const profile = await ProfileService.reorderSection(
        req.user!.id,
        section,
        req.body.orderedIds
      )
      return ok(res, profile, 200)
    } catch (err) {
      return next(err)
    }
  }
)

/**
 * POST /api/v1/profile/import-resume
 * Multipart upload with strict file-type checks and text extraction (BE-2.12)
 */
profileRouter.post(
  '/import-resume',
  requireAuth({ requireEmailVerified: true }),
  upload.fields([{ name: 'file', maxCount: 1 }, { name: 'resume', maxCount: 1 }]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined
      const uploadedFile = files?.file?.[0] || files?.resume?.[0] || (req as unknown as { file?: Express.Multer.File }).file

      if (!uploadedFile) {
        throw AppError.badRequest('No resume file provided. Please attach a PDF or DOCX file.')
      }

      const draft = await ProfileService.createResumeImport(
        req.user!.id,
        uploadedFile.buffer,
        uploadedFile.originalname,
        uploadedFile.size
      )

      return ok(res, draft, 201)
    } catch (err) {
      return next(err)
    }
  }
)

/**
 * POST /api/v1/profile/import-resume/:importId/confirm
 * Transactionally applies merge or replace strategies (BE-2.16)
 */
profileRouter.post(
  '/import-resume/:importId/confirm',
  requireAuth({ requireEmailVerified: true }),
  validate({ body: confirmImportSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const importId = req.params.importId as string
      const updatedProfile = await ProfileService.confirmResumeImport(
        req.user!.id,
        importId,
        req.body
      )
      return ok(res, updatedProfile, 200)
    } catch (err) {
      return next(err)
    }
  }
)

/**
 * DELETE /api/v1/profile/import-resume/:importId
 * Discards stale import draft (BE-2.17)
 */
profileRouter.delete(
  '/import-resume/:importId',
  requireAuth({ requireEmailVerified: true }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const importId = req.params.importId as string
      const result = await ProfileService.discardResumeImport(req.user!.id, importId)
      return ok(res, result, 200)
    } catch (err) {
      return next(err)
    }
  }
)

/**
 * Generic section CRUD route factories (BE-2.05)
 * GET /api/v1/profile/:section
 */
profileRouter.get(
  '/:section',
  requireAuth({ requireEmailVerified: true }),
  validateSectionParam,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const section = req.params.section as ProfileSection
      const items = await ProfileService.getSectionItems(req.user!.id, section)
      return ok(res, items, 200)
    } catch (err) {
      return next(err)
    }
  }
)

/**
 * POST /api/v1/profile/:section
 */
profileRouter.post(
  '/:section',
  requireAuth({ requireEmailVerified: true }),
  validateSectionParam,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const section = req.params.section as ProfileSection
      const schema = SECTION_SCHEMAS[section]
      const validatedBody = await schema.parseAsync(req.body)
      const newItem = await ProfileService.createSectionItem(req.user!.id, section, validatedBody)
      return ok(res, newItem, 201)
    } catch (err) {
      return next(err)
    }
  }
)

/**
 * PUT /api/v1/profile/:section/:id
 */
profileRouter.put(
  '/:section/:id',
  requireAuth({ requireEmailVerified: true }),
  validateSectionParam,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const section = req.params.section as ProfileSection
      const itemId = req.params.id as string
      const schema = SECTION_SCHEMAS[section]
      const validatedBody = await schema.parseAsync(req.body)
      const updated = await ProfileService.updateSectionItem(
        req.user!.id,
        section,
        itemId,
        validatedBody
      )
      return ok(res, updated, 200)
    } catch (err) {
      return next(err)
    }
  }
)

/**
 * DELETE /api/v1/profile/:section/:id
 */
profileRouter.delete(
  '/:section/:id',
  requireAuth({ requireEmailVerified: true }),
  validateSectionParam,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const section = req.params.section as ProfileSection
      const itemId = req.params.id as string
      const result = await ProfileService.deleteSectionItem(req.user!.id, section, itemId)
      return ok(res, result, 200)
    } catch (err) {
      return next(err)
    }
  }
)
