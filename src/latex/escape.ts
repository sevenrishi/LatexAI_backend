/**
 * LaTeX character escaping and URL sanitization utilities.
 * Complies with tasks BE-3.12, BE-3.13, BE-3.14.
 */

const LATEX_ESCAPE_MAP: Record<string, string> = {
  '\\': '\\textbackslash{}',
  '{': '\\{',
  '}': '\\}',
  $: '\\$',
  '&': '\\&',
  '#': '\\#',
  '^': '\\textasciicircum{}',
  _: '\\_',
  '~': '\\textasciitilde{}',
  '%': '\\%',
  '<': '\\textless{}',
  '>': '\\textgreater{}',
  '|': '\\textbar{}',
}

const UNICODE_TRANSLATION_MAP: Record<string, string> = {
  '\u201C': '``', // Left double quote
  '\u201D': "''", // Right double quote
  '\u2018': '`', // Left single quote
  '\u2019': "'", // Right single quote / apostrophe
  '\u2014': '---', // Em dash
  '\u2013': '--', // En dash
  '\u2026': '\\ldots{}', // Horizontal ellipsis
  '\u00A0': '~', // Non-breaking space
  '\u2022': '\\textbullet{}', // Bullet
  '\u00B0': '\\textdegree{}', // Degree symbol
  '\u00A9': '\\copyright{}', // Copyright
  '\u00AE': '\\textregistered{}', // Registered trademark
  '\u2122': '\\texttrademark{}', // Trademark
  '\u20AC': '\\texteuro{}', // Euro
  '\u00A3': '\\pounds{}', // Pound
  '\u00A5': '\\textyen{}', // Yen
}

// Single-pass regex covering both LaTeX special chars and Unicode characters
const COMBINED_ESCAPE_REGEX =
  /([\\{}$&#^_%~<>|])|([\u201C\u201D\u2018\u2019\u2014\u2013\u2026\u00A0\u2022\u00B0\u00A9\u00AE\u2122\u20AC\u00A3\u00A5])/g

/**
 * Escapes plain text strings for safe injection into LaTeX bodies.
 * Uses a single-pass regex replacement to avoid double-escaping bugs.
 */
export function escapeLatex(text: string | null | undefined): string {
  if (!text) return ''

  // Normalize string to NFC
  const normalized = text.normalize('NFC')

  return normalized.replace(COMBINED_ESCAPE_REGEX, (match, specialChar, unicodeChar) => {
    if (specialChar && LATEX_ESCAPE_MAP[specialChar]) {
      return LATEX_ESCAPE_MAP[specialChar]
    }
    if (unicodeChar && UNICODE_TRANSLATION_MAP[unicodeChar]) {
      return UNICODE_TRANSLATION_MAP[unicodeChar]
    }
    return match
  })
}

/**
 * Escapes URLs for use inside `\href{url}{text}`.
 * Only escapes characters that break the href target argument (% # & _ ~).
 * Strips dangerous javascript:, data:, or vbscript: URI schemes.
 */
export function escapeLatexUrl(url: string | null | undefined): string {
  if (!url) return ''

  const trimmed = url.trim()

  // Prevent protocol injection (e.g. javascript:, file:)
  const lower = trimmed.toLowerCase()
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('data:') ||
    lower.startsWith('vbscript:') ||
    lower.startsWith('file:')
  ) {
    return ''
  }

  // Inside \href{...}{...}, the first argument requires escaping % # & _ ~
  // but forward slashes, dots, hyphens, colons must remain intact.
  return trimmed
    .replace(/\\/g, '') // strip literal backslashes
    .replace(/%/g, '\\%')
    .replace(/#/g, '\\#')
    .replace(/&/g, '\\&')
    .replace(/_/g, '\\_')
    .replace(/~/g, '\\textasciitilde{}')
}
