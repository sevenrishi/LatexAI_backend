/**
 * Compiler Concurrency Limiter and Wait Queue.
 * Complies with task BE-3.23.
 */

export interface QueueOptions {
  maxConcurrency?: number
  maxQueueSize?: number
  queueTimeoutMs?: number
}

interface QueuedTask<T> {
  id: string
  taskFn: () => Promise<T>
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
  enqueuedAt: number
  timeoutTimer: NodeJS.Timeout
}

export class CompilerQueue {
  private maxConcurrency: number
  private maxQueueSize: number
  private queueTimeoutMs: number

  private activeCount = 0
  private queue: Array<QueuedTask<unknown>> = []

  constructor(options: QueueOptions = {}) {
    this.maxConcurrency = options.maxConcurrency ?? 5
    this.maxQueueSize = options.maxQueueSize ?? 20
    this.queueTimeoutMs = options.queueTimeoutMs ?? 30000
  }

  public getStats() {
    return {
      activeCount: this.activeCount,
      queueLength: this.queue.length,
      maxConcurrency: this.maxConcurrency,
      maxQueueSize: this.maxQueueSize,
    }
  }

  /**
   * Adds a compilation task to the queue.
   * Throws Error with code 'QUEUE_FULL' if maximum queue capacity is reached.
   */
  public async add<T>(taskFn: () => Promise<T>): Promise<T> {
    if (this.queue.length >= this.maxQueueSize) {
      const err = new Error(
        `Compiler service is at maximum capacity (${this.queue.length} jobs waiting). Please retry shortly.`
      )
      ;(err as unknown as { code: string }).code = 'QUEUE_FULL'
      throw err
    }

    return new Promise<T>((resolve, reject) => {
      const id = Math.random().toString(36).substring(2, 9)

      const timeoutTimer = setTimeout(() => {
        const index = this.queue.findIndex((item) => item.id === id)
        if (index !== -1) {
          this.queue.splice(index, 1)
          const err = new Error('Compilation request timed out while waiting in queue.')
          ;(err as unknown as { code: string }).code = 'QUEUE_TIMEOUT'
          reject(err)
        }
      }, this.queueTimeoutMs)

      const queuedTask: QueuedTask<T> = {
        id,
        taskFn,
        resolve: resolve as (value: unknown) => void,
        reject,
        enqueuedAt: Date.now(),
        timeoutTimer,
      }

      this.queue.push(queuedTask as QueuedTask<unknown>)
      this.dequeueNext()
    })
  }

  private dequeueNext(): void {
    if (this.activeCount >= this.maxConcurrency || this.queue.length === 0) {
      return
    }

    const nextTask = this.queue.shift()
    if (!nextTask) return

    clearTimeout(nextTask.timeoutTimer)
    this.activeCount++

    Promise.resolve()
      .then(() => nextTask.taskFn())
      .then(
        (result) => {
          this.activeCount--
          nextTask.resolve(result)
          this.dequeueNext()
        },
        (error) => {
          this.activeCount--
          nextTask.reject(error)
          this.dequeueNext()
        }
      )
  }

  /**
   * Resets active and queued states (mainly for test suites).
   */
  public clear(): void {
    for (const task of this.queue) {
      clearTimeout(task.timeoutTimer)
      task.reject(new Error('Queue cleared'))
    }
    this.queue = []
    this.activeCount = 0
  }
}

export const globalCompilerQueue = new CompilerQueue()
