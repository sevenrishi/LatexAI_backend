import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { app } from '../src/app.js'
import { generateTestToken, generateExpiredToken } from './helpers/jwt.js'
import { ERROR_CODES } from '../src/utils/errors.js'

describe('Auth & Onboarding Endpoints (Phase A)', () => {
  describe('requireAuth Middleware & Token Validation (BE-1.03)', () => {
    it('rejects requests with missing Authorization header (401 UNAUTHORIZED)', async () => {
      const res = await request(app).get('/api/v1/auth/me')

      expect(res.status).toBe(401)
      expect(res.body.success).toBe(false)
      expect(res.body.error).toHaveProperty('code', ERROR_CODES.UNAUTHORIZED)
    })

    it('rejects requests with invalid/corrupt token signature (401 INVALID_TOKEN)', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer invalid.corrupted.jwt.token')

      expect(res.status).toBe(401)
      expect(res.body.success).toBe(false)
      expect(res.body.error).toHaveProperty('code', ERROR_CODES.INVALID_TOKEN)
    })

    it('rejects requests with expired token (401 TOKEN_EXPIRED)', async () => {
      const expiredToken = await generateExpiredToken({
        sub: 'usr_test_expired_123',
        email: 'expired@example.com',
      })

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${expiredToken}`)

      expect(res.status).toBe(401)
      expect(res.body.success).toBe(false)
      expect(res.body.error).toHaveProperty('code', ERROR_CODES.TOKEN_EXPIRED)
    })

    it('rejects requests if email is unverified (403 EMAIL_NOT_VERIFIED)', async () => {
      const unverifiedToken = await generateTestToken({
        sub: 'usr_test_unverified_456',
        email: 'unverified@example.com',
        user_metadata: { email_verified: false },
        email_confirmed_at: undefined,
      })

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${unverifiedToken}`)

      expect(res.status).toBe(403)
      expect(res.body.success).toBe(false)
      expect(res.body.error).toHaveProperty('code', ERROR_CODES.EMAIL_NOT_VERIFIED)
    })
  })

  describe('GET /api/v1/auth/me (BE-1.04)', () => {
    it('returns user identity, onboarding status, and completeness breakdown for valid token', async () => {
      const token = await generateTestToken({
        sub: 'usr_verified_789',
        email: 'alex.rivera@example.com',
      })

      const res = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data).toHaveProperty('id', 'usr_verified_789')
      expect(res.body.data).toHaveProperty('email', 'alex.rivera@example.com')
      expect(res.body.data).toHaveProperty('onboardingCompleted')
      expect(res.body.data).toHaveProperty('activeTemplateId')
      expect(res.body.data).toHaveProperty('completeness')
      expect(res.body.data.completeness).toHaveProperty('percentage')
      expect(res.body.data.completeness).toHaveProperty('sections')
      expect(typeof res.body.data.completeness.percentage).toBe('number')
    })
  })

  describe('PATCH /api/v1/auth/me (Profile updates)', () => {
    it('partially updates user profile info', async () => {
      const token = await generateTestToken({
        sub: 'usr_verified_789',
        email: 'alex.rivera@example.com',
      })

      const res = await request(app)
        .patch('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .send({
          fullName: 'Alexander Rivera',
          headline: 'Principal AI Engineer',
        })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data).toHaveProperty('fullName', 'Alexander Rivera')
      expect(res.body.data).toHaveProperty('headline', 'Principal AI Engineer')
    })

    it('rejects invalid inputs violating field validation schema', async () => {
      const token = await generateTestToken({
        sub: 'usr_verified_789',
      })

      const res = await request(app)
        .patch('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .send({
          headline: 'A'.repeat(250), // exceeds max 200
        })

      expect(res.status).toBe(400)
      expect(res.body.success).toBe(false)
      expect(res.body.error).toHaveProperty('code', ERROR_CODES.VALIDATION_ERROR)
    })
  })

  describe('POST /api/v1/auth/onboarding/complete (BE-1.05)', () => {
    it('persists onboarding completion status and preferences', async () => {
      const token = await generateTestToken({
        sub: 'usr_onboard_101',
        email: 'onboard@example.com',
      })

      const res = await request(app)
        .post('/api/v1/auth/onboarding/complete')
        .set('Authorization', `Bearer ${token}`)
        .send({
          targetRole: 'Staff Platform Engineer',
          templateId: 'tpl_modern_compact',
          tonePreference: 'impactful',
        })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data).toHaveProperty('onboardingCompleted', true)
      expect(res.body.data).toHaveProperty('activeTemplateId', 'tpl_modern_compact')
    })
  })

  describe('Proxy Routes: /signup & /login (BE-1.08)', () => {
    it('validates signup payload schema', async () => {
      const res = await request(app)
        .post('/api/v1/auth/signup')
        .send({ email: 'bad-email', password: '123' })

      expect(res.status).toBe(400)
      expect(res.body.success).toBe(false)
      expect(res.body.error).toHaveProperty('code', ERROR_CODES.VALIDATION_ERROR)
    })

    it('validates login payload schema', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'not-an-email', password: '' })

      expect(res.status).toBe(400)
      expect(res.body.success).toBe(false)
      expect(res.body.error).toHaveProperty('code', ERROR_CODES.VALIDATION_ERROR)
    })
  })

  describe('Account Export & Cascade Deletion (BE-1.07)', () => {
    it('exports user data archive at GET /api/v1/auth/export', async () => {
      const token = await generateTestToken({
        sub: 'usr_export_202',
        email: 'export@example.com',
      })

      const res = await request(app)
        .get('/api/v1/auth/export')
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data).toHaveProperty('user')
      expect(res.body.data).toHaveProperty('exportedAt')
      expect(res.body.data).toHaveProperty('format', 'JSON_ARCHIVE_V1')
    })

    it('purges user files and account at DELETE /api/v1/auth/account', async () => {
      const token = await generateTestToken({
        sub: 'usr_delete_303',
        email: 'delete.me@example.com',
      })

      const res = await request(app)
        .delete('/api/v1/auth/account')
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data).toHaveProperty(
        'message',
        'Account and associated records successfully purged.'
      )
    })
  })
})
