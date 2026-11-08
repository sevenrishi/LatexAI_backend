import { v4 as uuidv4 } from 'uuid'
import { supabaseAdmin } from '../db/supabase.js'
import { env } from '../config/env.js'
import { AppError } from '../utils/errors.js'
import { logger } from '../utils/logger.js'
import { ProfileService, type FullProfile } from './profile.service.js'
import { calculateProfileCompleteness } from './completeness.service.js'
import { TemplateService } from './template.service.js'
import { StorageService } from './storage.service.js'
import { enqueueGenerationJob } from './generationQueue.js'
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
import {
  TAILOR_V1_SYSTEM_PROMPT,
  buildTailorPrompt,
  tailoredContentSchema,
  heuristicTailorer,
  type TailoredContent,
} from '../ai/prompts/tailor.v1.js'
import {
  COMPILE_FIX_V1_SYSTEM_PROMPT,
  buildCompileFixPrompt,
  compileFixSchema,
} from '../ai/prompts/compile-fix.v1.js'
import { runJson } from '../ai/runJson.js'
import { isGroqConfigured } from '../ai/groq.js'
import { buildSanitizedProfile } from '../ai/sanitizeProfile.js'
import { remediateTailoredContent, buildChangeSummary } from '../ai/verifyTailored.js'
import { renderTemplate } from '../latex/templateRenderer.js'
import { compileLatex, type CompilerClientResult } from '../latex/compilerClient.js'
import { DEFAULT_SWE_TEMPLATE_ID } from '../latex/templates/defaultSwe.js'
import {
  checkLatexStructure,
  inspectPdfText,
  calculateAtsScore,
  type AtsScoreResult,
  type PdfInspectionResult,
} from '../ats/index.js'

export type GenerationStatus =
  | 'queued'
  | 'extracting'
  | 'tailoring'
  | 'rendering'
  | 'compiling'
  | 'completed'
  | 'failed'
  | 'cancelled'

export interface GenerationRecord {
  id: string
  user_id: string
  template_id: string | null
  source_generation_id: string | null
  status: GenerationStatus
  progress: number
  current_stage: string
  job_title: string | null
  company_name: string | null
  job_description_raw: string
  job_url: string | null
  extracted_keywords: Record<string, unknown>
  tailored_content: Record<string, unknown>
  change_summary: Record<string, unknown>
  latex_code: string | null
  pdf_path: string | null
  tex_path: string | null
  page_count: number | null
  target_page_count: number
  error_message: string | null
  error_code: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
  completed_at: string | null
  ats_score?: Record<string, unknown> | null
  original_tailored_content?: Record<string, unknown> | null
}

export interface CompileAttemptRecord {
  id: string
  generation_id: string
  attempt_number: number
  status: 'success' | 'failed' | 'timeout'
  latex_code: string
  page_count?: number
  errors?: unknown
  log_excerpt?: string
  duration_ms: number
  created_at: string
}

export interface AiUsageRecord {
  id: string
  user_id: string
  generation_id?: string
  call_type: 'extract' | 'tailor' | 'compile_fix' | 'import'
  model: string
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  latency_ms: number
  created_at: string
}

export interface ListResumesOptions {
  cursor?: string
  limit?: number
  search?: string
  status?: string
  templateId?: string
}

export interface ResumeSummaryItem {
  id: string
  jobTitle: string | null
  companyName: string | null
  status: GenerationStatus
  currentStage: string
  progress: number
  templateId: string | null
  pageCount: number | null
  targetPageCount: number
  atsScore: number | null
  atsScoreData?: Record<string, unknown> | null
  hasPdf: boolean
  hasTex: boolean
  createdAt: string
  updatedAt: string
  completedAt: string | null
}

export interface ListResumesResult {
  items: ResumeSummaryItem[]
  nextCursor: string | null
  hasMore: boolean
  totalCount: number
}

export interface DashboardSummary {
  overview: {
    totalResumes: number
    completedResumes: number
    failedResumes: number
    inProgressResumes: number
    averageAtsScore: number | null
  }
  quotas: {
    dailyUsed: number
    dailyLimit: number
    dailyRemaining: number
  }
  topKeywords: Array<{ keyword: string; count: number }>
  templateUsage: Array<{ templateId: string; count: number }>
  recentResumes: Array<{
    id: string
    jobTitle: string | null
    companyName: string | null
    status: GenerationStatus
    progress: number
    pageCount: number | null
    atsScore: number | null
    createdAt: string
  }>
}

function isMockMode(): boolean {
  return (
    env.SUPABASE_URL.includes('placeholder') ||
    env.SUPABASE_URL.includes('mock') ||
    env.NODE_ENV === 'test'
  )
}

// In-memory collections for test / offline mock mode
const mockGenerations = new Map<string, GenerationRecord>()
const mockCompileAttempts = new Map<string, CompileAttemptRecord[]>()
const mockAiUsage = new Map<string, AiUsageRecord[]>()

export class GenerationService {
  /**
   * Resets mock collections (for testing).
   */
  static clearMockData(): void {
    mockGenerations.clear()
    mockCompileAttempts.clear()
    mockAiUsage.clear()
  }

  /**
   * Checks daily generation limit quota (BE-4.24).
   */
  static async checkDailyQuota(userId: string): Promise<void> {
    const limit = env.GENERATION_DAILY_LIMIT
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    let count = 0

    if (isMockMode()) {
      count = Array.from(mockGenerations.values()).filter(
        (g) => g.user_id === userId && g.created_at >= oneDayAgo
      ).length
    } else {
      const { count: dbCount, error } = await supabaseAdmin
        .from('generations')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('created_at', oneDayAgo)

      if (error) {
        logger.error({ error, userId }, 'Failed to check generation daily quota')
      } else {
        count = dbCount || 0
      }
    }

    if (count >= limit) {
      throw AppError.tooManyRequests(
        `Daily generation limit of ${limit} resumes reached. Please try again tomorrow.`
      )
    }
  }

  /**
   * Records AI token usage in database and metrics (BE-4.01).
   */
  static async logAiUsage(
    userId: string,
    generationId: string | undefined,
    callType: AiUsageRecord['call_type'],
    model: string,
    usage: { promptTokens: number; completionTokens: number; totalTokens: number },
    latencyMs: number
  ): Promise<void> {
    const record: AiUsageRecord = {
      id: uuidv4(),
      user_id: userId,
      generation_id: generationId,
      call_type: callType,
      model,
      prompt_tokens: usage.promptTokens,
      completion_tokens: usage.completionTokens,
      total_tokens: usage.totalTokens,
      latency_ms: latencyMs,
      created_at: new Date().toISOString(),
    }

    if (isMockMode()) {
      const list = mockAiUsage.get(userId) || []
      list.push(record)
      mockAiUsage.set(userId, list)
      return
    }

    try {
      await supabaseAdmin.from('ai_usage').insert({
        id: record.id,
        user_id: record.user_id,
        generation_id: record.generation_id,
        call_type: record.call_type,
        model: record.model,
        prompt_tokens: record.prompt_tokens,
        completion_tokens: record.completion_tokens,
        total_tokens: record.total_tokens,
        latency_ms: record.latency_ms,
      })
    } catch (err) {
      logger.warn({ err, userId }, 'Failed to write ai_usage record to database')
    }
  }

