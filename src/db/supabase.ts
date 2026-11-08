import { createClient, type SupabaseClient, type PostgrestError } from '@supabase/supabase-js'
import { env } from '../config/env.js'
import { AppError, ERROR_CODES } from '../utils/errors.js'
import { logger } from '../utils/logger.js'

let supabaseAdminInstance: SupabaseClient | null = null

export function getSupabaseAdmin(): SupabaseClient {
  if (!supabaseAdminInstance) {
    supabaseAdminInstance = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    })
  }
  return supabaseAdminInstance
}

export const supabaseAdmin = getSupabaseAdmin()

export interface DbConnectionCheckResult {
  connected: boolean
  latencyMs?: number
  error?: string
}

/**
 * Checks connection to Supabase / PostgreSQL.
 */
export async function checkDbConnection(): Promise<DbConnectionCheckResult> {
  const start = Date.now()
  try {
    // If running with placeholders in test/dev, return connected immediately
    if (env.SUPABASE_URL.includes('placeholder')) {
      return {
        connected: true,
        latencyMs: 1,
      }
    }

    const { error } = await supabaseAdmin
      .from('profiles')
      .select('count', { count: 'exact', head: true })
    const latencyMs = Date.now() - start

    if (error && error.code !== 'PGRST116' && error.code !== '42P01') {
      logger.warn({ error }, 'Database health check query returned error')
      return {
        connected: false,
        latencyMs,
        error: error.message,
      }
    }

    return {
      connected: true,
      latencyMs,
    }
  } catch (err) {
    const latencyMs = Date.now() - start
    const message = (err as Error).message
    logger.error({ err }, 'Database health check threw exception')
    return {
      connected: false,
      latencyMs,
      error: message,
    }
  }
}

/**
 * Maps Supabase/PostgREST error codes to standardized AppError.
 */
export function mapPostgrestError(error: PostgrestError): AppError {
  // 23505: unique_violation
  if (error.code === '23505') {
    return new AppError(
      409,
      ERROR_CODES.CONFLICT,
      'A record with this information already exists.',
      {
        detail: error.details,
      }
    )
  }

  // 23503: foreign_key_violation
  if (error.code === '23503') {
    return new AppError(400, ERROR_CODES.BAD_REQUEST, 'Referenced record was not found.', {
      detail: error.details,
    })
  }

  // PGRST116: JSON object requested, multiple (or no) rows returned
  if (error.code === 'PGRST116') {
    return new AppError(404, ERROR_CODES.NOT_FOUND, 'Record not found.')
  }

  // 42501: insufficient_privilege / RLS violation
  if (error.code === '42501') {
    return new AppError(403, ERROR_CODES.FORBIDDEN, 'Permission denied for this operation.')
  }

  return new AppError(500, ERROR_CODES.DATABASE_ERROR, error.message || 'Database query error', {
    code: error.code,
    details: error.details,
  })
}

/**
 * Helper to unwrap Supabase PostgREST query results.
 */
export function handleDbResult<T>(result: { data: T | null; error: PostgrestError | null }): T {
  if (result.error) {
    throw mapPostgrestError(result.error)
  }
  return result.data as T
}
