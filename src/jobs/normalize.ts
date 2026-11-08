import { AppError } from '../utils/errors.js'

export const MIN_JD_LENGTH = 50
export const MAX_JD_LENGTH = 50000

/**
 * Normalizes job description raw text by standardizing line breaks,
 * stripping non-printable control characters, and trimming excessive whitespace.
 */
export function normalizeJobText(rawText: string): string {
  if (!rawText) return ''

  return (
    rawText
      // Standardize newlines
      .replace(/\r\n|\r/g, '\n')
      // Remove ASCII control characters (keeping tab and newline)
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      // Collapse excessive blank lines (more than 2 consecutive newlines)
      .replace(/\n{3,}/g, '\n\n')
      // Trim surrounding whitespace
      .trim()
  )
}

/**
 * Validates and normalizes job description text sizing constraints.
 */
export function validateJobText(rawText: string): {
  valid: boolean
  normalized: string
  error?: string
} {
  const normalized = normalizeJobText(rawText)

  if (normalized.length < MIN_JD_LENGTH) {
    return {
      valid: false,
      normalized,
      error: `Job description is too short (minimum ${MIN_JD_LENGTH} characters required, received ${normalized.length}).`,
    }
  }

  if (normalized.length > MAX_JD_LENGTH) {
    return {
      valid: false,
      normalized,
      error: `Job description exceeds maximum allowed length of ${MAX_JD_LENGTH} characters (received ${normalized.length}).`,
    }
  }

  return { valid: true, normalized }
}

/**
 * Ensures job description text is valid or throws AppError.
 */
export function assertValidJobText(rawText: string): string {
  const { valid, normalized, error } = validateJobText(rawText)
  if (!valid) {
    throw AppError.badRequest(error || 'Invalid job description text')
  }
  return normalized
}
