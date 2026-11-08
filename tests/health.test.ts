import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { app } from '../src/app.js'

describe('Health & Config Endpoints (BE-0.10)', () => {
  it('GET /health returns liveness status 200 with uptime and service name', async () => {
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('status', 'ok')
    expect(res.body).toHaveProperty('service', 'latexai-api')
    expect(typeof res.body.uptime).toBe('number')
    expect(res.body).toHaveProperty('timestamp')
  })

  it('GET /api/v1/health also returns 200 through mounted router', async () => {
    const res = await request(app).get('/api/v1/health')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('status', 'ok')
  })

  it('GET /health/ready returns readiness status with database checks', async () => {
    const res = await request(app).get('/health/ready')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('status', 'ok')
    expect(res.body).toHaveProperty('checks')
    expect(res.body.checks).toHaveProperty('database')
    expect(res.body.checks.database.status).toBe('healthy')
  })

  it('GET /api/v1/config returns public configuration when enabled', async () => {
    const res = await request(app).get('/api/v1/config')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('success', true)
    expect(res.body.data).toHaveProperty('apiVersion', 'v1')
    expect(res.body.data).toHaveProperty('features')
    expect(res.body.data.features.aiTailoring).toBe(true)
    expect(res.body.data.limits).toHaveProperty('maxUploadSizeBytes')
  })
})
