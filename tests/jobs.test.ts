import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { app } from '../src/app.js'
import { generateTestToken } from './helpers/jwt.js'
import {
  normalizeJobText,
  validateJobText,
  MIN_JD_LENGTH,
  MAX_JD_LENGTH,
} from '../src/jobs/normalize.js'
import { isPrivateIPv4, isPrivateIPv6, isSafeIP, validateSafeUrl } from '../src/jobs/safeFetch.js'
import { extractJobFromHtml, detectBotWall } from '../src/jobs/htmlParser.js'

describe('Job Normalization and Sizing (BE-4.02)', () => {
  it('normalizes newlines, strips non-printable control chars, and collapses blank lines', () => {
    const raw =
      'Software Engineer\r\n\r\n\r\n\r\nResponsibilities:\x00\x08\n- Build high scale systems\n\n'
    const normalized = normalizeJobText(raw)
    expect(normalized).not.toContain('\r')
    expect(normalized).not.toContain('\x00')
    expect(normalized).not.toContain('\x08')
    expect(normalized).not.toContain('\n\n\n')
    expect(normalized.startsWith('Software Engineer')).toBe(true)
  })

  it('rejects job description that is too short', () => {
    const shortText = 'Job title: Dev'
    const result = validateJobText(shortText)
    expect(result.valid).toBe(false)
    expect(result.error).toContain(`minimum ${MIN_JD_LENGTH} characters required`)
  })

  it('rejects job description that exceeds max size', () => {
    const hugeText = 'A'.repeat(MAX_JD_LENGTH + 10)
    const result = validateJobText(hugeText)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('exceeds maximum allowed length')
  })

  it('accepts valid job description text', () => {
    const validText =
      'We are looking for a Senior Backend Engineer with 5+ years of experience in Node.js, TypeScript, PostgreSQL, and distributed cloud architecture.'
    const result = validateJobText(validText)
    expect(result.valid).toBe(true)
    expect(result.normalized).toBe(validText)
  })
})

describe('SSRF Protection (BE-4.03)', () => {
  it('detects private and loopback IPv4 addresses', () => {
    expect(isPrivateIPv4('127.0.0.1')).toBe(true)
    expect(isPrivateIPv4('10.0.0.5')).toBe(true)
    expect(isPrivateIPv4('192.168.1.100')).toBe(true)
    expect(isPrivateIPv4('172.16.5.1')).toBe(true)
    expect(isPrivateIPv4('172.31.255.254')).toBe(true)
    expect(isPrivateIPv4('169.254.169.254')).toBe(true)
    expect(isPrivateIPv4('0.0.0.0')).toBe(true)

    // Public IPs
    expect(isPrivateIPv4('8.8.8.8')).toBe(false)
    expect(isPrivateIPv4('1.1.1.1')).toBe(false)
    expect(isPrivateIPv4('142.250.190.46')).toBe(false)

    expect(isSafeIP('8.8.8.8')).toBe(true)
    expect(isSafeIP('127.0.0.1')).toBe(false)
  })

  it('detects private and loopback IPv6 addresses', () => {
    expect(isPrivateIPv6('::1')).toBe(true)
    expect(isPrivateIPv6('::')).toBe(true)
    expect(isPrivateIPv6('fc00::1')).toBe(true)
    expect(isPrivateIPv6('fe80::1')).toBe(true)
    expect(isPrivateIPv6('::ffff:127.0.0.1')).toBe(true)
    expect(isPrivateIPv6('::ffff:10.0.0.1')).toBe(true)

    // Public IPv6
    expect(isPrivateIPv6('2607:f8b0:4005:805::200e')).toBe(false)
  })

  it('rejects unsupported protocols', async () => {
    await expect(validateSafeUrl('file:///etc/passwd')).rejects.toThrow('Unsupported protocol')
    await expect(validateSafeUrl('ftp://example.com/data')).rejects.toThrow('Unsupported protocol')
    await expect(validateSafeUrl('gopher://example.com')).rejects.toThrow('Unsupported protocol')
  })

  it('rejects internal and loopback hostnames', async () => {
    await expect(validateSafeUrl('http://localhost:3000')).rejects.toThrow('prohibited')
    await expect(validateSafeUrl('http://sub.localhost:8080')).rejects.toThrow('prohibited')
    await expect(validateSafeUrl('http://metadata.google.internal')).rejects.toThrow('prohibited')
    await expect(validateSafeUrl('http://169.254.169.254/latest/meta-data/')).rejects.toThrow(
      'prohibited'
    )
    await expect(validateSafeUrl('http://127.0.0.1:4000')).rejects.toThrow('prohibited')
  })
})