  /**
   * Records a LaTeX compilation attempt for tracking and debugging.
   */
  static async recordCompileAttempt(
    generationId: string,
    attemptNumber: number,
    status: 'success' | 'failed' | 'timeout',
    latexCode: string,
    pageCount?: number,
    errors?: unknown,
    logExcerpt?: string,
    durationMs = 0
  ): Promise<void> {
    const record: CompileAttemptRecord = {
      id: uuidv4(),
      generation_id: generationId,
      attempt_number: attemptNumber,
      status,
      latex_code: latexCode,
      page_count: pageCount,
      errors,
      log_excerpt: logExcerpt,
      duration_ms: durationMs,
      created_at: new Date().toISOString(),
    }

    if (isMockMode()) {
      const list = mockCompileAttempts.get(generationId) || []
      list.push(record)
      mockCompileAttempts.set(generationId, list)
      return
    }

    try {
      await supabaseAdmin.from('compile_attempts').insert({
        id: record.id,
        generation_id: record.generation_id,
        attempt_number: record.attempt_number,
        status: record.status,
        latex_code: record.latex_code,
        page_count: record.page_count,
        errors: record.errors,
        log_excerpt: record.log_excerpt,
        duration_ms: record.duration_ms,
      })
    } catch (err) {
      logger.warn({ err, generationId }, 'Failed to write compile_attempt record')
    }
  }

  /**
   * Initiates a new resume generation request (BE-4.20).
   */
  static async createGeneration(
    userId: string,
    payload: {
      jobDescription?: string
      jobText?: string
      jobTitle?: string
      companyName?: string
      jobUrl?: string
      templateId?: string
      targetPageCount?: number
      sourceGenerationId?: string
    }
  ): Promise<{ id: string; status: GenerationStatus }> {
    // 1. Check profile completeness guard (BE-4.20)
    const profile = await ProfileService.getFullProfile(userId)
    const completeness = calculateProfileCompleteness({
      fullName: profile.fullName,
      email: profile.email,
      phone: profile.phone,
      location: profile.location,
      summary: profile.summary,
      experience: profile.experience,
      education: profile.education,
      skills: profile.skills,
      projects: profile.projects,
      certifications: profile.certifications,
    })

    if (completeness.percentage < 40) {
      throw AppError.badRequest(
        'Profile completeness is below the required 40% threshold. Please add your contact info and at least one experience or education entry before generating a resume.',
        { completeness },
        'PROFILE_INCOMPLETE'
      )
    }

    // 2. Check daily quota (BE-4.24)
    await this.checkDailyQuota(userId)

    // 3. Extract or validate job description
    let rawJobText = ''
    let jobTitleHint: string | undefined = payload.jobTitle
    let companyHint: string | undefined = payload.companyName

    const effectiveJobDescription = payload.jobDescription || payload.jobText

    if (payload.jobUrl) {
      const fetched = await safeFetchUrl(payload.jobUrl)
      const extracted = extractJobFromHtml(fetched.body, fetched.statusCode)
      rawJobText = extracted.rawText
      jobTitleHint = payload.jobTitle || extracted.jobTitle
      companyHint = payload.companyName || extracted.companyName
    } else if (effectiveJobDescription) {
      rawJobText = assertValidJobText(effectiveJobDescription)
    } else if (payload.sourceGenerationId) {
      // Re-use job text from historical generation
      const source = await this.getGenerationById(userId, payload.sourceGenerationId)
      rawJobText = source.job_description_raw
      jobTitleHint = payload.jobTitle || source.job_title || undefined
      companyHint = payload.companyName || source.company_name || undefined
    } else {
      throw AppError.badRequest('Either jobDescription, jobUrl, or sourceGenerationId is required.')
    }

    // 4. Resolve template ID
    let templateId: string | null = payload.templateId || null
    if (!templateId) {
      try {
        templateId = await TemplateService.getUserActiveTemplateId(userId)
      } catch {
        templateId = DEFAULT_SWE_TEMPLATE_ID
      }
    }

    const generationId = uuidv4()
    const now = new Date().toISOString()

    const generationRecord: GenerationRecord = {
      id: generationId,
      user_id: userId,
      template_id: templateId || DEFAULT_SWE_TEMPLATE_ID,
      source_generation_id: payload.sourceGenerationId || null,
      status: 'queued',
      progress: 0,
      current_stage: 'queued',
      job_title: jobTitleHint || null,
      company_name: companyHint || null,
      job_description_raw: rawJobText,
      job_url: payload.jobUrl || null,
      extracted_keywords: {},
      tailored_content: {},
      change_summary: {},
      latex_code: null,
      pdf_path: null,
      tex_path: null,
      page_count: null,
      target_page_count: payload.targetPageCount || 1,
      error_message: null,
      error_code: null,
      metadata: {},
      created_at: now,
      updated_at: now,
      completed_at: null,
    }

    if (isMockMode()) {
      mockGenerations.set(generationId, generationRecord)
    } else {
      const { error } = await supabaseAdmin.from('generations').insert({
        id: generationRecord.id,
        user_id: generationRecord.user_id,
        template_id: generationRecord.template_id,
        source_generation_id: generationRecord.source_generation_id,
        status: generationRecord.status,
        progress: generationRecord.progress,
        current_stage: generationRecord.current_stage,
        job_title: generationRecord.job_title,
        company_name: generationRecord.company_name,
        job_description_raw: generationRecord.job_description_raw,
        job_url: generationRecord.job_url,
        target_page_count: generationRecord.target_page_count,
      })

      if (error) {
        logger.error({ error, generationId }, 'Failed to persist generation in database')
        throw AppError.internal('Database error initializing generation.')
      }
    }

    // 5. Enqueue background runner (BE-4.21)
    enqueueGenerationJob(generationId, async (id) => {
      await GenerationService.runGeneration(id)
    })

    return {
      id: generationId,
      status: 'queued',
    }
  }

  /**
   * Internal helper to update generation record in store/database.
   */
  static async updateGeneration(
    generationId: string,
    updates: Partial<GenerationRecord>
  ): Promise<GenerationRecord> {
    const now = new Date().toISOString()
    const fullUpdates = { ...updates, updated_at: now }

    if (isMockMode()) {
      const existing = mockGenerations.get(generationId)
      if (!existing) {
        throw AppError.notFound(`Generation ${generationId} not found`)
      }
      const updated = { ...existing, ...fullUpdates }
      mockGenerations.set(generationId, updated)
      return updated
    }

    const { data, error } = await supabaseAdmin
      .from('generations')
      .update(fullUpdates)
      .eq('id', generationId)
      .select('*')
      .single()

    if (error || !data) {
      logger.error({ error, generationId }, 'Failed to update generation record')
      throw AppError.internal('Database error updating generation.')
    }

    return data as GenerationRecord
  }

