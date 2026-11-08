/**
 * Compiler Service & Queue Unit Tests (BE-3.19, BE-3.23, BE-3.25).
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { CompilerQueue } from '../compiler/src/queue.js'
import { compileLatex, setMockCompilerHandler } from '../src/latex/compilerClient.js'

describe('Compiler Service Queue & Client (BE-3.19, BE-3.23, BE-3.25)', () => {
  beforeEach(() => {
    setMockCompilerHandler(null)
  })

  describe('CompilerQueue Concurrency & Limits (BE-3.23)', () => {
    it('executes tasks within concurrency limits', async () => {
      const queue = new CompilerQueue({ maxConcurrency: 2, maxQueueSize: 5 })
      let running = 0
      let maxRunning = 0

      const createTask = (delayMs: number) => () =>
        queue.add(async () => {
          running++
          maxRunning = Math.max(maxRunning, running)
          await new Promise((resolve) => setTimeout(resolve, delayMs))
          running--
          return 'ok'
        })

      const tasks = [createTask(50)(), createTask(50)(), createTask(50)(), createTask(50)()]

      const results = await Promise.all(tasks)
      expect(results).toEqual(['ok', 'ok', 'ok', 'ok'])
      expect(maxRunning).toBeLessThanOrEqual(2)
    })

    it('rejects with QUEUE_FULL error when queue capacity is exceeded (503 condition)', async () => {
      const queue = new CompilerQueue({ maxConcurrency: 1, maxQueueSize: 2 })

      // Fill active slot
      const blocker = queue.add(() => new Promise((resolve) => setTimeout(resolve, 200)))

      // Fill wait queue (2 items)
      const q1 = queue.add(() => Promise.resolve(1))
      const q2 = queue.add(() => Promise.resolve(2))

      // 3rd waiting item exceeds maxQueueSize = 2 -> QUEUE_FULL
      await expect(queue.add(() => Promise.resolve(3))).rejects.toThrow(
        /Compiler service is at maximum capacity/
      )

      await Promise.all([blocker, q1, q2])
    })
  })

  describe('Compiler Client Wrapper (BE-3.25)', () => {
    it('returns PDF buffer and page count on successful compilation', async () => {
      const fakePdf = Buffer.from('%PDF-1.4 Fake PDF Content')
      setMockCompilerHandler(async () => ({
        success: true,
        pdfBuffer: fakePdf,
        pageCount: 1,
        durationMs: 50,
      }))

      const result = await compileLatex('\\documentclass{article}...')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.pdfBuffer).toEqual(fakePdf)
        expect(result.pageCount).toBe(1)
      }
    })

    it('handles compilation failure with parsed errors and logs', async () => {
      setMockCompilerHandler(async () => ({
        success: false,
        errors: [{ message: 'Undefined control sequence', line: 10 }],
        rawLog: '! Undefined control sequence\nl.10 \\broken',
        durationMs: 40,
      }))

      const result = await compileLatex('\\documentclass{article}...')
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.errors.length).toBe(1)
        expect(result.errors[0]!.message).toBe('Undefined control sequence')
        expect(result.errors[0]!.line).toBe(10)
      }
    })

    it('fallback mock compiler returns valid mock PDF buffer when compiler container is offline', async () => {
      // With mock handler null and compiler container offline in test mode
      const result = await compileLatex('\\documentclass{article}...')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.pdfBuffer).toBeDefined()
        expect(result.pdfBuffer.toString()).toContain('%PDF')
      }
    })
  })
})
