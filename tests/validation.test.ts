import { describe, it, expect } from 'vitest'
import request from 'supertest'
import express from 'express'
import { z } from 'zod'
import { validate } from '../src/middleware/validate.js'
import { errorHandler } from '../src/middleware/errorHandler.js'
import { ok } from '../src/utils/response.js'

describe('Validation Middleware (BE-0.08)', () => {
  const testApp = express()
  testApp.use(express.json())

  const testSchema = {
    body: z.object({
      email: z.string().email(),
      age: z.number().min(18),
    }),
    query: z.object({
      filter: z.string().optional(),
    }),
  }

  testApp.post('/test-validate', validate(testSchema), (req, res) => {
    return ok(res, { body: req.body, query: req.query })
  })

  testApp.use(errorHandler)

  it('passes valid payloads and returns normalized data', async () => {
    const res = await request(testApp)
      .post('/test-validate?filter=active')
      .send({ email: 'test@example.com', age: 25 })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.body).toEqual({ email: 'test@example.com', age: 25 })
    expect(res.body.data.query).toEqual({ filter: 'active' })
  })

  it('rejects invalid payload with 400 and VALIDATION_ERROR envelope', async () => {
    const res = await request(testApp)
      .post('/test-validate')
      .send({ email: 'invalid-email', age: 16 })

    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
    expect(res.body.error).toHaveProperty('code', 'VALIDATION_ERROR')
    expect(Array.isArray(res.body.error.details)).toBe(true)
    expect(res.body.error.details.length).toBeGreaterThanOrEqual(2)
  })
})