  /**
   * Retrieves generation record by ID ensuring user authorization.
   */
  static async getGenerationById(userId: string, generationId: string): Promise<GenerationRecord> {
    if (isMockMode()) {
      const gen = mockGenerations.get(generationId)
      if (!gen || gen.user_id !== userId) {
        throw AppError.notFound(`Generation ${generationId} not found`)
      }
      return gen
    }

    const { data, error } = await supabaseAdmin
      .from('generations')
      .select('*')
      .eq('id', generationId)
      .maybeSingle()

    if (error) {
      logger.error({ error, generationId }, 'Database error getting generation')
      throw AppError.internal('Database error loading generation.')
    }

    if (!data || data.user_id !== userId) {
      throw AppError.notFound(`Generation ${generationId} not found`)
    }

    return data as GenerationRecord
  }

  /**
   * Full detail retrieval including signed URLs and compile attempts (BE-4.22).
   */
  static async getGenerationDetail(
    userId: string,
    generationId: string
  ): Promise<
    GenerationRecord & {
      pdfUrl?: string
      texUrl?: string
      compileAttempts: CompileAttemptRecord[]
    }
  > {
    const record = await this.getGenerationById(userId, generationId)

    let pdfUrl: string | undefined
    let texUrl: string | undefined

    if (record.status === 'completed') {
      try {
        pdfUrl = await StorageService.getSignedDownloadUrl(userId, generationId, 'pdf', 3600)
        texUrl = await StorageService.getSignedDownloadUrl(userId, generationId, 'tex', 3600)
      } catch (err) {
        logger.warn({ err, generationId }, 'Could not obtain signed URL for download')
      }
    }

    let compileAttempts: CompileAttemptRecord[] = []
    if (isMockMode()) {
      compileAttempts = mockCompileAttempts.get(generationId) || []
    } else {
      const { data } = await supabaseAdmin
        .from('compile_attempts')
        .select('*')
        .eq('generation_id', generationId)
        .order('attempt_number', { ascending: true })
      compileAttempts = (data as CompileAttemptRecord[]) || []
    }

    return {
      ...record,
      pdfUrl,
      texUrl,
      compileAttempts,
    }
  }

  /**
   * Lightweight status polling endpoint (BE-4.22).
   */
  static async getGenerationStatus(
    userId: string,
    generationId: string
  ): Promise<{
    id: string
    status: GenerationStatus
    progress: number
    currentStage: string
    errorMessage: string | null
    errorCode: string | null
  }> {
    const record = await this.getGenerationById(userId, generationId)
    return {
      id: record.id,
      status: record.status,
      progress: record.progress,
      currentStage: record.current_stage,
      errorMessage: record.error_message,
      errorCode: record.error_code,
    }
  }

  /**
   * Cancels an ongoing generation (BE-4.23).
   */
  static async cancelGeneration(userId: string, generationId: string): Promise<GenerationRecord> {
    const gen = await this.getGenerationById(userId, generationId)
    if (gen.status === 'completed' || gen.status === 'failed') {
      throw AppError.badRequest(`Cannot cancel generation in status "${gen.status}".`)
    }

    return this.updateGeneration(generationId, {
      status: 'cancelled',
      current_stage: 'cancelled',
      error_message: 'Generation cancelled by user.',
      error_code: 'GENERATION_CANCELLED',
    })
  }

  /**
   * Retries a generation (BE-4.23).
   */
  static async retryGeneration(
    userId: string,
    generationId: string
  ): Promise<{ id: string; status: GenerationStatus }> {
    const existing = await this.getGenerationById(userId, generationId)

    return this.createGeneration(userId, {
      jobDescription: existing.job_description_raw,
      templateId: existing.template_id || undefined,
      targetPageCount: existing.target_page_count,
      sourceGenerationId: existing.id,
    })
  }

  /**
   * Helper to compute ATS score from generation data, PDF and LaTeX code.
   */
  static async computeAtsScoreForGeneration(
    userId: string,
    generationId: string,
    context?: {
      latexCode?: string
      pdfBuffer?: Buffer
      tailoredContent?: TailoredContent
      extractedKeywords?: Record<string, unknown>
    }
  ): Promise<AtsScoreResult> {
    const gen = await this.getGenerationById(userId, generationId)
    const latexCode = context?.latexCode || gen.latex_code || ''

    let pdfBuffer = context?.pdfBuffer
    if (!pdfBuffer && gen.status === 'completed') {
      pdfBuffer = (await StorageService.downloadGeneratedDocument(userId, generationId, 'pdf')) || undefined
    }

    let pdfInspection: PdfInspectionResult | undefined
    if (pdfBuffer && pdfBuffer.length > 0) {
      pdfInspection = await inspectPdfText(pdfBuffer)
    }

    const latexStructure = checkLatexStructure(latexCode)

    let resumeText = pdfInspection?.rawText || ''
    if (!resumeText) {
      const tailored = (context?.tailoredContent || gen.tailored_content || {}) as TailoredContent
      const parts: string[] = []
      if (tailored.summary) parts.push(tailored.summary)
      for (const exp of tailored.experience || []) {
        parts.push(exp.company, exp.title)
        for (const b of exp.bullets || []) parts.push(b.text)
      }
      for (const sk of tailored.skills || []) parts.push(sk.name)
      for (const p of tailored.projects || []) parts.push(p.title, p.description, ...(p.techStack || []))
      for (const ed of tailored.education || []) parts.push(ed.institution, ed.degree)
      resumeText = parts.join(' ')
    }

    const extracted = (context?.extractedKeywords || gen.extracted_keywords || {}) as Record<string, unknown>
    const keywords = {
      requiredSkills: (extracted.requiredSkills as string[]) || [],
      preferredSkills: (extracted.preferredSkills as string[]) || (extracted.bonusSkills as string[]) || [],
      domainKeywords: (extracted.domainKeywords as string[]) || [],
    }

    return calculateAtsScore({
      resumeText,
      keywords,
      latexStructure,
      pdfInspection,
    })
  }

  /**
   * Retrieves or computes ATS score for a completed generation (BE-5.07).
   */
  static async getAtsScore(userId: string, generationId: string): Promise<AtsScoreResult> {
    const gen = await this.getGenerationById(userId, generationId)
    if (gen.status !== 'completed') {
      throw AppError.badRequest(
        `Cannot retrieve ATS score for generation in status "${gen.status}". Generation must be completed.`,
        null,
        'GENERATION_NOT_COMPLETED'
      )
    }

    if (gen.ats_score) {
      return gen.ats_score as unknown as AtsScoreResult
    }

    if (gen.metadata?.ats_score) {
      return gen.metadata.ats_score as unknown as AtsScoreResult
    }

    const computed = await this.computeAtsScoreForGeneration(userId, generationId)
    await this.updateGeneration(generationId, {
      ats_score: computed as unknown as Record<string, unknown>,
      metadata: {
        ...gen.metadata,
        ats_score: computed,
      },
    })

    return computed
  }

