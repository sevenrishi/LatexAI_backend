import { Router, type Request, type Response, type NextFunction } from 'express'
import multer from 'multer'
import { requireAuth } from '../middleware/auth.js'
import { ok } from '../utils/response.js'
import { AppError } from '../utils/errors.js'
import { verifyFileMagicBytes } from '../utils/textExtractor.js'
import { inspectPdfText, calculateAtsScore } from '../ats/index.js'
import { heuristicJobExtractor } from '../ai/prompts/extract.v1.js'

export const pdfRouter = Router()

// In-memory Multer for PDF audit uploads up to 5MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
})

/**
 * POST /pdf/inspect
 * Standalone PDF audit endpoint (features BE-008, task BE-5.08).
 * Accepts multipart PDF file upload or base64 JSON payload.
 * Audits text extractability, essential sections, and ATS match against optional job description.
 */
pdfRouter.post(
  '/inspect',
  requireAuth,
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      let buffer: Buffer | null = null

      // 1. Resolve buffer from multipart upload or JSON base64
      if (req.file) {
        buffer = req.file.buffer
      } else if (req.body?.pdfBase64) {
        try {
          buffer = Buffer.from(req.body.pdfBase64, 'base64')
        } catch {
          throw AppError.badRequest('Invalid base64 encoding for PDF document.', null, 'INVALID_BASE64')
        }
      }

      if (!buffer || buffer.length === 0) {
        throw AppError.badRequest(
          'A PDF document must be provided via multipart "file" upload or "pdfBase64" parameter.',
          null,
          'MISSING_PDF_FILE'
        )
      }

      // 2. Validate PDF magic bytes (%PDF)
      const detected = verifyFileMagicBytes(buffer)
      if (detected !== 'pdf') {
        throw AppError.badRequest(
          'Uploaded document is not a valid PDF file.',
          null,
          'INVALID_PDF_FORMAT'
        )
      }

      // 3. Inspect PDF text and structure
      const inspection = await inspectPdfText(buffer)

      // 4. Resolve optional job requirements / keywords
      let keywords: {
        requiredSkills?: string[]
        preferredSkills?: string[]
        domainKeywords?: string[]
      } = {}

      const jobDescription = req.body?.jobDescription || (req.body?.jobDescriptionRaw as string)
      if (jobDescription && typeof jobDescription === 'string' && jobDescription.trim().length > 10) {
        const extracted = heuristicJobExtractor(jobDescription)
        keywords = {
          requiredSkills: extracted.requiredSkills || [],
          preferredSkills: extracted.preferredSkills || [],
          domainKeywords: extracted.domainKeywords || [],
        }
      } else if (req.body?.keywords) {
        const rawKeywords = Array.isArray(req.body.keywords)
          ? req.body.keywords
          : String(req.body.keywords).split(',').map((k: string) => k.trim())
        keywords = {
          requiredSkills: rawKeywords,
        }
      }

      // 5. Calculate ATS score combining inspection and keywords
      const atsScore = calculateAtsScore({
        resumeText: inspection.rawText,
        keywords,
        pdfInspection: inspection,
      })

      return ok(res, {
        audit: {
          textExtractable: inspection.textExtractable,
          pageCount: inspection.pageCount,
          wordCount: inspection.wordCount,
          characterCount: inspection.characterCount,
          detectedSections: inspection.detectedSections,
          missingSections: inspection.missingSections,
          contactInfoDetected: inspection.contactInfoDetected,
          formatScore: inspection.score,
          issues: inspection.issues,
        },
        atsScore,
        rawTextExcerpt: inspection.rawText ? inspection.rawText.slice(0, 500) : '',
      })
    } catch (err) {
      return next(err)
    }
  }
)
