import { describe, it, expect } from 'vitest'
import {
  normalizeText,
  canonicalizeKeyword,
  getSynonymVariants,
  matchTermInText,
} from '../src/ats/normalize.js'
import { checkLatexStructure } from '../src/ats/latexChecker.js'
import { inspectPdfText } from '../src/ats/pdfInspector.js'
import { calculateAtsScore } from '../src/ats/scorer.js'

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
<< /Length 380 >>
stream
BT
/F1 12 Tf
50 720 Td
(Alex Rivera - alex@example.com - 555-0199 - linkedin.com/in/alexrivera) Tj
/F1 10 Tf
0 -25 Td
(Professional Summary: Senior Software Engineer with 8 years building distributed systems in Go, TypeScript, React, and PostgreSQL.) Tj
0 -25 Td
(Work Experience: Staff Engineer at CloudCorp leading architectural migrations, Docker containerization, and Kafka event streaming.) Tj
0 -25 Td
(Education: BS in Computer Science from UC Berkeley.) Tj
0 -25 Td
(Technical Skills: Go, TypeScript, React, Node.js, Kubernetes, PostgreSQL, Kafka, CI/CD, Docker, Redis.) Tj
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
00000000115 00000 n 
00000000246 00000 n 
00000000679 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
754
%%EOF`
)

const SAMPLE_SCANNED_EMPTY_PDF = Buffer.from(
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
<< /Length 10 >>
stream
BT
ET
endstream
endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
00000000115 00000 n 
00000000200 00000 n 
trailer
<< /Size 5 /Root 1 0 R >>
startxref
260
%%EOF`
)

describe('ATS Text Normalization & Synonym Mapping (BE-5.01)', () => {
  it('normalizes smart quotes, dashes, unicode spaces, and linebreaks', () => {
    const raw = `“Expert” in ‘React’ — with\u00A0TypeScript\r\n\r\nand   Node.js.`
    const normalized = normalizeText(raw)
    expect(normalized).toBe('"Expert" in \'React\' - with TypeScript and Node.js.')
  })

  it('resolves canonical keywords and synonyms correctly', () => {
    expect(canonicalizeKeyword('k8s')).toBe('kubernetes')
    expect(canonicalizeKeyword('node.js')).toBe('nodejs')
    expect(canonicalizeKeyword('react.js')).toBe('react')
    expect(canonicalizeKeyword('golang')).toBe('golang')
    expect(canonicalizeKeyword('py')).toBe('python')
    expect(canonicalizeKeyword('postgres')).toBe('postgresql')
    expect(canonicalizeKeyword('ci/cd')).toBe('cicd')

    const reactVariants = getSynonymVariants('react')
    expect(reactVariants).toContain('react')
    expect(reactVariants).toContain('reactjs')
    expect(reactVariants).toContain('react.js')
  })
})

describe('Boundary-Aware Term Matching (BE-5.02)', () => {
  it('matches short language "Go" without false positives on words like "good" or "algorithm"', () => {
    const text1 = 'He is a good programmer who writes algorithms in Go and Python.'
    const matchGo = matchTermInText(text1, 'Go')
    expect(matchGo.matched).toBe(true)
    expect(matchGo.count).toBe(1)

    const text2 = 'He is a good programmer who loves category theory and algorithms.'
    const matchGoNegative = matchTermInText(text2, 'Go')
    expect(matchGoNegative.matched).toBe(false)
    expect(matchGoNegative.count).toBe(0)
  })

  it('matches C, C++, and C# accurately with symbol boundary preservation', () => {
    const textCpp = 'Developed low-latency trading software in C++ and C# microservices.'
    const matchCpp = matchTermInText(textCpp, 'C++')
    expect(matchCpp.matched).toBe(true)
    expect(matchCpp.count).toBe(1)

    const matchCSharp = matchTermInText(textCpp, 'C#')
    expect(matchCSharp.matched).toBe(true)
    expect(matchCSharp.count).toBe(1)

    // C should not match C++ or C#
    const matchStandaloneC = matchTermInText(textCpp, 'C')
    expect(matchStandaloneC.matched).toBe(false)

    const textStandaloneC = 'Firmware developed in C and ARM assembly.'
    const matchStandaloneC2 = matchTermInText(textStandaloneC, 'C')
    expect(matchStandaloneC2.matched).toBe(true)
  })

  it('matches terms through synonym aliases', () => {
    const resumeText = 'Maintained K8s clusters and containerized applications.'
    const matchK8s = matchTermInText(resumeText, 'Kubernetes')
    expect(matchK8s.matched).toBe(true)
    expect(matchK8s.matchedAs).toBe('k8s')

    const resumeText2 = 'Experienced with Postgres and AWS infrastructure.'
    const matchPg = matchTermInText(resumeText2, 'PostgreSQL')
    expect(matchPg.matched).toBe(true)
    expect(matchPg.matchedAs).toBe('postgres')
  })
})

