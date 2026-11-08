/**
 * PDF Text Inspection & ATS Parseability Auditor
 * Complies with task BE-5.06.
 *
 * Uses `pdf-parse` to extract text from compiled or uploaded PDFs
 * and audits text extractability, essential sections, and font integrity.
 */

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { PDFParse } from 'pdf-parse'
import { normalizeText } from './normalize.js'

export interface PdfInspectionIssue {
  code: string
  severity: 'error' | 'warning' | 'info'
  message: string
  deduction: number
}

export interface PdfInspectionResult {
  textExtractable: boolean
  rawText: string
  pageCount: number
  wordCount: number
  characterCount: number
  detectedSections: string[]
  missingSections: string[]
  contactInfoDetected: {
    hasEmail: boolean
    hasPhone: boolean
    hasLinks: boolean
  }
  issues: PdfInspectionIssue[]
  score: number // 0-100 format & parseability score
}

const ESSENTIAL_SECTIONS = [
  { name: 'Summary', patterns: [/\b(summary|profile|about|professional summary)\b/i] },
  { name: 'Experience', patterns: [/\b(experience|work experience|employment|work history)\b/i] },
  { name: 'Education', patterns: [/\b(education|academic|academics|degree|university)\b/i] },
  { name: 'Skills', patterns: [/\b(skills|technical skills|technologies|competencies)\b/i] },
]

const OPTIONAL_SECTIONS = [
  { name: 'Projects', patterns: [/\b(projects|technical projects|personal projects)\b/i] },
  { name: 'Certifications', patterns: [/\b(certifications|certificates|licenses)\b/i] },
]

/**
 * Extracts and audits text from a compiled PDF buffer (BE-5.06).
 */
export async function inspectPdfText(pdfBuffer: Buffer): Promise<PdfInspectionResult> {
  const issues: PdfInspectionIssue[] = []
  let deductionSum = 0

  if (!pdfBuffer || pdfBuffer.length < 10) {
    return {
      textExtractable: false,
      rawText: '',
      pageCount: 0,
      wordCount: 0,
      characterCount: 0,
      detectedSections: [],
      missingSections: ESSENTIAL_SECTIONS.map((s) => s.name),
      contactInfoDetected: { hasEmail: false, hasPhone: false, hasLinks: false },
      issues: [
        {
          code: 'EMPTY_OR_CORRUPT_PDF',
          severity: 'error',
          message: 'The PDF file is empty or corrupted.',
          deduction: 100,
        },
      ],
      score: 0,
    }
  }

  let extractedRaw = ''
  let pageCount = 1

  try {
    if (typeof PDFParse === 'function') {
      const parser = new PDFParse({ data: pdfBuffer })
      const result = await parser.getText()
      extractedRaw = result.text || ''
      pageCount = result.total || 1
    }
  } catch (err) {
    return {
      textExtractable: false,
      rawText: '',
      pageCount: 1,
      wordCount: 0,
      characterCount: 0,
      detectedSections: [],
      missingSections: ESSENTIAL_SECTIONS.map((s) => s.name),
      contactInfoDetected: { hasEmail: false, hasPhone: false, hasLinks: false },
      issues: [
        {
          code: 'PDF_PARSE_FAILED',
          severity: 'error',
          message: `Unable to extract selectable text from PDF: ${(err as Error).message}`,
          deduction: 80,
        },
      ],
      score: 20,
    }
  }

  const normalized = normalizeText(extractedRaw)
  const words = normalized.split(/\s+/).filter(Boolean)
  const wordCount = words.length
  const characterCount = normalized.length

  // 1. Text Extractability Check (Scanned image PDF guard)
  const textExtractable = wordCount >= 15
  if (!textExtractable) {
    deductionSum += 60
    issues.push({
      code: 'SCANNED_OR_FLATTENED_PDF',
      severity: 'error',
      message: 'Very little or no selectable text detected. ATS scanners cannot read scanned, image-only, or flattened vector resumes.',
      deduction: 60,
    })
  }

  // 2. Garbled Font Encoding Check
  if (characterCount > 50) {
    // Non-printable control characters (excluding newline/tab/carriage return)
    let controlChars = 0
    for (let i = 0; i < extractedRaw.length; i++) {
      const code = extractedRaw.charCodeAt(i)
      if ((code < 32 && code !== 9 && code !== 10 && code !== 13) || code === 0xfffd) {
        controlChars++
      }
    }
    const controlRatio = controlChars / characterCount
    if (controlRatio > 0.05) {
      deductionSum += 25
      issues.push({
        code: 'GARBLED_FONT_ENCODING',
        severity: 'error',
        message: 'High density of unprintable or corrupted characters detected. Ensure LaTeX font packages embed standard Type-1 or TrueType unicode fonts.',
        deduction: 25,
      })
    }
  }

  // 3. Contact Info Detection
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/
  const phoneRegex = /(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{2,4}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/
  const linkRegex = /(?:https?:\/\/|www\.|linkedin\.com|github\.com)/i

  const hasEmail = emailRegex.test(extractedRaw)
  const hasPhone = phoneRegex.test(extractedRaw)
  const hasLinks = linkRegex.test(extractedRaw)

  if (!hasEmail) {
    deductionSum += 10
    issues.push({
      code: 'MISSING_EMAIL',
      severity: 'warning',
      message: 'No contact email address identified in resume body.',
      deduction: 10,
    })
  }

  if (!hasPhone) {
    deductionSum += 5
    issues.push({
      code: 'MISSING_PHONE',
      severity: 'info',
      message: 'No contact phone number detected in resume body.',
      deduction: 5,
    })
  }

  // 4. Section Presence Checks
  const detectedSections: string[] = []
  const missingSections: string[] = []

  for (const sec of ESSENTIAL_SECTIONS) {
    const found = sec.patterns.some((pattern) => pattern.test(normalized))
    if (found) {
      detectedSections.push(sec.name)
    } else {
      missingSections.push(sec.name)
      deductionSum += 10
      issues.push({
        code: `MISSING_SECTION_${sec.name.toUpperCase()}`,
        severity: 'warning',
        message: `Essential section "${sec.name}" not clearly identified by standard ATS heading names.`,
        deduction: 10,
      })
    }
  }

  for (const sec of OPTIONAL_SECTIONS) {
    const found = sec.patterns.some((pattern) => pattern.test(normalized))
    if (found) {
      detectedSections.push(sec.name)
    }
  }

  // 5. Length & Word Count Guards
  if (pageCount > 2) {
    deductionSum += 10
    issues.push({
      code: 'EXCESSIVE_PAGE_COUNT',
      severity: 'warning',
      message: `Resume is ${pageCount} pages long. ATS best practices and recruiter standards recommend 1-2 pages maximum.`,
      deduction: 10,
    })
  }

  if (wordCount > 0 && wordCount < 150) {
    deductionSum += 15
    issues.push({
      code: 'INSUFFICIENT_WORD_COUNT',
      severity: 'warning',
      message: `Resume contains only ${wordCount} words, which is unusually brief for ATS keyword matching.`,
      deduction: 15,
    })
  }

  const score = Math.max(0, Math.min(100, 100 - deductionSum))

  return {
    textExtractable,
    rawText: extractedRaw,
    pageCount,
    wordCount,
    characterCount,
    detectedSections,
    missingSections,
    contactInfoDetected: {
      hasEmail,
      hasPhone,
      hasLinks,
    },
    issues,
    score,
  }
}
