/**
 * LaTeX Compiler Log Parser.
 * Complies with task BE-3.24.
 */

export interface LatexError {
  line?: number
  message: string
  context?: string
}

/**
 * Parses raw stdout/stderr and .log output from pdflatex into structured error objects.
 */
export function parseLatexErrors(logOutput: string | null | undefined): LatexError[] {
  if (!logOutput) return []

  const errors: LatexError[] = []
  const lines = logOutput.split(/\r?\n/)

  let currentError: Partial<LatexError> | null = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line) continue

    // Detection of standard LaTeX error trigger line starting with "! "
    if (line.startsWith('! ')) {
      if (currentError && currentError.message) {
        errors.push(currentError as LatexError)
      }

      currentError = {
        message: line.substring(2).trim(),
      }
      continue
    }

    // Detection of line number indicator: "l.<number> <context snippet>"
    if (currentError && /^l\.\d+/.test(line)) {
      const match = line.match(/^l\.(\d+)\s*(.*)$/)
      if (match && match[1]) {
        currentError.line = parseInt(match[1], 10)
        currentError.context = match[2] ? match[2].trim() : ''
      }
      errors.push(currentError as LatexError)
      currentError = null
      continue
    }

    // Detection of fatal emergency stops
    if (line.includes('Emergency stop') || line.includes('Fatal error occurred')) {
      if (currentError && currentError.message) {
        errors.push(currentError as LatexError)
        currentError = null
      }
      if (errors.length === 0) {
        errors.push({ message: line.trim() })
      }
    }
  }

  if (currentError && currentError.message) {
    errors.push(currentError as LatexError)
  }

  if (errors.length === 0 && logOutput.includes('Error')) {
    errors.push({
      message: 'Unknown compilation error occurred. Inspect raw compiler log for details.',
    })
  }

  return errors
}
