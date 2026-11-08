/**
 * Secure sandboxed compilation runner executing pdflatex.
 * Complies with tasks BE-3.21 and BE-3.24.
 */

import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { parseLatexErrors, type LatexError } from './logParser.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export interface CompileOptions {
  timeoutMs?: number
}

export interface CompileResult {
  success: boolean
  pdfBuffer?: Buffer
  pageCount?: number
  errors?: LatexError[]
  rawLog?: string
  durationMs: number
}

/**
 * Extracts approximate page count from raw PDF buffer without external binary dependencies.
 */
function extractPdfPageCount(pdfBuffer: Buffer): number {
  try {
    const text = pdfBuffer.toString('latin1')
    // Look for /Count in /Pages dictionary
    const countMatches = [...text.matchAll(/\/Type\s*\/Pages[^>]*\/Count\s+(\d+)/g)]
    if (countMatches.length > 0) {
      const lastMatch = countMatches[countMatches.length - 1]
      return parseInt(lastMatch[1], 10)
    }

    // Alternative: count /Type /Page occurrences
    const pageMatches = [...text.matchAll(/\/Type\s*\/Page\b/g)]
    if (pageMatches.length > 0) {
      return pageMatches.length
    }
  } catch {
    // Ignore and fallback
  }
  return 1
}

/**
 * Executes pdflatex in an isolated temporary directory with timeout and paranoid flags.
 */
export async function compileLatexSandbox(
  latexSource: string,
  options: CompileOptions = {}
): Promise<CompileResult> {
  const timeoutMs = options.timeoutMs ?? 15000
  const startTime = Date.now()

  // 1. Create isolated temporary directory
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'latexai-compile-'))
  const texFilePath = path.join(tempDir, 'document.tex')
  const pdfFilePath = path.join(tempDir, 'document.pdf')
  const logFilePath = path.join(tempDir, 'document.log')

  try {
    // 2. Write source file
    await fs.writeFile(texFilePath, latexSource, 'utf8')

    // 3. Spawn pdflatex process
    const args = [
      '-interaction=nonstopmode',
      '-halt-on-error',
      '-no-shell-escape',
      `-output-directory=${tempDir}`,
      'document.tex',
    ]

    const child = spawn('pdflatex', args, {
      cwd: tempDir,
      env: {
        ...process.env,
        // Enforce paranoid texmf config
        TEXMFCNF: path.resolve(__dirname, '..'),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    let timedOut = false

    child.stdout?.on('data', (data) => {
      stdout += data.toString()
    })
    child.stderr?.on('data', (data) => {
      stderr += data.toString()
    })

    const processPromise = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
      (resolve) => {
        child.on('close', (code, signal) => {
          resolve({ code, signal })
        })
        child.on('error', (err) => {
          stderr += `\nProcess error: ${err.message}`
          resolve({ code: -1, signal: null })
        })
      }
    )

    const timer = setTimeout(() => {
      timedOut = true
      try {
        child.kill('SIGKILL')
      } catch {
        // Process might have exited already
      }
    }, timeoutMs)

    const { code } = await processPromise
    clearTimeout(timer)

    const durationMs = Date.now() - startTime

    if (timedOut) {
      return {
        success: false,
        durationMs,
        errors: [
          {
            message: `LaTeX compilation timed out after ${timeoutMs}ms. Likely caused by an infinite loop or recursive macro.`,
          },
        ],
        rawLog: `${stdout}\n${stderr}\n[TIMEOUT] Compilation killed after ${timeoutMs}ms.`,
      }
    }

    // Read log output if available
    let logOutput = `${stdout}\n${stderr}`
    try {
      const fileLog = await fs.readFile(logFilePath, 'utf8')
      logOutput = fileLog
    } catch {
      // Log file may not exist if pdflatex failed to launch
    }

    // Check if PDF was successfully produced and exit code is 0
    let pdfBuffer: Buffer | null = null
    try {
      pdfBuffer = await fs.readFile(pdfFilePath)
    } catch {
      pdfBuffer = null
    }

    if (code === 0 && pdfBuffer) {
      const pageCount = extractPdfPageCount(pdfBuffer)
      return {
        success: true,
        pdfBuffer,
        pageCount,
        durationMs,
        rawLog: logOutput,
      }
    }

    // Parse compilation errors
    const errors = parseLatexErrors(logOutput)

    return {
      success: false,
      durationMs,
      errors: errors.length > 0 ? errors : [{ message: 'Compilation failed with unknown error.' }],
      rawLog: logOutput,
    }
  } finally {
    // 4. Always clean up temporary directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true })
    } catch {
      // Ignore cleanup error in temp directory
    }
  }
}
