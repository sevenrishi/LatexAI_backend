import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { ok } from '../utils/response.js'
import { safeFetchUrl } from '../jobs/safeFetch.js'
import { extractJobFromHtml } from '../jobs/htmlParser.js'
import { assertValidJobText } from '../jobs/normalize.js'
import {
  EXTRACT_V1_SYSTEM_PROMPT,
  buildExtractPrompt,
  jobRequirementsSchema,
  heuristicJobExtractor,
  type JobRequirements,
} from '../ai/prompts/extract.v1.js'
import { runJson } from '../ai/runJson.js'
import { isGroqConfigured } from '../ai/groq.js'

export const jobsRouter = Router()

const fetchJobSchema = z.object({
  url: z.string().url('A valid URL is required'),
})

const extractJobSchema = z.object({
  rawText: z.string().min(1, 'Raw job text is required'),
  jobTitle: z.string().optional(),
  company: z.string().optional(),
})

/**
 * POST /jobs/fetch
 * Fetches remote job webpage using SSRF guards and extracts structured content.
 */
jobsRouter.post(
  '/fetch',
  requireAuth,
  validate({ body: fetchJobSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { url } = req.body

      const fetchResult = await safeFetchUrl(url)
      const extracted = extractJobFromHtml(fetchResult.body, fetchResult.statusCode)

      return ok(res, extracted)
    } catch (err) {
      return next(err)
    }
  }
)

/**
 * POST /jobs/extract
 * Standalone requirement extraction endpoint analyzing job description text.
 */
jobsRouter.post(
  '/extract',
  requireAuth,
  validate({ body: extractJobSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { rawText, jobTitle, company } = req.body
      const normalizedText = assertValidJobText(rawText)

      let requirements: JobRequirements
      let usage: { promptTokens: number; completionTokens: number; totalTokens: number } = {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      }

      // If Groq API key is configured, use LLM. Otherwise fallback to heuristic extractor.
      if (isGroqConfigured()) {
        const result = await runJson({
          systemPrompt: EXTRACT_V1_SYSTEM_PROMPT,
          userPrompt: buildExtractPrompt(normalizedText, { jobTitle, company }),
          schema: jobRequirementsSchema,
        })
        requirements = jobRequirementsSchema.parse(result.data)
        usage = result.usage
      } else {
        requirements = jobRequirementsSchema.parse(
          heuristicJobExtractor(normalizedText, { jobTitle, company })
        )
      }

      return ok(res, {
        requirements,
        usage,
      })
    } catch (err) {
      return next(err)
    }
  }
)