describe('LaTeX Template Structure Checks (BE-5.05)', () => {
  it('flags tables, multi-column layouts, and FontAwesome icons as ATS risks', () => {
    const dangerousLatex = `
\\documentclass{article}
\\usepackage{fontawesome5}
\\begin{document}
\\begin{tabular}{cc}
  Left & Right \\\\
\\end{tabular}
\\begin{multicols}{2}
  Column 1 & Column 2
\\end{multicols}
\\faEnvelope alex@example.com
\\end{document}
`
    const result = checkLatexStructure(dangerousLatex)
    expect(result.passed).toBe(false)
    expect(result.hasTables).toBe(true)
    expect(result.hasColumns).toBe(true)
    expect(result.hasIcons).toBe(true)
    expect(result.score).toBeLessThan(70)
    expect(result.issues.some((i) => i.code === 'UNFRIENDLY_TABLES')).toBe(true)
    expect(result.issues.some((i) => i.code === 'UNFRIENDLY_COLUMNS')).toBe(true)
  })

  it('passes clean single-column ATS-friendly LaTeX templates with high score', () => {
    const cleanLatex = `
\\documentclass[letterpaper,11pt]{article}
\\begin{document}
\\section{Experience}
\\begin{itemize}
  \\item Built microservices in Go and PostgreSQL.
\\end{itemize}
\\end{document}
`
    const result = checkLatexStructure(cleanLatex)
    expect(result.passed).toBe(true)
    expect(result.hasTables).toBe(false)
    expect(result.hasColumns).toBe(false)
    expect(result.hasIcons).toBe(false)
    expect(result.score).toBe(100)
    expect(result.issues.length).toBe(0)
  })
})

describe('PDF Text Inspection Checks (BE-5.06)', () => {
  it('extracts text, detects essential sections and contact info from selectable PDF', async () => {
    const inspection = await inspectPdfText(SAMPLE_VALID_PDF)

    expect(inspection.textExtractable).toBe(true)
    expect(inspection.pageCount).toBe(1)
    expect(inspection.wordCount).toBeGreaterThan(30)
    expect(inspection.contactInfoDetected.hasEmail).toBe(true)
    expect(inspection.contactInfoDetected.hasPhone).toBe(true)
    expect(inspection.contactInfoDetected.hasLinks).toBe(true)
    expect(inspection.detectedSections).toContain('Summary')
    expect(inspection.detectedSections).toContain('Experience')
    expect(inspection.detectedSections).toContain('Education')
    expect(inspection.detectedSections).toContain('Skills')
    expect(inspection.missingSections.length).toBe(0)
    expect(inspection.score).toBeGreaterThanOrEqual(80)
  })

  it('flags scanned or empty PDF as non-extractable with severe deduction', async () => {
    const inspection = await inspectPdfText(SAMPLE_SCANNED_EMPTY_PDF)

    expect(inspection.textExtractable).toBe(false)
    expect(inspection.wordCount).toBeLessThan(15)
    expect(inspection.issues.some((i) => i.code === 'SCANNED_OR_FLATTENED_PDF')).toBe(true)
    expect(inspection.score).toBeLessThanOrEqual(40)
  })
})

describe('Weighted ATS Scoring Formula & Empty Keywords Handling (BE-5.03, BE-5.04)', () => {
  const resumeText =
    'Alex Rivera alex@example.com Senior Software Engineer with extensive experience in Go, TypeScript, PostgreSQL, Docker, Kubernetes, and Kafka.'

  it('calculates weighted ATS score with keyword categories and format audits', () => {
    const scoreResult = calculateAtsScore({
      resumeText,
      keywords: {
        requiredSkills: ['Go', 'TypeScript', 'PostgreSQL'],
        preferredSkills: ['Docker', 'Kubernetes'],
        domainKeywords: ['Distributed Systems', 'Kafka'],
      },
    })

    expect(scoreResult.score).toBeGreaterThanOrEqual(80)
    expect(['A', 'B']).toContain(scoreResult.grade)
    expect(scoreResult.keywordAnalysis.matchedCount).toBeGreaterThanOrEqual(5)
    expect(scoreResult.keywordAnalysis.coveragePercentage).toBeGreaterThanOrEqual(70)
    expect(scoreResult.breakdown.keywordScore).toBeGreaterThan(0)
    expect(scoreResult.breakdown.formatScore).toBe(100)
    expect(scoreResult.suggestions.length).toBeGreaterThan(0)
  })

  it('handles empty keyword sets gracefully without division-by-zero or NaN (BE-5.04)', () => {
    const scoreResult = calculateAtsScore({
      resumeText,
      keywords: {
        requiredSkills: [],
        preferredSkills: [],
        domainKeywords: [],
      },
    })

    expect(Number.isNaN(scoreResult.score)).toBe(false)
    expect(scoreResult.score).toBe(100)
    expect(scoreResult.grade).toBe('A')
    expect(scoreResult.keywordAnalysis.totalKeywords).toBe(0)
    expect(scoreResult.keywordAnalysis.matchedCount).toBe(0)
    expect(scoreResult.keywordAnalysis.missingCount).toBe(0)
    expect(scoreResult.keywordAnalysis.coveragePercentage).toBe(100)
  })

  it('penalizes format issues when LaTeX structure checks fail', () => {
    const latexCheck = checkLatexStructure(`
\\begin{tabular}{cc} a & b \\end{tabular}
\\begin{multicols}{2} col1 & col2 \\end{multicols}
`)
    const scoreResult = calculateAtsScore({
      resumeText,
      keywords: { requiredSkills: ['Go'] },
      latexStructure: latexCheck,
    })

    expect(scoreResult.formatChecks.passed).toBe(false)
    expect(scoreResult.formatChecks.score).toBeLessThan(70)
    expect(scoreResult.score).toBeLessThan(95)
  })
})