describe('HTML Parsing & Bot-Wall Detection (BE-4.04, BE-4.05)', () => {
  it('detects Cloudflare and security challenge bot-walls', () => {
    const cloudflareHtml =
      '<html><head><title>Just a moment...</title></head><body>cf-browser-verification Ray ID: 890123</body></html>'
    expect(detectBotWall(cloudflareHtml)).toBe(true)
    expect(() => extractJobFromHtml(cloudflareHtml)).toThrowError()
  })

  it('detects login authwalls and CAPTCHAs', () => {
    const loginWallHtml = '<div>Please sign in or create an account to view this job posting.</div>'
    expect(detectBotWall(loginWallHtml)).toBe(true)

    const captchaHtml = '<div>Press & Hold px-captcha to verify you are human</div>'
    expect(detectBotWall(captchaHtml)).toBe(true)
  })

  it('extracts JobPosting directly from JSON-LD schema', () => {
    const htmlWithJsonLd = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Software Engineer at TechCorp</title>
        <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "JobPosting",
          "title": "Staff Backend Engineer",
          "hiringOrganization": {
            "@type": "Organization",
            "name": "Stripe"
          },
          "description": "<p>We are seeking a <strong>Staff Backend Engineer</strong> to architect global payment APIs.</p><ul><li>Design distributed systems</li><li>Scale PostgreSQL</li></ul>"
        }
        </script>
      </head>
      <body><h1>Careers Page</h1></body>
      </html>
    `

    const extracted = extractJobFromHtml(htmlWithJsonLd)
    expect(extracted.extractedVia).toBe('jsonld')
    expect(extracted.jobTitle).toBe('Staff Backend Engineer')
    expect(extracted.companyName).toBe('Stripe')
    expect(extracted.rawText).toContain('Staff Backend Engineer')
    expect(extracted.rawText).toContain('Design distributed systems')
  })

  it('extracts job content using semantic HTML fallback when no JSON-LD is available', () => {
    const semanticHtml = `
      <!DOCTYPE html>
      <html>
      <head><title>Senior React Developer - Netflix</title></head>
      <body>
        <nav><a href="/">Home</a></nav>
        <main class="job-description">
          <h1>Senior Frontend Developer</h1>
          <div class="company-name">Netflix</div>
          <p>Join our UI engineering team building next-generation streaming experiences.</p>
          <ul>
            <li>Expertise with React, TypeScript, and WebGL</li>
            <li>Experience profiling client runtime performance</li>
          </ul>
        </main>
        <footer>Copyright 2026</footer>
      </body>
      </html>
    `

    const extracted = extractJobFromHtml(semanticHtml)
    expect(extracted.extractedVia).toBe('html')
    expect(extracted.jobTitle).toBe('Senior Frontend Developer')
    expect(extracted.companyName).toBe('Netflix')
    expect(extracted.rawText).toContain('Expertise with React, TypeScript')
  })
})

describe('Jobs Endpoints (BE-4.06, BE-4.07)', () => {
  it('POST /api/v1/jobs/fetch requires authentication', async () => {
    const res = await request(app)
      .post('/api/v1/jobs/fetch')
      .send({ url: 'https://example.com/job' })

    expect(res.status).toBe(401)
  })

  it('POST /api/v1/jobs/extract extracts requirements from valid job text', async () => {
    const token = await generateTestToken()
    const validJd = `
      Title: Senior Go & Cloud Engineer
      Company: Datadog
      Requirements:
      - 5+ years of experience with Go, Kubernetes, and Docker
      - Deep expertise in PostgreSQL and high-throughput streaming
      - Bachelor's in Computer Science or equivalent
    `

    const res = await request(app)
      .post('/api/v1/jobs/extract')
      .set('Authorization', `Bearer ${token}`)
      .send({
        rawText: validJd,
        jobTitle: 'Senior Go & Cloud Engineer',
        company: 'Datadog',
      })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.requirements).toBeDefined()
    expect(res.body.data.requirements.jobTitle).toBe('Senior Go & Cloud Engineer')
    expect(res.body.data.requirements.requiredSkills.length).toBeGreaterThan(0)
  })

  it('POST /api/v1/jobs/extract rejects job description that is too short', async () => {
    const token = await generateTestToken()
    const res = await request(app)
      .post('/api/v1/jobs/extract')
      .set('Authorization', `Bearer ${token}`)
      .send({
        rawText: 'Too short',
      })

    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
  })
})
