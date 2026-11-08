/**
 * LaTeX Template Security Linter and Validation Engine.
 * Complies with tasks BE-3.04 and BE-3.27.
 */

import { ALLOWED_PLACEHOLDERS, extractPlaceholders } from './placeholders.js'

export interface LintResult {
  valid: boolean
  errors: string[]
  placeholdersFound: string[]
}

// Dangerous commands and primitives that could read arbitrary files or execute shell commands
const FORBIDDEN_PATTERNS: Array<{ regex: RegExp; rule: string; description: string }> = [
  {
    regex: /\\write18\b/i,
    rule: 'FORBIDDEN_SHELL_ESCAPE',
    description: 'Shell escape command (\\write18) is strictly prohibited.',
  },
  {
    regex: /\\sys_shell_now\b/i,
    rule: 'FORBIDDEN_L3_SHELL_ESCAPE',
    description: 'LaTeX3 shell command execution is strictly prohibited.',
  },
  {
    regex: /\\input\s*[\s{]/i,
    rule: 'FORBIDDEN_INPUT',
    description: 'Arbitrary file inclusion via \\input is prohibited.',
  },
  {
    regex: /\\include\s*[\s{]/i,
    rule: 'FORBIDDEN_INCLUDE',
    description: 'Arbitrary file inclusion via \\include is prohibited.',
  },
  {
    regex: /\\openin\b/i,
    rule: 'FORBIDDEN_FILE_READ',
    description: 'File reading primitive \\openin is prohibited.',
  },
  {
    regex: /\\read\b/i,
    rule: 'FORBIDDEN_STREAM_READ',
    description: 'Token reading primitive \\read is prohibited.',
  },
  {
    regex: /\\openout\b/i,
    rule: 'FORBIDDEN_FILE_WRITE',
    description: 'File writing primitive \\openout is prohibited.',
  },
  {
    regex: /\\newwrite\b/i,
    rule: 'FORBIDDEN_STREAM_WRITE',
    description: 'Stream creation primitive \\newwrite is prohibited.',
  },
  {
    regex: /\\directlua\b/i,
    rule: 'FORBIDDEN_LUA_EXEC',
    description: 'Direct Lua code execution via \\directlua is prohibited.',
  },
  {
    regex: /\\catcode\b/i,
    rule: 'FORBIDDEN_CATCODE_MUTATION',
    description: 'Modifying category codes via \\catcode is prohibited.',
  },
  {
    regex: /\\csname\b/i,
    rule: 'FORBIDDEN_CSNAME',
    description: 'Dynamic control sequence formation via \\csname is prohibited.',
  },
]

/**
 * Lints a LaTeX template string for structural integrity, placeholder compliance,
 * and security vulnerabilities.
 */
export function lintTemplate(latex: string | null | undefined): LintResult {
  const errors: string[] = []

  if (!latex || typeof latex !== 'string' || latex.trim().length === 0) {
    return {
      valid: false,
      errors: ['Template body cannot be empty.'],
      placeholdersFound: [],
    }
  }

  // 1. Structural Checks
  if (!latex.includes('\\documentclass')) {
    errors.push('Template missing \\documentclass declaration.')
  }
  if (!latex.includes('\\begin{document}')) {
    errors.push('Template missing \\begin{document}.')
  }
  if (!latex.includes('\\end{document}')) {
    errors.push('Template missing \\end{document}.')
  }

  // 2. Security Checks (Command Injection / File Inclusion)
  for (const { regex, description } of FORBIDDEN_PATTERNS) {
    if (regex.test(latex)) {
      errors.push(`Security error: ${description}`)
    }
  }

  // 3. Placeholder Validation
  const foundPlaceholders = extractPlaceholders(latex)
  const allowedSet = new Set<string>(ALLOWED_PLACEHOLDERS)

  for (const placeholder of foundPlaceholders) {
    if (!allowedSet.has(placeholder)) {
      errors.push(`Unrecognized placeholder detected: "${placeholder}".`)
    }
  }

  if (!foundPlaceholders.includes('{{FULL_NAME}}')) {
    errors.push('Template must at least contain the {{FULL_NAME}} placeholder.')
  }

  return {
    valid: errors.length === 0,
    errors,
    placeholdersFound: foundPlaceholders,
  }
}
