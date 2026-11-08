import dotenv from 'dotenv'
import { z } from 'zod'

// Preload .env before parsing
dotenv.config()

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z
    .string()
    .default('4000')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().positive()),
  API_PREFIX: z.string().default('/api/v1'),
  CORS_ORIGIN: z.string().default('http://localhost:5173,http://localhost:3000'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  RATE_LIMIT_WINDOW_MS: z
    .string()
    .default('60000')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().positive()),
  RATE_LIMIT_MAX: z
    .string()
    .default('100')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().positive()),
  ENABLE_CONFIG_ENDPOINT: z
    .string()
    .default('true')
    .transform((val) => val === 'true' || val === '1'),
  SUPABASE_URL: z.string().url().default('https://placeholder.supabase.co'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).default('placeholder-service-role-key'),
  SUPABASE_JWT_SECRET: z
    .string()
    .min(10)
    .default('super-secret-jwt-token-with-at-least-32-chars-long'),
  COMPILER_SERVICE_URL: z.string().url().default('http://localhost:5050'),
  GROQ_API_KEY: z.string().optional(),
  GENERATION_DAILY_LIMIT: z
    .string()
    .default('20')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().positive()),
})

export type Env = z.infer<typeof envSchema>

export function loadEnv(customEnv?: Record<string, unknown>): Env {
  const source = customEnv || process.env
  const result = envSchema.safeParse(source)

  if (!result.success) {
    const errorDetails = result.error.issues
      .map((issue) => ` - [${issue.path.join('.')}]: ${issue.message}`)
      .join('\n')
    const message = `[FATAL] Invalid environment configuration:\n${errorDetails}`
    console.error(message)
    throw new Error(message)
  }

  // Enforce production security checks
  if (result.data.NODE_ENV === 'production') {
    if (result.data.SUPABASE_URL.includes('placeholder')) {
      throw new Error('[FATAL] SUPABASE_URL cannot be a placeholder in production.')
    }
    if (result.data.SUPABASE_SERVICE_ROLE_KEY.includes('placeholder')) {
      throw new Error('[FATAL] SUPABASE_SERVICE_ROLE_KEY cannot be a placeholder in production.')
    }
  }

  return result.data
}

export const env = loadEnv()
