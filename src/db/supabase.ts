import '../config/network.js'

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

    // Use a lightweight limit(1) query with an explicit 10s timeout and REST fallback
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Database health check timed out after 10000ms')), 10000)
    )

    const queryPromise = (async () => {
      // 1. Try selecting 1 row from profiles using Supabase client
      try {
        const { error } = await supabaseAdmin
          .from('profiles')
          .select('id')
          .limit(1)

        if (!error || error.code === 'PGRST116' || error.code === '42P01') {
          return { ok: true }
        }
      } catch {
        // Fall back to direct REST ping
      }

      // 2. Direct REST API ping fallback
      try {
        const pingRes = await fetch(`${env.SUPABASE_URL}/rest/v1/`, {
          method: 'GET',
          headers: {
            apikey: env.SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          },
        })

        if (pingRes.ok || pingRes.status === 200 || pingRes.status === 401) {
          return { ok: true }
        }

        return { ok: false, error: `Supabase REST returned HTTP ${pingRes.status}` }
      } catch (pingErr) {
        return { ok: false, error: pingErr instanceof Error ? pingErr.message : String(pingErr) }
      }
    })()

    const result = await Promise.race([queryPromise, timeoutPromise])
    const latencyMs = Date.now() - start

    if (!result.ok) {
      return {
        connected: false,
        latencyMs,
        error: result.error || 'Database connection check failed',
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
