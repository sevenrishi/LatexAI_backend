import { describe, it, expect } from 'vitest'
import { generateTestToken, generateExpiredToken, verifyTestToken } from './helpers/jwt.js'

describe('JWT Test Helpers (BE-0.13)', () => {
  it('generates a valid signed JWT that can be verified', async () => {
    const token = await generateTestToken({
      sub: 'usr_12345678',
      email: 'alex@example.com',
    })

    expect(typeof token).toBe('string')
    const { payload } = await verifyTestToken(token)
    expect(payload.sub).toBe('usr_12345678')
    expect(payload.email).toBe('alex@example.com')
    expect(payload.iss).toBe('supabase')
  })

  it('fails verification on expired tokens', async () => {
    const expiredToken = await generateExpiredToken({
      sub: 'usr_expired_123',
    })

    await expect(verifyTestToken(expiredToken)).rejects.toThrow()
  })
})
