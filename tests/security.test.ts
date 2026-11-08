import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { app } from '../src/app.js'

describe('Security Stack & Middleware (BE-0.06)', () => {
  it('injects and echoes x-request-id header', async () => {
    const customId = 'test-trace-id-12345'
    const res = await request(app).get('/health').set('x-request-id', customId)

    expect(res.headers['x-request-id']).toBe(customId)
  })

  it('generates an x-request-id if none provided in request', async () => {
    const res = await request(app).get('/health')
    expect(res.headers['x-request-id']).toBeDefined()
    expect(typeof res.headers['x-request-id']).toBe('string')
  })

  it('sets secure helmet headers', async () => {
    const res = await request(app).get('/health')
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.headers['x-dns-prefetch-control']).toBe('off')
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN')
  })

  it('sets CORS headers on allowed origins', async () => {
    const res = await request(app)
      .options('/api/v1/health')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'GET')

    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173')
    expect(res.headers['access-control-allow-credentials']).toBe('true')
  })
})
