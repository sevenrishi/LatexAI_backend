import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { app } from '../src/app.js'
import { AppError, ERROR_CODES } from '../src/utils/errors.js'

describe('Error Handling Middleware & AppError (BE-0.07)', () => {
  it('instantiates AppError with correct status code and code enum', () => {
    const err = AppError.badRequest('Custom bad request', { field: 'name' })
    expect(err.statusCode).toBe(400)
    expect(err.code).toBe(ERROR_CODES.BAD_REQUEST)
    expect(err.message).toBe('Custom bad request')
    expect(err.details).toEqual({ field: 'name' })
    expect(err.isOperational).toBe(true)
  })

  it('instantiates static helpers correctly', () => {
    expect(AppError.unauthorized().statusCode).toBe(401)
    expect(AppError.forbidden().statusCode).toBe(403)
    expect(AppError.notFound().statusCode).toBe(404)
    expect(AppError.conflict().statusCode).toBe(409)
    expect(AppError.tooManyRequests().statusCode).toBe(429)
    expect(AppError.internal().statusCode).toBe(500)
  })

  it('returns 404 for unknown endpoints with ROUTE_NOT_FOUND code', async () => {
    const res = await request(app).get('/api/v1/non-existent-route-xyz')
    expect(res.status).toBe(404)
    expect(res.body.success).toBe(false)
    expect(res.body.error).toHaveProperty('code', ERROR_CODES.ROUTE_NOT_FOUND)
  })

  it('handles malformed JSON body with 400 BAD_REQUEST', async () => {
    const res = await request(app)
      .post('/api/v1/health') // any endpoint
      .set('Content-Type', 'application/json')
      .send('{ "broken": json-invalid }')

    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
    expect(res.body.error).toHaveProperty('code', ERROR_CODES.BAD_REQUEST)
  })
})
