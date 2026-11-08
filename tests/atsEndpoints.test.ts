import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { app } from '../src/app.js'
import { generateTestToken } from './helpers/jwt.js'
import { GenerationService } from '../src/services/generation.service.js'
import { ProfileService } from '../src/services/profile.service.js'
import { StorageService } from '../src/services/storage.service.js'
import { setMockCompilerHandler } from '../src/latex/compilerClient.js'
import { SAMPLE_PROFILE } from '../src/latex/dataAdapter.js'

// Minimal synthetic PDF with selectable text
const SAMPLE_VALID_PDF = Buffer.from(
  `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length 380 >>
stream
BT
/F1 12 Tf
50 720 Td
(Alex Rivera - alex@example.com - 555-0199 - linkedin.com/in/alexrivera) Tj
/F1 10 Tf
0 -25 Td
(Professional Summary: Senior Software Engineer with 8 years building distributed systems in Go, TypeScript, React, and PostgreSQL.) Tj
0 -25 Td
(Work Experience: Staff Engineer at CloudCorp leading architectural migrations, Docker containerization, and Kafka event streaming.) Tj
0 -25 Td
(Education: BS in Computer Science from UC Berkeley.) Tj
0 -25 Td
(Technical Skills: Go, TypeScript, React, Node.js, Kubernetes, PostgreSQL, Kafka, CI/CD, Docker, Redis.) Tj
ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
00000000115 00000 n 
00000000246 00000 n 
00000000679 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
754
%%EOF`
)