  /**
   * Updates tailored resume sections with manual user edits (BE-5.09).
   * Automatically preserves original AI-generated content for reset functionality.
   */
  static async updateTailoredContent(
    userId: string,
    generationId: string,
    updates: Partial<TailoredContent>
  ): Promise<GenerationRecord> {
    const gen = await this.getGenerationById(userId, generationId)
    if (['extracting', 'tailoring', 'compiling'].includes(gen.status)) {
      throw AppError.badRequest(
        `Cannot edit resume content while generation is currently processing (${gen.status}).`,
        null,
        'GENERATION_IN_PROGRESS'
      )
    }

    const currentTailored = (gen.tailored_content || {}) as TailoredContent
    const originalContent =
      gen.original_tailored_content ||
      (gen.metadata?.original_tailored_content as Record<string, unknown>) ||
      currentTailored

    const updatedTailored: TailoredContent = {
      summary: updates.summary !== undefined ? updates.summary : (currentTailored.summary || ''),
      experience: updates.experience !== undefined ? updates.experience : (currentTailored.experience || []),
      education: updates.education !== undefined ? updates.education : (currentTailored.education || []),
      skills: updates.skills !== undefined ? updates.skills : (currentTailored.skills || []),
      projects: updates.projects !== undefined ? updates.projects : (currentTailored.projects || []),
    }

    return this.updateGeneration(generationId, {
      tailored_content: updatedTailored as unknown as Record<string, unknown>,
      original_tailored_content: originalContent as unknown as Record<string, unknown>,
      metadata: {
        ...gen.metadata,
        original_tailored_content: originalContent,
      },
    })
  }

  /**
   * Re-renders and compiles document with current tailored content without calling AI (BE-5.10).
   */
  static async rerenderGeneration(
    userId: string,
    generationId: string,
    options?: { templateId?: string }
  ): Promise<
    GenerationRecord & {
      pdfUrl?: string
      texUrl?: string
      compileAttempts: CompileAttemptRecord[]
    }
  > {
    const gen = await this.getGenerationById(userId, generationId)
    if (gen.status !== 'completed' && gen.status !== 'failed') {
      throw AppError.badRequest(
        `Cannot rerender document when status is "${gen.status}". Generation must be completed or failed.`,
        null,
        'INVALID_STATUS'
      )
    }

    const templateId = options?.templateId || gen.template_id || DEFAULT_SWE_TEMPLATE_ID
    const templateDetail = await TemplateService.getTemplateById(templateId, userId)
    const candidateProfile = await ProfileService.getFullProfile(userId)
    const tailored = (gen.tailored_content || {}) as TailoredContent

    const mergedProfileForRender: FullProfile = {
      ...candidateProfile,
      summary: tailored.summary || candidateProfile.summary,
      experience: (tailored.experience || []).map((exp) => ({
        ...exp,
        location: exp.location || '',
        endDate: exp.endDate || null,
        bullets: (exp.bullets || []).map((b) => ({ id: b.id, text: b.text })),
      })),
      education: (tailored.education || []).map((edu) => ({
        ...edu,
        startDate: edu.startDate || '2020-01',
        location: edu.location || '',
        endDate: edu.endDate ? edu.endDate : undefined,
      })),
      skills: (tailored.skills || []).map((s) => ({
        id: s.id,
        name: s.name,
        category: s.category,
      })),
      projects: (tailored.projects || []).map((p) => ({
        id: p.id,
        title: p.title,
        role: p.role || '',
        description: p.description,
        techStack: p.techStack || [],
      })),
    }

    const renderedLatex = renderTemplate(templateDetail.latexCode, mergedProfileForRender)
    const compileResult = await compileLatex(renderedLatex)

    let currentAttemptNumber = 1
    if (isMockMode()) {
      const attempts = mockCompileAttempts.get(generationId) || []
      currentAttemptNumber = attempts.length + 1
    } else {
      const { count } = await supabaseAdmin
        .from('compile_attempts')
        .select('*', { count: 'exact', head: true })
        .eq('generation_id', generationId)
      currentAttemptNumber = (count || 0) + 1
    }

    await this.recordCompileAttempt(
      generationId,
      currentAttemptNumber,
      compileResult.success ? 'success' : 'failed',
      renderedLatex,
      compileResult.success ? compileResult.pageCount : undefined,
      compileResult.success ? undefined : compileResult.errors,
      compileResult.success ? undefined : compileResult.rawLog.slice(0, 1000),
      compileResult.durationMs
    )

    if (!compileResult.success) {
      throw AppError.badRequest(
        `LaTeX compilation failed during rerender: ${compileResult.errors[0]?.message || 'Unknown compiler error'}`,
        { errors: compileResult.errors },
        'COMPILATION_FAILED'
      )
    }

    const pdfStored = await StorageService.uploadGeneratedDocument(
      userId,
      generationId,
      'pdf',
      compileResult.pdfBuffer,
      'application/pdf'
    )

    const texStored = await StorageService.uploadGeneratedDocument(
      userId,
      generationId,
      'tex',
      renderedLatex,
      'application/x-tex'
    )

    // Compute updated ATS score
    let atsScore: AtsScoreResult | null = null
    try {
      atsScore = await this.computeAtsScoreForGeneration(userId, generationId, {
        latexCode: renderedLatex,
        pdfBuffer: compileResult.pdfBuffer,
        tailoredContent: tailored,
      })
    } catch (atsErr) {
      logger.warn({ atsErr, generationId }, 'Non-fatal error computing ATS score on rerender')
    }

    await this.updateGeneration(generationId, {
      template_id: templateId,
      latex_code: renderedLatex,
      pdf_path: pdfStored.path,
      tex_path: texStored.path,
      page_count: compileResult.pageCount,
      status: 'completed',
      ats_score: atsScore as unknown as Record<string, unknown>,
      metadata: {
        ...gen.metadata,
        ats_score: atsScore,
      },
    })

    return this.getGenerationDetail(userId, generationId)
  }

  /**
   * Restores original AI-generated resume content and re-compiles documents (BE-5.11).
   */
  static async resetTailoredContent(
    userId: string,
    generationId: string
  ): Promise<
    GenerationRecord & {
      pdfUrl?: string
      texUrl?: string
      compileAttempts: CompileAttemptRecord[]
    }
  > {
    const gen = await this.getGenerationById(userId, generationId)
    const originalContent =
      gen.original_tailored_content ||
      (gen.metadata?.original_tailored_content as Record<string, unknown>) ||
      gen.tailored_content

    if (!originalContent) {
      throw AppError.badRequest('No original AI-tailored content found to restore.')
    }

    await this.updateGeneration(generationId, {
      tailored_content: originalContent,
    })

    return this.rerenderGeneration(userId, generationId)
  }

