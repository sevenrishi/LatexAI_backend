import PQueue from 'p-queue'
import { logger } from '../utils/logger.js'

export const generationQueue = new PQueue({ concurrency: 2 })

const activeJobIds = new Set<string>()

/**
 * Adds an async generation job to the concurrency-limited processing queue.
 */
export function enqueueGenerationJob(
  generationId: string,
  handler: (id: string) => Promise<void>
): void {
  activeJobIds.add(generationId)

  generationQueue
    .add(async () => {
      logger.info({ generationId }, 'Starting background resume generation')
      try {
        await handler(generationId)
        logger.info({ generationId }, 'Background resume generation completed successfully')
      } catch (err) {
        logger.error(
          { generationId, err: (err as Error).message },
          'Error running background resume generation'
        )
      } finally {
        activeJobIds.delete(generationId)
      }
    })
    .catch((err) => {
      activeJobIds.delete(generationId)
      logger.error(
        { generationId, err: (err as Error).message },
        'Failed to enqueue generation task'
      )
    })
}

export function isJobActive(generationId: string): boolean {
  return activeJobIds.has(generationId)
}

export function getQueueStatus(): { size: number; pending: number; activeJobs: string[] } {
  return {
    size: generationQueue.size,
    pending: generationQueue.pending,
    activeJobs: Array.from(activeJobIds),
  }
}
