/**
 * LaTeX Compiler Microservice Server.
 * Complies with tasks BE-3.19 and BE-3.23.
 */

import express, { type Request, type Response } from 'express'
import { exec } from 'node:child_process'
import { compileLatexSandbox } from './sandbox.js'
import { globalCompilerQueue } from './queue.js'

export const app = express()
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 5050

app.use(express.json({ limit: '10mb' }))

// Cache pdflatex availability check
let pdflatexAvailable: boolean | null = null

function checkPdflatexInstalled(): Promise<boolean> {
  if (pdflatexAvailable !== null) {
    return Promise.resolve(pdflatexAvailable)
  }
  return new Promise((resolve) => {
    exec('pdflatex -version', (err) => {
      pdflatexAvailable = !err
      resolve(pdflatexAvailable)
    })
  })
}

/**
 * Health check endpoint
 */
app.get('/health', async (_req: Request, res: Response) => {
  const isAvailable = await checkPdflatexInstalled()
  res.status(200).json({
    status: 'ok',
    service: 'latexai-compiler',
    pdflatexAvailable: isAvailable,
    queue: globalCompilerQueue.getStats(),
    uptime: process.uptime(),
  })
})

/**
 * Compilation endpoint
 */
app.post('/compile', async (req: Request, res: Response) => {
  const { latex, timeoutMs } = req.body

  if (!latex || typeof latex !== 'string' || latex.trim().length === 0) {
    res.status(400).json({
      success: false,
      error: 'Missing or empty "latex" field in request body.',
    })
    return
  }

  if (latex.length > 2_000_000) {
    res.status(413).json({
      success: false,
      error: 'LaTeX source code exceeds maximum permitted payload of 2MB.',
    })
    return
  }

  try {
    const result = await globalCompilerQueue.add(() =>
      compileLatexSandbox(latex, {
        timeoutMs: typeof timeoutMs === 'number' ? timeoutMs : undefined,
      })
    )

    if (result.success && result.pdfBuffer) {
      res.status(200).json({
        success: true,
        pdfBase64: result.pdfBuffer.toString('base64'),
        pageCount: result.pageCount ?? 1,
        durationMs: result.durationMs,
      })
      return
    }

    res.status(422).json({
      success: false,
      errors: result.errors || [{ message: 'Compilation failed.' }],
      rawLog: result.rawLog || '',
      durationMs: result.durationMs,
    })
  } catch (err: unknown) {
    const errorObj = err as { code?: string; message?: string }
    if (errorObj.code === 'QUEUE_FULL') {
      res.status(503).json({
        success: false,
        error: errorObj.message || 'Compiler service is currently busy. Please retry shortly.',
        code: 'COMPILER_BUSY',
      })
      return
    }

    if (errorObj.code === 'QUEUE_TIMEOUT') {
      res.status(504).json({
        success: false,
        error: errorObj.message || 'Request timed out waiting for an available compiler worker.',
        code: 'COMPILER_QUEUE_TIMEOUT',
      })
      return
    }

    res.status(500).json({
      success: false,
      error: errorObj.message || 'Internal compiler service error.',
    })
  }
})

// Start server if executed directly
if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
  const server = app.listen(PORT, () => {
    console.log(`[compiler] LatexAI Compiler Service running on port ${PORT}`)
  })

  const shutdown = () => {
    console.log('[compiler] Shutting down compiler service...')
    server.close(() => {
      console.log('[compiler] Compiler service stopped.')
      process.exit(0)
    })
  }

  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}