  /**
   * Main async pipeline orchestrator (BE-4.19).
   */
  static async runGeneration(generationId: string): Promise<void> {
    let gen: GenerationRecord | null = null

    if (isMockMode()) {
      gen = mockGenerations.get(generationId) || null
    } else {
      const { data } = await supabaseAdmin
        .from('generations')
        .select('*')
        .eq('id', generationId)
        .maybeSingle()
      gen = data as GenerationRecord | null
    }

    if (!gen) {
      logger.error({ generationId }, 'Generation not found to execute')
      return
    }

    if (gen.status === 'cancelled') {
      logger.info({ generationId }, 'Generation already cancelled, skipping run')
      return
    }

    const userId = gen.user_id

    try {
      // ----------------------------------------------------
      // STAGE 1: Initializing
      // ----------------------------------------------------
      await this.updateGeneration(generationId, {
        status: 'extracting',
        current_stage: 'extracting_job',
        progress: 10,
      })

      // Check cancellation
      if (await this.isCancelled(generationId)) return

      // ----------------------------------------------------
      // STAGE 2: AI Call #1 - Requirement Extraction (BE-4.11)
      // ----------------------------------------------------
      let requirements: JobRequirements
      if (isGroqConfigured()) {
        const extractResult = await runJson({
          systemPrompt: EXTRACT_V1_SYSTEM_PROMPT,
          userPrompt: buildExtractPrompt(gen.job_description_raw, {
            jobTitle: gen.job_title || undefined,
            company: gen.company_name || undefined,
          }),
          schema: jobRequirementsSchema,
        })

        requirements = jobRequirementsSchema.parse(extractResult.data)
        await this.logAiUsage(
          userId,
          generationId,
          'extract',
          extractResult.model,
          extractResult.usage,
          extractResult.totalLatencyMs
        )
      } else {
        requirements = jobRequirementsSchema.parse(
          heuristicJobExtractor(gen.job_description_raw, {
            jobTitle: gen.job_title || undefined,
            company: gen.company_name || undefined,
          })
        )
      }

      await this.updateGeneration(generationId, {
        job_title: requirements.jobTitle || gen.job_title,
        company_name: requirements.companyName || gen.company_name,
        extracted_keywords: requirements as unknown as Record<string, unknown>,
        current_stage: 'tailoring_content',
        status: 'tailoring',
        progress: 35,
      })

      if (await this.isCancelled(generationId)) return

      // ----------------------------------------------------
      // STAGE 3: AI Call #2 - Content Tailoring + Grounding + Remediation (BE-4.13 - BE-4.17)
      // ----------------------------------------------------
      const candidateProfile = await ProfileService.getFullProfile(userId)
      const sanitizedProfile = buildSanitizedProfile(candidateProfile)

      let tailored: TailoredContent
      if (isGroqConfigured()) {
        const tailorResult = await runJson({
          systemPrompt: TAILOR_V1_SYSTEM_PROMPT,
          userPrompt: buildTailorPrompt(sanitizedProfile, requirements),
          schema: tailoredContentSchema,
        })

        tailored = tailoredContentSchema.parse(tailorResult.data)
        await this.logAiUsage(
          userId,
          generationId,
          'tailor',
          tailorResult.model,
          tailorResult.usage,
          tailorResult.totalLatencyMs
        )
      } else {
        tailored = tailoredContentSchema.parse(heuristicTailorer(sanitizedProfile, requirements))
      }

      // Verify Traceability & Remediate (BE-4.15, BE-4.16)
      const { remediated, remediationNotes } = remediateTailoredContent(tailored, sanitizedProfile)

      // Build Change Summary (BE-4.17)
      const changeSummary = buildChangeSummary(
        sanitizedProfile,
        remediated,
        [...(requirements.requiredSkills || []), ...(requirements.domainKeywords || [])],
        remediationNotes
      )

      await this.updateGeneration(generationId, {
        tailored_content: remediated as unknown as Record<string, unknown>,
        original_tailored_content: remediated as unknown as Record<string, unknown>,
        change_summary: changeSummary as unknown as Record<string, unknown>,
        current_stage: 'rendering_latex',
        status: 'rendering',
        progress: 60,
        metadata: {
          ...gen.metadata,
          original_tailored_content: remediated as unknown as Record<string, unknown>,
        },
      })

      if (await this.isCancelled(generationId)) return

      // ----------------------------------------------------
      // STAGE 4: LaTeX Rendering (BE-3.16)
      // ----------------------------------------------------
      const templateId = gen.template_id || DEFAULT_SWE_TEMPLATE_ID
      const templateDetail = await TemplateService.getTemplateById(templateId, userId)

      // Merge candidate's verified contact/links with tailored content
      const mergedProfileForRender: FullProfile = {
        ...candidateProfile,
        summary: remediated.summary,
        experience: remediated.experience.map((exp) => ({
          ...exp,
          location: exp.location || '',
          endDate: exp.endDate || null,
          bullets: exp.bullets.map((b) => ({ id: b.id, text: b.text })),
        })),
        education: remediated.education.map((edu) => ({
          ...edu,
          startDate: edu.startDate || '2020-01',
          location: edu.location || '',
          endDate: edu.endDate ? edu.endDate : undefined,
        })),
        skills: remediated.skills.map((s) => ({
          id: s.id,
          name: s.name,
          category: s.category,
        })),
        projects: remediated.projects.map((p) => ({
          id: p.id,
          title: p.title,
          role: p.role || '',
          description: p.description,
          techStack: p.techStack || [],
        })),
      }

      let renderedLatex = renderTemplate(templateDetail.latexCode, mergedProfileForRender)

      await this.updateGeneration(generationId, {
        latex_code: renderedLatex,
        current_stage: 'compiling_pdf',
        status: 'compiling',
        progress: 75,
      })

      if (await this.isCancelled(generationId)) return

      // ----------------------------------------------------
      // STAGE 5: PDF Compilation with Auto-Fix & Page Limit Loop (BE-4.18, BE-4.23)
      // ----------------------------------------------------
      let compileAttempt = 1
      let compileResult: CompilerClientResult = await compileLatex(renderedLatex)

      await this.recordCompileAttempt(
        generationId,
        compileAttempt,
        compileResult.success ? 'success' : 'failed',
        renderedLatex,
        compileResult.success ? compileResult.pageCount : undefined,
        compileResult.success ? undefined : compileResult.errors,
        compileResult.success ? undefined : compileResult.rawLog.slice(0, 1000),
        compileResult.durationMs
      )

      // Auto-fixing loop if LaTeX syntax failed (up to 2 repair iterations, BE-4.23)
      let fixAttempts = 0
      while (!compileResult.success && fixAttempts < 2) {
        fixAttempts++
        compileAttempt++
        logger.warn(
          { generationId, fixAttempts, errors: compileResult.errors },
          'LaTeX compilation failed; triggering compile-fix loop'
        )

        if (isGroqConfigured()) {
          const fixAi = await runJson({
            systemPrompt: COMPILE_FIX_V1_SYSTEM_PROMPT,
            userPrompt: buildCompileFixPrompt(renderedLatex, compileResult.errors),
            schema: compileFixSchema,
          })

          renderedLatex = fixAi.data.fixedLatex
          await this.logAiUsage(
            userId,
            generationId,
            'compile_fix',
            fixAi.model,
            fixAi.usage,
            fixAi.totalLatencyMs
          )
        } else {
          // Heuristic syntax fixes: escape bare unescaped special characters
          renderedLatex = renderedLatex
            .replace(/(?<!\\)&/g, '\\&')
            .replace(/(?<!\\)%/g, '\\%')
            .replace(/(?<!\\)\$/g, '\\$')
            .replace(/(?<!\\)#/g, '\\#')
        }

        compileResult = await compileLatex(renderedLatex)

        await this.recordCompileAttempt(
          generationId,
          compileAttempt,
          compileResult.success ? 'success' : 'failed',
          renderedLatex,
          compileResult.success ? compileResult.pageCount : undefined,
          compileResult.success ? undefined : compileResult.errors,
          compileResult.success ? undefined : compileResult.rawLog.slice(0, 1000),
          compileResult.durationMs
        )
      }

      if (!compileResult.success) {
        throw AppError.badRequest(
          `LaTeX compilation failed after repair attempts: ${compileResult.errors[0]?.message || 'Unknown compiler error'}`,
          { errors: compileResult.errors }
        )
      }

      // Automated Page Limit Adjustment Loop (BE-4.18)
      const targetPageCount = gen.target_page_count || 1
      if (compileResult.pageCount > targetPageCount) {
        logger.info(
          { generationId, actualPages: compileResult.pageCount, targetPages: targetPageCount },
          'Document exceeded target page limit; executing page trimming loop'
        )

        // Adjustment Step 1: Trim lowest-priority bullet point from experience
        const trimmedExperiences = mergedProfileForRender.experience.map((exp) => {
          if (exp.bullets.length > 2) {
            return { ...exp, bullets: exp.bullets.slice(0, -1) }
          }
          return exp
        })

        const trimmedProfile: FullProfile = {
          ...mergedProfileForRender,
          experience: trimmedExperiences,
        }

        const trimmedLatex = renderTemplate(templateDetail.latexCode, trimmedProfile)
        const recompileResult = await compileLatex(trimmedLatex)

        if (recompileResult.success) {
          renderedLatex = trimmedLatex
          compileResult = recompileResult
          compileAttempt++
          await this.recordCompileAttempt(
            generationId,
            compileAttempt,
            'success',
            trimmedLatex,
            recompileResult.pageCount,
            undefined,
            'Trimmed bullets for page-limit adjustment',
            recompileResult.durationMs
          )
        }
      }

      // ----------------------------------------------------
      // STAGE 6: Saving Artifacts to Private Storage (BE-3.26)
      // ----------------------------------------------------
      await this.updateGeneration(generationId, {
        latex_code: renderedLatex,
        page_count: compileResult.pageCount,
        current_stage: 'saving_artifacts',
        progress: 90,
      })

      if (await this.isCancelled(generationId)) return

      const pdfStored = await StorageService.uploadGeneratedDocument(
        userId,
        generationId,
        'pdf',
        compileResult.pdfBuffer,
        'application/pdf'
      )

      const texStored = await StorageService.uploadGeneratedDocument(
        userId,
        generationId,
        'tex',
        renderedLatex,
        'application/x-tex'
      )

      // ----------------------------------------------------
      // STAGE 7: Completed (BE-4.19, BE-5.03)
      // ----------------------------------------------------
      let initialAtsScore: AtsScoreResult | null = null
      try {
        initialAtsScore = await this.computeAtsScoreForGeneration(userId, generationId, {
          latexCode: renderedLatex,
          pdfBuffer: compileResult.pdfBuffer,
          tailoredContent: remediated,
          extractedKeywords: requirements as unknown as Record<string, unknown>,
        })
      } catch (atsErr) {
        logger.warn({ atsErr, generationId }, 'Non-fatal error calculating initial ATS score')
      }

      await this.updateGeneration(generationId, {
        status: 'completed',
        current_stage: 'completed',
        progress: 100,
        pdf_path: pdfStored.path,
        tex_path: texStored.path,
        page_count: compileResult.pageCount,
        completed_at: new Date().toISOString(),
        ats_score: initialAtsScore as unknown as Record<string, unknown>,
        metadata: {
          ...gen.metadata,
          original_tailored_content: remediated as unknown as Record<string, unknown>,
          ats_score: initialAtsScore,
        },
      })

      logger.info(
        { generationId, pages: compileResult.pageCount },
        'Resume generation completed successfully'
      )
    } catch (err: unknown) {
      const error = err as Error
      logger.error({ generationId, error: error.message }, 'Resume generation failed')

      try {
        await this.updateGeneration(generationId, {
          status: 'failed',
          current_stage: 'failed',
          error_message: error.message || 'Generation failed',
          error_code: (error as AppError).code || 'GENERATION_FAILED',
        })
      } catch (updateErr) {
        logger.error({ updateErr, generationId }, 'Failed to record failed status in generation')
      }
    }
  }

  /**
   * Checks if generation was marked cancelled by user.
   */
  private static async isCancelled(generationId: string): Promise<boolean> {
    if (isMockMode()) {
      const g = mockGenerations.get(generationId)
      return g?.status === 'cancelled'
    }

    const { data } = await supabaseAdmin
      .from('generations')
      .select('status')
      .eq('id', generationId)
      .maybeSingle()

    return data?.status === 'cancelled'
  }

  /**
   * Crash recovery tasks run during server startup (BE-4.21).
   */
  static async recoverCrashedGenerations(): Promise<void> {
    logger.info('Running server crash recovery check for pending/in-flight generations')

    if (isMockMode()) {
      for (const [id, g] of mockGenerations.entries()) {
        if (['extracting', 'tailoring', 'rendering', 'compiling'].includes(g.status)) {
          mockGenerations.set(id, {
            ...g,
            status: 'failed',
            current_stage: 'failed',
            error_message: 'Generation was interrupted by a server restart. Please retry.',
            error_code: 'SERVER_RESTARTED',
          })
        } else if (g.status === 'queued') {
          enqueueGenerationJob(id, (gid) => GenerationService.runGeneration(gid))
        }
      }
      return
    }

    try {
      // 1. Mark in-flight jobs as failed
      const inFlightStatuses = ['extracting', 'tailoring', 'rendering', 'compiling']
      const { data: crashed } = await supabaseAdmin
        .from('generations')
        .select('id')
        .in('status', inFlightStatuses)

      if (crashed && crashed.length > 0) {
        logger.warn(
          { count: crashed.length },
          'Found in-flight crashed generations, marking failed'
        )
        for (const item of crashed) {
          await supabaseAdmin
            .from('generations')
            .update({
              status: 'failed',
              current_stage: 'failed',
              error_message: 'Generation was interrupted by a server restart. Please retry.',
              error_code: 'SERVER_RESTARTED',
              updated_at: new Date().toISOString(),
            })
            .eq('id', item.id)
        }
      }

      // 2. Re-queue queued jobs
      const { data: queued } = await supabaseAdmin
        .from('generations')
        .select('id')
        .eq('status', 'queued')

      if (queued && queued.length > 0) {
        logger.info({ count: queued.length }, 'Re-enqueuing queued generations after startup')
        for (const item of queued) {
          enqueueGenerationJob(item.id, (gid) => GenerationService.runGeneration(gid))
        }
      }
    } catch (err) {
      logger.error({ err }, 'Error during server generation recovery')
    }
  }

  /**
   * Helper to extract numeric ATS score from various schema formats.
   */
  private static extractNumericAtsScore(g: GenerationRecord): number | null {
    const ats = g.ats_score as Record<string, unknown> | number | null
    const meta = g.metadata as Record<string, unknown> | null
    const metaAts = meta?.ats_score as Record<string, unknown> | number | null

    if (typeof ats === 'number') return ats
    if (typeof (ats as Record<string, unknown>)?.score === 'number')
      return (ats as { score: number }).score
    if (typeof (ats as Record<string, unknown>)?.overallScore === 'number')
      return (ats as { overallScore: number }).overallScore

    if (typeof metaAts === 'number') return metaAts
    if (typeof (metaAts as Record<string, unknown>)?.score === 'number')
      return (metaAts as { score: number }).score
    if (typeof (metaAts as Record<string, unknown>)?.overallScore === 'number')
      return (metaAts as { overallScore: number }).overallScore

    return null
  }

  /**
   * Cursor-paginated history list with search and filtering (BE-6.01).
   */
  static async listResumes(
    userId: string,
    options: ListResumesOptions = {}
  ): Promise<ListResumesResult> {
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 50)
    const search = options.search?.trim().toLowerCase()
    const status = options.status?.trim()
    const templateId = options.templateId?.trim()

    if (isMockMode()) {
      let userGens = Array.from(mockGenerations.values()).filter((g) => g.user_id === userId)

      // Filtering
      if (status && status !== 'all') {
        userGens = userGens.filter((g) => g.status === status)
      }
      if (templateId) {
        userGens = userGens.filter((g) => g.template_id === templateId)
      }
      if (search) {
        userGens = userGens.filter((g) => {
          const title = (g.job_title || '').toLowerCase()
          const company = (g.company_name || '').toLowerCase()
          const raw = (g.job_description_raw || '').toLowerCase()
          return title.includes(search) || company.includes(search) || raw.includes(search)
        })
      }

      // Sort newest first
      userGens.sort(
        (a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id)
      )

      const totalCount = userGens.length

      // Cursor pagination
      let startIndex = 0
      if (options.cursor) {
        try {
          const raw = Buffer.from(options.cursor, 'base64url').toString('utf8')
          const parsed = JSON.parse(raw) as { createdAt: string; id: string }
          const foundIdx = userGens.findIndex(
            (g) =>
              g.created_at < parsed.createdAt ||
              (g.created_at === parsed.createdAt && g.id < parsed.id)
          )
          if (foundIdx !== -1) {
            startIndex = foundIdx
          } else {
            startIndex = userGens.length
          }
        } catch {
          // invalid cursor defaults to 0
        }
      }

      const slice = userGens.slice(startIndex, startIndex + limit + 1)
      const hasMore = slice.length > limit
      const pageItems = slice.slice(0, limit)

      let nextCursor: string | null = null
      if (hasMore && pageItems.length > 0) {
        const last = pageItems[pageItems.length - 1]!
        nextCursor = Buffer.from(
          JSON.stringify({ createdAt: last.created_at, id: last.id })
        ).toString('base64url')
      }

      const items: ResumeSummaryItem[] = pageItems.map((g) => {
        const numericAts = GenerationService.extractNumericAtsScore(g)
        return {
          id: g.id,
          jobTitle: g.job_title,
          companyName: g.company_name,
          status: g.status,
          currentStage: g.current_stage,
          progress: g.progress,
          templateId: g.template_id,
          pageCount: g.page_count,
          targetPageCount: g.target_page_count,
          atsScore: numericAts,
          atsScoreData: g.ats_score || null,
          hasPdf: !!g.pdf_path,
          hasTex: !!g.tex_path,
          createdAt: g.created_at,
          updatedAt: g.updated_at,
          completedAt: g.completed_at,
        }
      })

      return {
        items,
        nextCursor,
        hasMore,
        totalCount,
      }
    }

    // Supabase DB mode
    let query = supabaseAdmin
      .from('generations')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)