describe('ATS & Review Enhancements Endpoints (BE-5.07 - BE-5.11)', () => {
  const userId = 'usr_ats_test_candidate'
  let token: string

  beforeEach(async () => {
    GenerationService.clearMockData()
    ProfileService.clearMockData()
    StorageService.clearMockStorage()
    setMockCompilerHandler(null)
    token = await generateTestToken({ sub: userId })

    // Seed profile
    await ProfileService.updateProfileRoot(userId, {
      fullName: SAMPLE_PROFILE.fullName,
      headline: SAMPLE_PROFILE.headline,
      phone: SAMPLE_PROFILE.phone,
      location: SAMPLE_PROFILE.location,
      summary: SAMPLE_PROFILE.summary,
    })

    await ProfileService.createSectionItem(userId, 'experience', {
      company: 'Veloce Cloud Systems',
      title: 'Senior Software Engineer',
      startDate: '2022-01',
      current: true,
      bullets: [
        { id: 'b1', text: 'Built scalable Kafka streaming services.' },
        { id: 'b2', text: 'Optimized Docker microservices and PostgreSQL pipelines.' },
      ],
    })

    await ProfileService.createSectionItem(userId, 'education', {
      institution: 'UC Berkeley',
      degree: 'BS Computer Science',
      startDate: '2018-09',
      endDate: '2022-05',
    })
  })

  // -----------------------------------------------------------------
  // BE-5.07: GET /generate/:id/ats-score
  // -----------------------------------------------------------------
  describe('GET /api/v1/generate/:id/ats-score', () => {
    it('requires authentication', async () => {
      const res = await request(app).get('/api/v1/generate/any-id/ats-score')
      expect(res.status).toBe(401)
    })

    it('rejects if generation is not completed', async () => {
      const gen = await GenerationService.createGeneration(userId, {
        jobDescription: 'Software Engineer skilled in Go and PostgreSQL for cloud microservices.',
      })

      const res = await request(app)
        .get(`/api/v1/generate/${gen.id}/ats-score`)
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(400)
      expect(res.body.success).toBe(false)
      expect(res.body.error.code).toBe('GENERATION_NOT_COMPLETED')
    })

    it('returns 200 with full ATS score object for completed generation', async () => {
      const gen = await GenerationService.createGeneration(userId, {
        jobDescription: 'Senior Software Engineer required with Kafka, Docker, and PostgreSQL experience.',
      })

      await GenerationService.runGeneration(gen.id)

      const res = await request(app)
        .get(`/api/v1/generate/${gen.id}/ats-score`)
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.score).toBeDefined()
      expect(res.body.data.grade).toBeDefined()
      expect(res.body.data.breakdown).toBeDefined()
      expect(res.body.data.keywordAnalysis).toBeDefined()
      expect(res.body.data.formatChecks).toBeDefined()
      expect(Array.isArray(res.body.data.suggestions)).toBe(true)
    })
  })

  // -----------------------------------------------------------------
  // BE-5.08: POST /pdf/inspect
  // -----------------------------------------------------------------
  describe('POST /api/v1/pdf/inspect', () => {
    it('requires authentication', async () => {
      const res = await request(app).post('/api/v1/pdf/inspect')
      expect(res.status).toBe(401)
    })

    it('rejects when no file or base64 is provided', async () => {
      const res = await request(app)
        .post('/api/v1/pdf/inspect')
        .set('Authorization', `Bearer ${token}`)
        .send({})

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('MISSING_PDF_FILE')
    })

    it('rejects corrupted or non-PDF files', async () => {
      const res = await request(app)
        .post('/api/v1/pdf/inspect')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', Buffer.from('Plain text file content', 'utf8'), 'resume.txt')

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('INVALID_FILE_TYPE')
    })

    it('audits valid PDF via multipart file upload with optional job description', async () => {
      const res = await request(app)
        .post('/api/v1/pdf/inspect')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', SAMPLE_VALID_PDF, 'resume.pdf')
        .field('jobDescription', 'Looking for Senior Engineer with Go, TypeScript, Docker, and Kafka skills.')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.audit.textExtractable).toBe(true)
      expect(res.body.data.audit.detectedSections).toContain('Experience')
      expect(res.body.data.atsScore.score).toBeGreaterThanOrEqual(70)
      expect(res.body.data.atsScore.grade).toBeDefined()
    })

    it('audits valid PDF via JSON base64 payload with keywords', async () => {
      const res = await request(app)
        .post('/api/v1/pdf/inspect')
        .set('Authorization', `Bearer ${token}`)
        .send({
          pdfBase64: SAMPLE_VALID_PDF.toString('base64'),
          keywords: ['Go', 'TypeScript', 'Kubernetes'],
        })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.audit.pageCount).toBe(1)
      expect(res.body.data.atsScore.keywordAnalysis.matchedCount).toBeGreaterThanOrEqual(2)
    })
  })

  // -----------------------------------------------------------------
  // BE-5.09: PATCH /generate/:id/content
  // -----------------------------------------------------------------
  describe('PATCH /api/v1/generate/:id/content', () => {
    it('updates tailored resume sections and preserves original version', async () => {
      const gen = await GenerationService.createGeneration(userId, {
        jobDescription: 'Backend Engineer: PostgreSQL and Kafka specialist.',
      })
      await GenerationService.runGeneration(gen.id)

      const updatedSummary = 'Custom refined executive summary crafted by candidate.'
      const res = await request(app)
        .patch(`/api/v1/generate/${gen.id}/content`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          summary: updatedSummary,
          skills: [
            { id: 's1', name: 'Go', category: 'Languages', isHighlighted: true },
            { id: 's2', name: 'Kafka', category: 'Streaming' },
          ],
        })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.tailored_content.summary).toBe(updatedSummary)
      expect(res.body.data.original_tailored_content).toBeDefined()
      expect(res.body.data.original_tailored_content.summary).not.toBe(updatedSummary)
    })
  })

  // -----------------------------------------------------------------
  // BE-5.10: POST /generate/:id/rerender
  // -----------------------------------------------------------------
  describe('POST /api/v1/generate/:id/rerender', () => {
    it('re-renders and compiles document with updated tailored content without calling AI', async () => {
      const gen = await GenerationService.createGeneration(userId, {
        jobDescription: 'Software Engineer with Go, PostgreSQL, and scalable microservices experience.',
      })
      await GenerationService.runGeneration(gen.id)

      // Edit content first
      await GenerationService.updateTailoredContent(userId, gen.id, {
        summary: 'Expert Go and distributed streaming systems engineer.',
      })

      const res = await request(app)
        .post(`/api/v1/generate/${gen.id}/rerender`)
        .set('Authorization', `Bearer ${token}`)
        .send({})

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.status).toBe('completed')
      expect(res.body.data.latex_code).toContain('Expert Go and distributed streaming')
      expect(res.body.data.pdfUrl).toBeDefined()
      expect(res.body.data.compileAttempts.length).toBeGreaterThan(1)
    })
  })

  // -----------------------------------------------------------------
  // BE-5.11: POST /generate/:id/content/reset
  // -----------------------------------------------------------------
  describe('POST /api/v1/generate/:id/content/reset', () => {
    it('restores original AI-tailored content and re-renders document', async () => {
      const gen = await GenerationService.createGeneration(userId, {
        jobDescription: 'Distributed systems engineer with Kafka and Docker.',
      })
      await GenerationService.runGeneration(gen.id)

      const originalDetail = await GenerationService.getGenerationDetail(userId, gen.id)
      const originalSummary = (originalDetail.tailored_content as { summary: string }).summary

      // Perform a manual edit
      await GenerationService.updateTailoredContent(userId, gen.id, {
        summary: 'Temporary manual summary edit.',
      })

      const editedDetail = await GenerationService.getGenerationDetail(userId, gen.id)
      expect((editedDetail.tailored_content as { summary: string }).summary).toBe(
        'Temporary manual summary edit.'
      )

      // Reset to original state
      const res = await request(app)
        .post(`/api/v1/generate/${gen.id}/content/reset`)
        .set('Authorization', `Bearer ${token}`)
        .send({})

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.tailored_content.summary).toBe(originalSummary)
      expect(res.body.data.latex_code).toContain(originalSummary)
    })
  })
})
