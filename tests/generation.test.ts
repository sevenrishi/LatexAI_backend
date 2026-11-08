import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { app } from '../src/app.js'
import { generateTestToken } from './helpers/jwt.js'
import { GenerationService } from '../src/services/generation.service.js'
import { ProfileService } from '../src/services/profile.service.js'
import { setMockCompilerHandler } from '../src/latex/compilerClient.js'
import { SAMPLE_PROFILE } from '../src/latex/dataAdapter.js'
import { env } from '../src/config/env.js'

describe('Generation Pipeline & Lifecycle (BE-4.18 - BE-4.25)', () => {
  const userId = 'usr_gen_test_candidate'
  let token: string

  beforeEach(async () => {
    GenerationService.clearMockData()
    ProfileService.clearMockData()
    setMockCompilerHandler(null)
    token = await generateTestToken({ sub: userId })

    // Seed mock profile with sample profile data for completeness
    await ProfileService.updateProfileRoot(userId, {
      fullName: SAMPLE_PROFILE.fullName,
      headline: SAMPLE_PROFILE.headline,
      phone: SAMPLE_PROFILE.phone,
      location: SAMPLE_PROFILE.location,
      summary: SAMPLE_PROFILE.summary,
    })

    // Seed experience & education
    await ProfileService.createSectionItem(userId, 'experience', {
      company: 'Veloce Cloud Systems',
      title: 'Senior Software Engineer',
      startDate: '2022-01',
      current: true,
      bullets: [
        { id: 'b1', text: 'Built scalable Kafka streaming services.' },
        { id: 'b2', text: 'Optimized Docker microservices.' },
      ],
    })

    await ProfileService.createSectionItem(userId, 'education', {
      institution: 'UC Berkeley',
      degree: 'BS Computer Science',
      startDate: '2018-09',
      endDate: '2022-05',
    })
  })

  it('POST /api/v1/generate rejects if profile completeness is below threshold', async () => {
    const emptyUserId = 'usr_empty_profile_user'
    const emptyToken = await generateTestToken({ sub: emptyUserId })

    ProfileService.setMockStore(emptyUserId, {
      root: { full_name: '', phone: '', location: '', summary: '' },
      experience: [],
      education: [],
      skills: [],
      projects: [],
      certifications: [],
    })

    const res = await request(app)
      .post('/api/v1/generate')
      .set('Authorization', `Bearer ${emptyToken}`)
      .send({
        jobDescription:
          'Senior Software Engineer required with 5+ years of experience in distributed systems.',
      })

    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
    expect(res.body.error.code).toBe('PROFILE_INCOMPLETE')
  })

  it('POST /api/v1/generate returns 202 Accepted and starts background queue', async () => {
    const res = await request(app)
      .post('/api/v1/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({
        jobDescription:
          'Seeking Senior Full Stack Developer proficient in TypeScript, React, Node.js, and PostgreSQL for financial services app.',
      })

    expect(res.status).toBe(202)
    expect(res.body.success).toBe(true)
    expect(res.body.data.id).toBeDefined()
    expect(res.body.data.status).toBe('queued')
  })

  it('GET /api/v1/generate/:id/status allows polling current generation progress', async () => {
    const createRes = await request(app)
      .post('/api/v1/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({
        jobDescription:
          'Senior Backend Engineer experienced with Go, Kubernetes, and PostgreSQL microservices.',
      })

    const generationId = createRes.body.data.id

    const statusRes = await request(app)
      .get(`/api/v1/generate/${generationId}/status`)
      .set('Authorization', `Bearer ${token}`)

    expect(statusRes.status).toBe(200)
    expect(statusRes.body.success).toBe(true)
    expect(statusRes.body.data.id).toBe(generationId)
    expect(['queued', 'extracting', 'tailoring', 'rendering', 'compiling', 'completed']).toContain(
      statusRes.body.data.status
    )
  })

  it('runs complete generation orchestrator through all pipeline stages to completed status', async () => {
    const generationResult = await GenerationService.createGeneration(userId, {
      jobDescription:
        'Staff Software Engineer role: Deep expertise in Kafka, TypeScript, PostgreSQL, and scalable microservices architecture.',
    })

    const generationId = generationResult.id

    // Directly invoke runner synchronously to test all pipeline stages
    await GenerationService.runGeneration(generationId)

    const detail = await GenerationService.getGenerationDetail(userId, generationId)
    expect(detail.status).toBe('completed')
    expect(detail.progress).toBe(100)
    expect(detail.page_count).toBeGreaterThanOrEqual(1)
    expect(detail.pdf_path).toBeDefined()
    expect(detail.tex_path).toBeDefined()
    expect(detail.pdfUrl).toBeDefined()
    expect(detail.compileAttempts.length).toBeGreaterThan(0)
    expect(detail.compileAttempts[0]!.status).toBe('success')
  })

  it('handles compile-error auto-fix recovery loop when compiler errors occur', async () => {
    let callCount = 0

    // Mock compiler to fail on first call and succeed on second call
    setMockCompilerHandler((_latex: string) => {
      callCount++
      if (callCount === 1) {
        return {
          success: false,
          errors: [{ message: 'Undefined control sequence \\unknowncmd', line: 12 }],
          rawLog: '! Undefined control sequence.',
          durationMs: 50,
        }
      }
      return {
        success: true,
        pdfBuffer: Buffer.from('%PDF-1.4 mock pdf', 'utf-8'),
        pageCount: 1,
        durationMs: 40,
      }
    })

    const generationResult = await GenerationService.createGeneration(userId, {
      jobDescription:
        'Senior Site Reliability Engineer with Kubernetes, Terraform, and Go monitoring pipeline experience.',
    })

    const generationId = generationResult.id
    await GenerationService.runGeneration(generationId)

    const detail = await GenerationService.getGenerationDetail(userId, generationId)
    expect(detail.status).toBe('completed')
    expect(detail.compileAttempts.length).toBeGreaterThanOrEqual(2)
    expect(detail.compileAttempts[0]!.status).toBe('failed')
    expect(detail.compileAttempts[1]!.status).toBe('success')
  })

  it('POST /api/v1/generate/:id/cancel cancels an in-progress generation', async () => {
    const createRes = await request(app)
      .post('/api/v1/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({
        jobDescription:
          'Senior DevOps Architect with Terraform and AWS multi-region infrastructure expertise.',
      })

    const generationId = createRes.body.data.id

    const cancelRes = await request(app)
      .post(`/api/v1/generate/${generationId}/cancel`)
      .set('Authorization', `Bearer ${token}`)

    expect(cancelRes.status).toBe(200)
    expect(cancelRes.body.success).toBe(true)
    expect(cancelRes.body.data.status).toBe('cancelled')
  })

  it('POST /api/v1/generate/:id/retry initiates a new generation with historical inputs', async () => {
    const createRes = await request(app)
      .post('/api/v1/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({
        jobDescription:
          'Principal Software Architect leading distributed cloud storage development.',
      })

    const generationId = createRes.body.data.id

    const retryRes = await request(app)
      .post(`/api/v1/generate/${generationId}/retry`)
      .set('Authorization', `Bearer ${token}`)

    expect(retryRes.status).toBe(202)
    expect(retryRes.body.success).toBe(true)
    expect(retryRes.body.data.id).toBeDefined()
    expect(retryRes.body.data.id).not.toBe(generationId)
    expect(retryRes.body.data.status).toBe('queued')
  })

  it('enforces daily generation quota limit', async () => {
    const originalLimit = env.GENERATION_DAILY_LIMIT
    ;(env as { GENERATION_DAILY_LIMIT: number }).GENERATION_DAILY_LIMIT = 2

    try {
      // 1st generation
      await GenerationService.createGeneration(userId, {
        jobDescription:
          'Software engineer position with 3+ years experience in Node.js and TypeScript.',
      })

      // 2nd generation
      await GenerationService.createGeneration(userId, {
        jobDescription:
          'Backend engineer position with 3+ years experience in Python and PostgreSQL.',
      })

      // 3rd generation should exceed limit
      await expect(
        GenerationService.createGeneration(userId, {
          jobDescription: 'Full stack engineer position with 3+ years experience in React and Go.',
        })
      ).rejects.toThrow('Daily generation limit')
    } finally {
      ;(env as { GENERATION_DAILY_LIMIT: number }).GENERATION_DAILY_LIMIT = originalLimit
    }
  })
})
