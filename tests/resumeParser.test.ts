import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { app } from '../src/app.js'
import { generateTestToken } from './helpers/jwt.js'
import { verifyFileMagicBytes, extractResumeText } from '../src/utils/textExtractor.js'

// Minimal synthetic PDF with selectable text
const SAMPLE_VALID_PDF = Buffer.from(
  `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length 260 >>
stream
BT
/F1 12 Tf
50 700 Td
(Alex Rivera Senior Engineer) Tj
/F1 10 Tf
0 -20 Td
(Summary: Experienced engineer with 8 years building distributed systems TypeScript and React platforms.) Tj
0 -20 Td
(Experience: Staff Engineer at CloudCorp leading architectural migrations and scaling Kubernetes.) Tj
ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000246 00000 n 
0000000559 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
634
%%EOF`
)

// Minimal synthetic scanned PDF with empty page text
const SAMPLE_SCANNED_PDF = Buffer.from(
  `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>
endobj
4 0 obj
<< /Length 0 >>
stream
endstream
endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000201 00000 n 
trailer
<< /Size 5 /Root 1 0 R >>
startxref
251
%%EOF`
)

describe('Resume Parser & Text Extraction (BE-2.12 - BE-2.18)', () => {
  describe('File Magic Bytes Validation (BE-2.12)', () => {
    it('detects PDF magic bytes correctly', () => {
      const type = verifyFileMagicBytes(SAMPLE_VALID_PDF)
      expect(type).toBe('pdf')
    })

    it('detects DOCX magic bytes correctly (PK zip header)', () => {
      const docxHeader = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00])
      const type = verifyFileMagicBytes(docxHeader)
      expect(type).toBe('docx')
    })

    it('rejects corrupt/unsupported files with INVALID_FILE_TYPE', () => {
      const corrupt = Buffer.from('NOT_A_VALID_FILE_HEADER')
      expect(() => verifyFileMagicBytes(corrupt)).toThrow()
    })
  })

  describe('Text Extraction & Scanned Detection (BE-2.13)', () => {
    it('extracts text from valid text PDF', async () => {
      const result = await extractResumeText(SAMPLE_VALID_PDF)
      expect(result.pageCount).toBeGreaterThanOrEqual(1)
      expect(result.rawText).toContain('Alex Rivera')
      expect(result.wordCount).toBeGreaterThan(10)
    })

    it('detects scanned PDF and throws SCANNED_PDF error', async () => {
      await expect(extractResumeText(SAMPLE_SCANNED_PDF)).rejects.toThrow()
    })
  })

  describe('Resume Import Endpoints Pipeline (BE-2.12, BE-2.15, BE-2.16, BE-2.17)', () => {
    let importId = ''

    it('POST /profile/import-resume uploads file and returns draft with parsedData', async () => {
      const token = await generateTestToken({ sub: 'usr_import_tester' })
      const res = await request(app)
        .post('/api/v1/profile/import-resume')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', SAMPLE_VALID_PDF, 'alex_rivera_resume.pdf')

      expect(res.status).toBe(201)
      expect(res.body.success).toBe(true)
      expect(res.body.data).toHaveProperty('importId')
      expect(res.body.data).toHaveProperty('parsedData')
      expect(res.body.data).toHaveProperty('expiresAt')

      importId = res.body.data.importId
    })

    it('POST /profile/import-resume/:importId/confirm merges draft into profile', async () => {
      const token = await generateTestToken({ sub: 'usr_import_tester' })
      const res = await request(app)
        .post(`/api/v1/profile/import-resume/${importId}/confirm`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          strategy: 'merge',
          sections: {
            contact: true,
            experience: true,
            skills: true,
          },
        })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data).toHaveProperty('fullName')
    })

    it('DELETE /profile/import-resume/:importId discards stale draft', async () => {
      const token = await generateTestToken({ sub: 'usr_import_tester' })
      // Create a fresh draft to discard
      const uploadRes = await request(app)
        .post('/api/v1/profile/import-resume')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', SAMPLE_VALID_PDF, 'draft_to_delete.pdf')

      const draftId = uploadRes.body.data.importId
      const deleteRes = await request(app)
        .delete(`/api/v1/profile/import-resume/${draftId}`)
        .set('Authorization', `Bearer ${token}`)

      expect(deleteRes.status).toBe(200)
      expect(deleteRes.body.success).toBe(true)
      expect(deleteRes.body.data).toHaveProperty('discarded', true)
    })
  })
})
