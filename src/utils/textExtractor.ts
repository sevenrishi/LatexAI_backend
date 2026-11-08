// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { PDFParse } from 'pdf-parse'
import mammoth from 'mammoth'
import { AppError } from './errors.js'

export interface ExtractedResumeText {
  rawText: string
  pageCount?: number
  isScanned: boolean
  wordCount: number
}

/**
 * Validates magic bytes for PDF and DOCX
 */
export function verifyFileMagicBytes(buffer: Buffer): 'pdf' | 'docx' {
  if (buffer.length < 4) {
    throw AppError.badRequest('File is corrupted or empty.', null, 'INVALID_FILE')
  }

  // PDF magic bytes: %PDF (0x25 0x50 0x44 0x46)
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
    return 'pdf'
  }

  // DOCX / ZIP magic bytes: PK\x03\x04 (0x50 0x4B 0x03 0x04)
  if (buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04) {
    return 'docx'
  }

  throw AppError.badRequest(
    'Unsupported file format. Only PDF and DOCX files are allowed.',
    null,
    'INVALID_FILE_TYPE'
  )
}

/**
 * Extracts raw text from PDF or DOCX buffer with security guards
 */
export async function extractResumeText(
  buffer: Buffer,
  fileType?: 'pdf' | 'docx'
): Promise<ExtractedResumeText> {
  const detectedType = fileType || verifyFileMagicBytes(buffer)

  // Maximum allowed file size check (5MB)
  if (buffer.length > 5 * 1024 * 1024) {
    throw AppError.badRequest('File exceeds maximum allowed size of 5MB', null, 'FILE_TOO_LARGE')
  }

  if (detectedType === 'pdf') {
    try {
      let rawText = ''
      let pageCount = 1

      if (typeof PDFParse === 'function') {
        const parser = new PDFParse({ data: buffer })
        const result = await parser.getText()
        rawText = (result.text || '').trim()
        pageCount = result.total || 1
      }

      const wordCount = rawText.split(/\s+/).filter(Boolean).length

      // Scanned PDF detection: non-empty pages but very little selectable text
      if (pageCount > 0 && wordCount < 10) {
        throw AppError.badRequest(
          'Scanned PDF detected. Please upload a PDF with selectable text or a DOCX document.',
          { numPages: pageCount, extractedWords: wordCount },
          'SCANNED_PDF'
        )
      }

      return {
        rawText,
        pageCount,
        isScanned: false,
        wordCount,
      }
    } catch (err) {
      if (err instanceof AppError) throw err
      throw AppError.badRequest(
        `Failed to parse PDF: ${(err as Error).message || 'Invalid or corrupted document'}`,
        null,
        'PDF_PARSE_FAILED'
      )
    }
  }

  if (detectedType === 'docx') {
    try {
      const result = await mammoth.extractRawText({ buffer })
      const rawText = result.value.trim()
      const wordCount = rawText.split(/\s+/).filter(Boolean).length

      if (wordCount < 10) {
        throw AppError.badRequest(
          'DOCX document contains insufficient text content.',
          null,
          'EMPTY_DOCUMENT'
        )
      }

      return {
        rawText,
        isScanned: false,
        wordCount,
      }
    } catch (err) {
      if (err instanceof AppError) throw err
      throw AppError.badRequest(
        `Failed to parse DOCX: ${(err as Error).message || 'Invalid or corrupted document'}`,
        null,
        'DOCX_PARSE_FAILED'
      )
    }
  }

  throw AppError.badRequest('Unsupported file type for text extraction', null, 'UNSUPPORTED_TYPE')
}