    if (status && status !== 'all') {
      query = query.eq('status', status)
    }
    if (templateId) {
      query = query.eq('template_id', templateId)
    }
    if (search) {
      query = query.or(
        `job_title.ilike.%${search}%,company_name.ilike.%${search}%,job_description_raw.ilike.%${search}%`
      )
    }

    if (options.cursor) {
      try {
        const raw = Buffer.from(options.cursor, 'base64url').toString('utf8')
        const parsed = JSON.parse(raw) as { createdAt: string; id: string }
        if (parsed?.createdAt) {
          query = query.lt('created_at', parsed.createdAt)
        }
      } catch {
        // ignore invalid cursor
      }
    }

    query = query.order('created_at', { ascending: false }).limit(limit + 1)

    const { data, count, error } = await query

    if (error) {
      logger.error({ error, userId }, 'Failed to list user resume generations')
      throw AppError.internal('Database error fetching resume history.')
    }

    const records = (data || []) as GenerationRecord[]
    const hasMore = records.length > limit
    const pageRecords = records.slice(0, limit)

    let nextCursor: string | null = null
    if (hasMore && pageRecords.length > 0) {
      const last = pageRecords[pageRecords.length - 1]!
      nextCursor = Buffer.from(
        JSON.stringify({ createdAt: last.created_at, id: last.id })
      ).toString('base64url')
    }

