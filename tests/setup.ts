import { beforeAll } from 'vitest'

beforeAll(() => {
  // Ensure test environment variables are loaded
  process.env.NODE_ENV = 'test'
  process.env.PORT = '4001'
  process.env.API_PREFIX = '/api/v1'
  process.env.LOG_LEVEL = 'silent'
  process.env.ENABLE_CONFIG_ENDPOINT = 'true'
  process.env.SUPABASE_URL = 'https://mock-supabase.test'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-role-key-for-vitest'
  process.env.SUPABASE_JWT_SECRET = 'mock-super-secret-jwt-key-with-32-chars-long!!'
})
