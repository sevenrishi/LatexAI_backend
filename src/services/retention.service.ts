/**
 * Retention background service for purging stale temporary data and orphaned storage files.
 * Complies with task BE-6.08.
 */

import { GenerationService } from './generation.service.js'
import { ProfileService } from './profile.service.js'
import { StorageService } from './storage.service.js'
import { supabaseAdmin } from '../db/supabase.js'
import { env } from '../config/env.js'
import { logger } from '../utils/logger.js'

export interface RetentionCleanupResult {
  staleGenerationsPurged: number
  staleImportsPurged: number
  orphanedStorageFilesPurged: number
  durationMs: number
  timestamp: string
}

function isMockMode(): boolean {
  return (
    env.SUPABASE_URL.includes('placeholder') ||
    env.SUPABASE_URL.includes('mock') ||
    env.NODE_ENV === 'test'
  )
}

export class RetentionService {
  private static timer: NodeJS.Timeout | null = null

  /**
   * Executes full retention cleanup pass.
   */
  static async runRetentionCleanup(options?: {
    staleDays?: number
    tempHours?: number
  }): Promise<RetentionCleanupResult> {
    const start = Date.now()
    const staleDays = options?.staleDays ?? 30
    const tempHours = options?.tempHours ?? 24

    logger.info({ staleDays, tempHours }, 'Starting retention cleanup job')

    // 1. Purge stale failed or cancelled generations
    const staleGenerationsPurged = await GenerationService.purgeStaleGenerations(staleDays)

    // 2. Purge stale temporary resume imports
    const staleImportsPurged = await ProfileService.purgeStaleImports(tempHours)

    // 3. Purge orphaned storage files
    let validFileIds = new Set<string>()
    if (isMockMode()) {
      const mockGens = GenerationService.getMockGenerationsMap()
      for (const id of mockGens.keys()) {
        validFileIds.add(id)
      }
    } else {
      try {
        const { data } = await supabaseAdmin.from('generations').select('id')
        if (data) {
          validFileIds = new Set(data.map((r) => r.id))
        }
      } catch (err) {
        logger.warn({ err }, 'Could not list generations for orphan check')
      }
    }

    const orphanedStorageFilesPurged = await StorageService.purgeOrphanedFiles(validFileIds)

    const durationMs = Date.now() - start
    const result: RetentionCleanupResult = {
      staleGenerationsPurged,
      staleImportsPurged,
      orphanedStorageFilesPurged,
      durationMs,
      timestamp: new Date().toISOString(),
    }

    logger.info({ ...result }, 'Retention cleanup completed successfully')
    return result
  }

  /**
   * Starts recurring background retention job (e.g. daily).
   */
  static startRetentionScheduler(intervalMs = 24 * 60 * 60 * 1000): void {
    if (this.timer) {
      clearInterval(this.timer)
    }

    this.timer = setInterval(() => {
      RetentionService.runRetentionCleanup().catch((err) => {
        logger.error({ err }, 'Error running scheduled retention cleanup')
      })
    }, intervalMs)

    this.timer.unref()
    logger.info({ intervalMs }, 'Retention scheduler initiated')
  }

  /**
   * Stops scheduler (for graceful shutdown or test teardown).
   */
  static stopRetentionScheduler(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }
}
