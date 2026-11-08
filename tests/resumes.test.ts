import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { app } from '../src/app.js'
import { generateTestToken } from './helpers/jwt.js'
import { GenerationService, type GenerationRecord } from '../src/services/generation.service.js'
import { ProfileService } from '../src/services/profile.service.js'
import { StorageService } from '../src/services/storage.service.js'
import { RetentionService } from '../src/services/retention.service.js'
import { setMockCompilerHandler } from '../src/latex/compilerClient.js'

describe('Phase J — History, Downloads, Dashboard, & Hardening', () => {
  const userId = 'usr_phase_j_tester_123'
  let token: string

  function seedMockGeneration(id: string, overrides: Partial<GenerationRecord> = {}): GenerationRecord {
    const record: GenerationRecord = {
      id,
      user_id: userId,
      template_id: 'tpl_default_swe',
      source_generation_id: null,
      status: 'completed',
      progress: 100,
      current_stage: 'completed',
      job_title: 'Staff Architect',
      company_name: 'Stripe',
      job_description_raw:
        'We are hiring a Senior Software Engineer with distributed systems and Go expertise.',
      job_url: null,
      extracted_keywords: {},
      tailored_content: {},
      change_summary: {},
      latex_code: '\\documentclass{article}\\begin{document}Resume\\end{document}',
      pdf_path: `${userId}/${id}.pdf`,
      tex_path: `${userId}/${id}.tex`,
      page_count: 1,
      target_page_count: 1,
      error_message: null,
      error_code: null,
      metadata: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      ats_score: { score: 90 },
      ...overrides,
    }
    GenerationService.getMockGenerationsMap().set(id, record)
    return record
  }

  beforeEach(async () => {
    GenerationService.clearMockData()
    ProfileService.clearMockData(userId)
    StorageService.clearMockStorage()
    token = await generateTestToken({ sub: userId, email: 'tester_phase_j@example.com' })

    // Pre-populate profile
    ProfileService.setMockStore(userId, {
      root: {
        id: userId,
        full_name: 'Jordan Belfort',
        email: 'tester_phase_j@example.com',
      },
      skills: [{ id: 's1', name: 'TypeScript', category: 'Languages' }],
    })

    setMockCompilerHandler(async () => ({
      success: true,
      pdfBuffer: Buffer.from('%PDF-1.4 mock content'),
      pageCount: 1,
      durationMs: 45,
      rawLog: 'Output written on document.pdf (1 page).',
    }))
  })

  describe('BE-6.01 - GET /api/v1/resumes history list & filtering', () => {
    it('returns empty list when user has no generations', async () => {
      const res = await request(app)
        .get('/api/v1/resumes')
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.items).toEqual([])
      expect(res.body.data.totalCount).toBe(0)
      expect(res.body.data.hasMore).toBe(false)
    })

    it('returns cursor-paginated list with search and status filters', async () => {
      // Deterministically seed 3 generations
      seedMockGeneration('gen-1', {
        job_title: 'Senior Backend Engineer',
        company_name: 'Stripe',
        status: 'completed',
        created_at: '2026-03-03T10:00:00Z',
        ats_score: { score: 92 },
      })

      seedMockGeneration('gen-2', {
        job_title: 'Staff Frontend Architect',
        company_name: 'Vercel',
        status: 'completed',
        created_at: '2026-03-02T10:00:00Z',
        ats_score: { score: 85 },
      })

      seedMockGeneration('gen-3', {
        job_title: 'DevOps Engineer',
        company_name: 'Datadog',
        status: 'failed',
        created_at: '2026-03-01T10:00:00Z',
      })

      // Query all with limit 2
      const res = await request(app)
        .get('/api/v1/resumes?limit=2')
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.data.items.length).toBe(2)
      expect(res.body.data.hasMore).toBe(true)
      expect(res.body.data.nextCursor).toBeDefined()
      expect(res.body.data.totalCount).toBe(3)

      // Query with cursor
      const cursorRes = await request(app)
        .get(`/api/v1/resumes?limit=2&cursor=${res.body.data.nextCursor}`)
        .set('Authorization', `Bearer ${token}`)

      expect(cursorRes.status).toBe(200)
      expect(cursorRes.body.data.items.length).toBe(1)
      expect(cursorRes.body.data.hasMore).toBe(false)

      // Query with search filter
      const searchRes = await request(app)
        .get('/api/v1/resumes?search=Stripe')
        .set('Authorization', `Bearer ${token}`)

      expect(searchRes.status).toBe(200)
      expect(searchRes.body.data.items.length).toBe(1)
      expect(searchRes.body.data.items[0].companyName).toBe('Stripe')

      // Query with status filter
      const statusRes = await request(app)
        .get('/api/v1/resumes?status=failed')
        .set('Authorization', `Bearer ${token}`)

      expect(statusRes.status).toBe(200)
      expect(statusRes.body.data.items.length).toBe(1)
      expect(statusRes.body.data.items[0].status).toBe('failed')
    })
  })

  describe('BE-6.02 - GET /api/v1/resumes/:id detail retrieval', () => {
    it('retrieves full resume details including download URLs and compile logs', async () => {
      const gen = seedMockGeneration('gen-detail-1', {
        status: 'completed',
        job_title: 'Platform Engineer',
        company_name: 'Uber',
        pdf_path: `${userId}/gen-detail-1.pdf`,
        tex_path: `${userId}/gen-detail-1.tex`,
        ats_score: { score: 89 },
      })

      const res = await request(app)
        .get(`/api/v1/resumes/${gen.id}`)
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.id).toBe(gen.id)
      expect(res.body.data.job_title).toBe('Platform Engineer')
      expect(res.body.data.pdfUrl).toBeDefined()
      expect(res.body.data.texUrl).toBeDefined()
    })

    it('returns 404 for non-existent or unauthorized resume', async () => {
      const res = await request(app)
        .get('/api/v1/resumes/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(404)
    })
  })

  describe('BE-6.03 - DELETE /api/v1/resumes/:id', () => {
    it('deletes resume record and cascades storage cleanup', async () => {
      const gen = seedMockGeneration('gen-del-1', { status: 'completed' })

      // Upload mock file
      await StorageService.uploadGeneratedDocument(
        userId,
        gen.id,
        'pdf',
        Buffer.from('pdf data'),
        'application/pdf'
      )

      const deleteRes = await request(app)
        .delete(`/api/v1/resumes/${gen.id}`)
        .set('Authorization', `Bearer ${token}`)

      expect(deleteRes.status).toBe(200)
      expect(deleteRes.body.data.deleted).toBe(true)

      // Verify resume no longer exists
      const getRes = await request(app)
        .get(`/api/v1/resumes/${gen.id}`)
        .set('Authorization', `Bearer ${token}`)

      expect(getRes.status).toBe(404)
    })
  })

  describe('BE-6.04 - GET /api/v1/resumes/:id/download', () => {
    it('provides short-lived signed URL with sanitized candidate filename', async () => {
      const gen = seedMockGeneration('gen-dl-1', {
        status: 'completed',
        job_title: 'Lead Architect',
        company_name: 'Apple',
        pdf_path: `${userId}/gen-dl-1.pdf`,
      })

      const res = await request(app)
        .get(`/api/v1/resumes/${gen.id}/download?format=pdf&expiresIn=600`)
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.downloadUrl).toBeDefined()
      expect(res.body.data.format).toBe('pdf')
      expect(res.body.data.expiresIn).toBe(600)
      // Check sanitized filename containing name and job
      expect(res.body.data.fileName).toMatch(/Jordan_Belfort_Lead_Architect.*\.pdf/)
    })

    it('rejects download if generation is not completed', async () => {
      const gen = seedMockGeneration('gen-dl-queued', {
        status: 'queued',
      })

      const res = await request(app)
        .get(`/api/v1/resumes/${gen.id}/download?format=pdf`)
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('GENERATION_NOT_COMPLETED')
    })
  })

  describe('BE-6.05 - POST /api/v1/resumes/:id/reuse', () => {
    it('creates and queues a new generation from historical job requirements', async () => {
      const gen = seedMockGeneration('gen-reuse-src', {
        status: 'completed',
        job_title: 'Go Engineer',
        company_name: 'Google',
        job_description_raw:
          'We need a Staff Go Developer with strong distributed systems and gRPC experience.',
      })

      const reuseRes = await request(app)
        .post(`/api/v1/resumes/${gen.id}/reuse`)
        .set('Authorization', `Bearer ${token}`)
        .send({ targetPageCount: 2 })

      expect(reuseRes.status).toBe(202)
      expect(reuseRes.body.success).toBe(true)
      expect(reuseRes.body.data.id).toBeDefined()
      expect(reuseRes.body.data.status).toBe('queued')
      expect(reuseRes.body.data.sourceGenerationId).toBe(gen.id)

      // Verify the new generation has historical job description
      const newDetail = await GenerationService.getGenerationById(userId, reuseRes.body.data.id)
      expect(newDetail.job_description_raw).toBe(gen.job_description_raw)
      expect(newDetail.target_page_count).toBe(2)
      expect(newDetail.source_generation_id).toBe(gen.id)
    })
  })

  describe('BE-6.06 - GET /api/v1/dashboard/summary', () => {
    it('computes aggregate metrics, quotas, top keywords, and recent resumes', async () => {
      seedMockGeneration('gen-dash-1', {
        status: 'completed',
        ats_score: { score: 90 },
        extracted_keywords: {
          requiredSkills: ['React', 'TypeScript', 'Redux'],
        },
      })

      seedMockGeneration('gen-dash-2', {
        status: 'completed',
        ats_score: { score: 80 },
        extracted_keywords: {
          requiredSkills: ['Node.js', 'TypeScript', 'PostgreSQL'],
        },
      })

      const res = await request(app)
        .get('/api/v1/dashboard/summary')
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      const data = res.body.data

      expect(data.overview.totalResumes).toBe(2)
      expect(data.overview.completedResumes).toBe(2)
      expect(data.overview.failedResumes).toBe(0)
      expect(data.overview.averageAtsScore).toBe(85) // (90 + 80) / 2

      expect(data.quotas.dailyUsed).toBe(2)
      expect(data.quotas.dailyLimit).toBe(20)
      expect(data.quotas.dailyRemaining).toBe(18)

      // Top keywords should have TypeScript count = 2
      const tsKw = data.topKeywords.find((k: { keyword: string }) => k.keyword === 'TypeScript')
      expect(tsKw).toBeDefined()
      expect(tsKw.count).toBe(2)

      expect(data.recentResumes.length).toBe(2)
    })
  })

  describe('BE-6.07 - GET /api/v1/auth/export', () => {
    it('exports complete user data archive including full profile and resume records', async () => {
      seedMockGeneration('gen-exp-1', { status: 'completed' })

      const res = await request(app)
        .get('/api/v1/auth/export')
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.format).toBe('JSON_ARCHIVE_V1')
      expect(res.body.data.user).toBeDefined()
      expect(res.body.data.profile).toBeDefined()
      expect(res.body.data.resumes.length).toBeGreaterThanOrEqual(1)
      expect(res.body.data.counts).toBeDefined()
    })
  })

  describe('BE-6.08 - Retention Background Cleanup', () => {
    it('purges stale failed generations and orphaned files', async () => {
      // Create a stale failed generation older than 35 days
      const oldDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString()
      const oldGen = seedMockGeneration('gen-old-failed', {
        status: 'failed',
        created_at: oldDate,
      })

      // Add orphaned file into mock storage with an unknown ID
      await StorageService.uploadGeneratedDocument(
        userId,
        'orphan-gen-id',
        'pdf',
        Buffer.from('orphan'),
        'application/pdf'
      )

      const result = await RetentionService.runRetentionCleanup({ staleDays: 30 })

      expect(result.staleGenerationsPurged).toBe(1)
      expect(result.orphanedStorageFilesPurged).toBe(1)

      // Verify old generation is gone
      const allResumes = await GenerationService.listResumes(userId)
      expect(allResumes.items.find((r) => r.id === oldGen.id)).toBeUndefined()
    })
  })

  describe('BE-7.04 & BE-7.05 - Telemetry, Health, and OpenAPI Documentation', () => {
    it('returns metrics and queue telemetry on /metrics and /health/ready', async () => {
      const readyRes = await request(app).get('/health/ready')
      expect(readyRes.status).toBe(200)
      expect(readyRes.body.checks.queue).toBeDefined()
      expect(readyRes.body.checks.queue.status).toBe('healthy')

      const metricsRes = await request(app).get('/metrics')
      expect(metricsRes.status).toBe(200)
      expect(metricsRes.body.success).toBe(true)
      expect(metricsRes.body.data.queue).toBeDefined()
    })

    it('serves OpenAPI 3.1 specification at /api/v1/docs/openapi.json', async () => {
      const res = await request(app).get('/api/v1/docs/openapi.json')
      expect(res.status).toBe(200)
      expect(res.body.openapi).toBe('3.1.0')
      expect(res.body.info.title).toContain('LatexAI')
      expect(res.body.paths['/resumes']).toBeDefined()
      expect(res.body.paths['/dashboard/summary']).toBeDefined()
    })

    it('serves interactive documentation HTML at /api/v1/docs', async () => {
      const res = await request(app).get('/api/v1/docs')
      expect(res.status).toBe(200)
      expect(res.headers['content-type']).toContain('text/html')
      expect(res.text).toContain('LatexAI Backend API Documentation')
    })
  })
})