    const items: ResumeSummaryItem[] = pageRecords.map((g) => {
      const numericAts = GenerationService.extractNumericAtsScore(g)
      return {
        id: g.id,
        jobTitle: g.job_title,
        companyName: g.company_name,
        status: g.status,
        currentStage: g.current_stage,
        progress: g.progress,
        templateId: g.template_id,
        pageCount: g.page_count,
        targetPageCount: g.target_page_count,
        atsScore: numericAts,
        atsScoreData: g.ats_score || null,
        hasPdf: !!g.pdf_path,
        hasTex: !!g.tex_path,
        createdAt: g.created_at,
        updatedAt: g.updated_at,
        completedAt: g.completed_at,
      }
    })

    return {
      items,
      nextCursor,
      hasMore,
      totalCount: count ?? items.length,
    }
  }

  /**
   * Deletes resume and storage files with cascading cleanup (BE-6.03).
   */
  static async deleteResume(
    userId: string,
    generationId: string
  ): Promise<{ id: string; deleted: boolean }> {
    await this.getGenerationById(userId, generationId)

    try {
      await StorageService.deleteGeneratedFiles(userId, [generationId])
    } catch (err) {
      logger.warn({ err, userId, generationId }, 'Non-fatal error deleting storage files')
    }

    if (isMockMode()) {
      mockGenerations.delete(generationId)
      mockCompileAttempts.delete(generationId)
      return { id: generationId, deleted: true }
    }

    const { error } = await supabaseAdmin
      .from('generations')
      .delete()
      .eq('id', generationId)
      .eq('user_id', userId)

    if (error) {
      logger.error({ error, generationId }, 'Database error deleting generation')
      throw AppError.internal('Database error deleting generation.')
    }

    return { id: generationId, deleted: true }
  }

  /**
   * Generates short-lived signed URLs with sanitized filenames (BE-6.04).
   */
  static async getResumeDownloadUrl(
    userId: string,
    generationId: string,
    format: 'pdf' | 'tex' = 'pdf',
    expiresInSeconds = 300
  ): Promise<{
    downloadUrl: string
    fileName: string
    format: 'pdf' | 'tex'
    expiresIn: number
    expiresAt: string
  }> {
    const record = await this.getGenerationById(userId, generationId)

    if (record.status !== 'completed') {
      throw AppError.badRequest(
        `Cannot download resume in "${record.status}" status. Generation must be completed.`,
        null,
        'GENERATION_NOT_COMPLETED'
      )
    }

    let candidateName = 'Resume'
    try {
      const profile = await ProfileService.getFullProfile(userId)
      if (profile.fullName && profile.fullName.trim().length > 0) {
        candidateName = profile.fullName.trim()
      }
    } catch {
      // fallback
    }

    const jobPart = (record.job_title || record.company_name || 'Tailored').trim()
    const rawBaseName = `${candidateName}_${jobPart}_Resume`
    const sanitizedBase = rawBaseName
      .replace(/[^a-zA-Z0-9_\-\s]/g, '')
      .trim()
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 80)

    const fileName = `${sanitizedBase}.${format}`

    const downloadUrl = await StorageService.getSignedDownloadUrl(
      userId,
      generationId,
      format,
      expiresInSeconds
    )

    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString()

    return {
      downloadUrl,
      fileName,
      format,
      expiresIn: expiresInSeconds,
      expiresAt,
    }
  }

  /**
   * Reuses historical job description to queue a new generation request (BE-6.05).
   */
  static async reuseResume(
    userId: string,
    generationId: string,
    options?: {
      templateId?: string
      targetPageCount?: number
      jobDescription?: string
    }
  ): Promise<{ id: string; status: GenerationStatus; sourceGenerationId: string }> {
    const source = await this.getGenerationById(userId, generationId)

    const jobDescription = options?.jobDescription || source.job_description_raw
    const templateId = options?.templateId || source.template_id || undefined
    const targetPageCount = options?.targetPageCount ?? source.target_page_count ?? 1

    const newGen = await this.createGeneration(userId, {
      jobDescription,
      jobUrl: source.job_url || undefined,
      templateId,
      targetPageCount,
      sourceGenerationId: generationId,
    })

    return {
      id: newGen.id,
      status: newGen.status,
      sourceGenerationId: generationId,
    }
  }

  /**
   * Computes aggregate metrics for frontend dashboard (BE-6.06).
   */
  static async getDashboardSummary(userId: string): Promise<DashboardSummary> {
    let allGenerations: GenerationRecord[] = []

    if (isMockMode()) {
      allGenerations = Array.from(mockGenerations.values()).filter((g) => g.user_id === userId)
    } else {
      const { data, error } = await supabaseAdmin
        .from('generations')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })

      if (error) {
        logger.warn({ error, userId }, 'Failed to query dashboard generations from DB; falling back to local store')
        allGenerations = Array.from(mockGenerations.values()).filter((g) => g.user_id === userId)
      } else {
        allGenerations = (data || []) as GenerationRecord[]
      }
    }

    const totalResumes = allGenerations.length
    const completedResumes = allGenerations.filter((g) => g.status === 'completed').length
    const failedResumes = allGenerations.filter((g) => g.status === 'failed').length
    const inProgressResumes = allGenerations.filter((g) =>
      ['queued', 'extracting', 'tailoring', 'rendering', 'compiling'].includes(g.status)
    ).length

    // Average ATS Score
    const scoredGens: number[] = []
    for (const g of allGenerations) {
      const score = GenerationService.extractNumericAtsScore(g)
      if (typeof score === 'number') {
        scoredGens.push(score)
      }
    }
    let averageAtsScore: number | null = null
    if (scoredGens.length > 0) {
      const sum = scoredGens.reduce((acc, s) => acc + s, 0)
      averageAtsScore = Math.round((sum / scoredGens.length) * 10) / 10
    }

    // Daily Quota calculation
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const dailyUsed = allGenerations.filter((g) => g.created_at >= oneDayAgo).length
    const dailyLimit = env.GENERATION_DAILY_LIMIT
    const dailyRemaining = Math.max(0, dailyLimit - dailyUsed)

    // Top Keywords aggregation
    const keywordCounts = new Map<string, number>()
    for (const g of allGenerations) {
      const kw = g.extracted_keywords as Record<string, unknown> | null
      const list = [
        ...(Array.isArray(kw?.requiredSkills) ? (kw!.requiredSkills as string[]) : []),
        ...(Array.isArray(kw?.domainKeywords) ? (kw!.domainKeywords as string[]) : []),
      ]
      for (const item of list) {
        if (typeof item === 'string' && item.trim().length > 0) {
          const norm = item.trim()
          keywordCounts.set(norm, (keywordCounts.get(norm) || 0) + 1)
        }
      }
    }
    const topKeywords = Array.from(keywordCounts.entries())
      .map(([keyword, count]) => ({ keyword, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

    // Template usage breakdown
    const templateCounts = new Map<string, number>()
    for (const g of allGenerations) {
      const tid = g.template_id || 'tpl_default_swe'
      templateCounts.set(tid, (templateCounts.get(tid) || 0) + 1)
    }
    const templateUsage = Array.from(templateCounts.entries())
      .map(([templateId, count]) => ({ templateId, count }))
      .sort((a, b) => b.count - a.count)

    // Recent 5 resumes
    const sorted = [...allGenerations].sort((a, b) => b.created_at.localeCompare(a.created_at))
    const recentResumes = sorted.slice(0, 5).map((g) => {
      const numericAts = GenerationService.extractNumericAtsScore(g)
      return {
        id: g.id,
        jobTitle: g.job_title,
        companyName: g.company_name,
        company: g.company_name,
        status: g.status,
        progress: g.progress,
        pageCount: g.page_count,
        atsScore: numericAts,
        templateId: g.template_id || 'tpl_default_swe',
        createdAt: g.created_at,
      }
    })

    return {
      overview: {
        totalResumes,
        completedResumes,
        failedResumes,
        inProgressResumes,
        averageAtsScore,
      },
      quotas: {
        dailyUsed,
        dailyLimit,
        dailyRemaining,
      },
      topKeywords,
      templateUsage,
      recentResumes,
    }
  }

  /**
   * Helper for retention jobs: purges failed or cancelled generations older than cutoff (BE-6.08).
   */
  static async purgeStaleGenerations(olderThanDays = 30): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString()
    let purgedCount = 0

    if (isMockMode()) {
      for (const [id, g] of mockGenerations.entries()) {
        if (['failed', 'cancelled'].includes(g.status) && g.created_at < cutoff) {
          mockGenerations.delete(id)
          mockCompileAttempts.delete(id)
          purgedCount++
        }
      }
      return purgedCount
    }

    try {
      const { data: staleList } = await supabaseAdmin
        .from('generations')
        .select('id, user_id')
        .in('status', ['failed', 'cancelled'])
        .lt('created_at', cutoff)

      if (staleList && staleList.length > 0) {
        for (const item of staleList) {
          await StorageService.deleteGeneratedFiles(item.user_id, [item.id])
          await supabaseAdmin.from('generations').delete().eq('id', item.id)
          purgedCount++
        }
      }
    } catch (err) {
      logger.error({ err }, 'Error purging stale generations in retention job')
    }

    return purgedCount
  }

  /**
   * Accessor for mock generations map (useful in tests and retention jobs).
   */
  static getMockGenerationsMap(): Map<string, GenerationRecord> {
    return mockGenerations
  }
}
