/**
 * Templates API Endpoints & Lifecycle Tests (BE-3.05 - BE-3.11, BE-3.28).
 */

import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { app } from '../src/app.js'
import { generateTestToken } from './helpers/jwt.js'
import { TemplateService } from '../src/services/template.service.js'
import { DEFAULT_SWE_TEMPLATE_ID } from '../src/latex/templates/defaultSwe.js'

describe('Templates API & Services (Phase C: BE-3.05 - BE-3.11, BE-3.28)', () => {
  let token: string
  const userId = 'usr_template_tester_1'

  beforeEach(async () => {
    TemplateService.resetMockStore()
    token = await generateTestToken({ sub: userId, email: 'tester@example.com' })
  })

  it('GET /api/v1/templates lists seeded system templates (BE-3.05)', async () => {
    const res = await request(app).get('/api/v1/templates').set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(Array.isArray(res.body.data)).toBe(true)
    expect(res.body.data.length).toBeGreaterThanOrEqual(2)

    const sweTemplate = res.body.data.find((t: { id: string }) => t.id === DEFAULT_SWE_TEMPLATE_ID)
    expect(sweTemplate).toBeDefined()
    expect(sweTemplate.isSystem).toBe(true)
    expect(sweTemplate.name).toContain('Standard ATS Single Column')
  })

  it('GET /api/v1/templates/:id retrieves specific template (BE-3.05)', async () => {
    const res = await request(app)
      .get(`/api/v1/templates/${DEFAULT_SWE_TEMPLATE_ID}`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.id).toBe(DEFAULT_SWE_TEMPLATE_ID)
    expect(res.body.data.latexCode).toContain('\\documentclass')
    expect(Array.isArray(res.body.data.placeholders)).toBe(true)
    expect(res.body.data.placeholders).toContain('{{FULL_NAME}}')
  })

  it('POST /api/v1/templates creates custom template with JSON payload (BE-3.06)', async () => {
    const validLatex = `\\documentclass{article}
\\begin{document}
\\Huge {{FULL_NAME}}
\\end{document}`

    const res = await request(app)
      .post('/api/v1/templates')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'My Custom Minimalist Template',
        description: 'Single-page simple resume',
        category: 'custom',
        latexCode: validLatex,
      })

    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
    expect(res.body.data.name).toBe('My Custom Minimalist Template')
    expect(res.body.data.isSystem).toBe(false)
  })

  it('POST /api/v1/templates uploads .tex file via multipart/form-data (BE-3.06)', async () => {
    const fileContent = `\\documentclass{article}
\\begin{document}
\\textbf{{{FULL_NAME}}} \\\\
{{EXPERIENCE_BLOCK}}
\\end{document}`

    const res = await request(app)
      .post('/api/v1/templates')
      .set('Authorization', `Bearer ${token}`)
      .field('name', 'Uploaded Tex Template')
      .attach('file', Buffer.from(fileContent, 'utf8'), 'custom_resume.tex')

    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
    expect(res.body.data.name).toBe('Uploaded Tex Template')
    expect(res.body.data.latexCode).toContain('{{EXPERIENCE_BLOCK}}')
  })

  it('POST /api/v1/templates rejects invalid LaTeX or missing {{FULL_NAME}} (BE-3.04, BE-3.06)', async () => {
    const invalidLatex = `\\begin{document} Missing documentclass and name \\end{document}`

    const res = await request(app)
      .post('/api/v1/templates')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Broken Template',
        latexCode: invalidLatex,
      })

    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
    expect(res.body.error.message).toContain('Template validation failed')
  })

  it('PUT /api/v1/templates/:id updates custom template and blocks updating system templates (BE-3.07)', async () => {
    // 1. Try to edit system template -> 403 Forbidden
    const sysRes = await request(app)
      .put(`/api/v1/templates/${DEFAULT_SWE_TEMPLATE_ID}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Hacked System Template' })

    expect(sysRes.status).toBe(403)

    // 2. Create custom template and update it
    const createRes = await request(app)
      .post('/api/v1/templates')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Editable Template',
        latexCode: `\\documentclass{article}\\begin{document}{{FULL_NAME}}\\end{document}`,
      })
    const customId = createRes.body.data.id

    const updateRes = await request(app)
      .put(`/api/v1/templates/${customId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Updated Template Name' })

    expect(updateRes.status).toBe(200)
    expect(updateRes.body.data.name).toBe('Updated Template Name')
  })

  it('POST /api/v1/templates/:id/duplicate duplicates an existing template (BE-3.08)', async () => {
    const res = await request(app)
      .post(`/api/v1/templates/${DEFAULT_SWE_TEMPLATE_ID}/duplicate`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'My Forked SWE Template' })

    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
    expect(res.body.data.name).toBe('My Forked SWE Template')
    expect(res.body.data.isSystem).toBe(false)
  })

  it('POST /api/v1/templates/:id/activate sets active user template (BE-3.09)', async () => {
    const res = await request(app)
      .post(`/api/v1/templates/${DEFAULT_SWE_TEMPLATE_ID}/activate`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.activeTemplateId).toBe(DEFAULT_SWE_TEMPLATE_ID)
  })

  it('DELETE /api/v1/templates/:id deletes custom template with fallback activation rule (BE-3.07)', async () => {
    // 1. Cannot delete system template
    const sysRes = await request(app)
      .delete(`/api/v1/templates/${DEFAULT_SWE_TEMPLATE_ID}`)
      .set('Authorization', `Bearer ${token}`)

    expect(sysRes.status).toBe(403)

    // 2. Create custom template and activate it
    const createRes = await request(app)
      .post('/api/v1/templates')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Temporary Template',
        latexCode: `\\documentclass{article}\\begin{document}{{FULL_NAME}}\\end{document}`,
      })
    const customId = createRes.body.data.id

    await request(app)
      .post(`/api/v1/templates/${customId}/activate`)
      .set('Authorization', `Bearer ${token}`)

    // 3. Delete it -> fallback activation to tpl_default_swe
    const delRes = await request(app)
      .delete(`/api/v1/templates/${customId}`)
      .set('Authorization', `Bearer ${token}`)

    expect(delRes.status).toBe(200)
    expect(delRes.body.data.deleted).toBe(true)
    expect(delRes.body.data.fallbackActivated).toBe(true)
    expect(delRes.body.data.activeTemplateId).toBe(DEFAULT_SWE_TEMPLATE_ID)
  })

  it('GET /api/v1/templates/:id/placeholders returns placeholder contracts (BE-3.11)', async () => {
    const res = await request(app)
      .get(`/api/v1/templates/${DEFAULT_SWE_TEMPLATE_ID}/placeholders`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(Array.isArray(res.body.data.placeholders)).toBe(true)
    const fullNamePlaceholder = res.body.data.placeholders.find(
      (p: { placeholder: string }) => p.placeholder === '{{FULL_NAME}}'
    )
    expect(fullNamePlaceholder).toBeDefined()
    expect(fullNamePlaceholder.isSupported).toBe(true)
  })

  it('POST /api/v1/templates/:id/preview renders and compiles preview PDF (BE-3.10, BE-3.28)', async () => {
    const res = await request(app)
      .post(`/api/v1/templates/${DEFAULT_SWE_TEMPLATE_ID}/preview`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        profileData: {
          fullName: 'Test Candidate',
        },
      })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toHaveProperty('pdfBase64')
    expect(res.body.data).toHaveProperty('pageCount')
    expect(res.body.data).toHaveProperty('renderedLatex')
    expect(res.body.data.renderedLatex).toContain('Test Candidate')
  })

  it('POST /api/v1/templates/:id/preview returns binary PDF when Accept: application/pdf is specified', async () => {
    const res = await request(app)
      .post(`/api/v1/templates/${DEFAULT_SWE_TEMPLATE_ID}/preview`)
      .set('Authorization', `Bearer ${token}`)
      .set('Accept', 'application/pdf')
      .send()

    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('application/pdf')
  })
})
