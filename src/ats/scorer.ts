/**
 * Weighted ATS Scoring Service
 * Complies with tasks BE-5.03 and BE-5.04.
 *
 * Combines keyword coverage (required, preferred, domain keywords)
 * with LaTeX and PDF format/parseability checks on a 0-100 scale.
 * Handled empty keyword sets gracefully without division-by-zero crashes.
 */

import { matchTermInText } from './normalize.js'
import type { LatexStructureCheckResult } from './latexChecker.js'
import type { PdfInspectionResult } from './pdfInspector.js'

export interface KeywordCategoryItem {
  keyword: string
  matched: boolean
  matchedAs?: string
  count: number
  importance: 'required' | 'preferred' | 'domain'
  category: string
}

export interface AtsScoreBreakdown {
  keywordScore: number
  formatScore: number
  sectionScore: number
}

export interface AtsScoreResult {
  score: number // 0-100
  grade: 'A' | 'B' | 'C' | 'D' | 'F'
  breakdown: AtsScoreBreakdown
  keywordAnalysis: {
    totalKeywords: number
    matchedCount: number
    missingCount: number
    coveragePercentage: number
    matched: Array<{
      keyword: string
      matchedAs?: string
      count: number
      importance: 'required' | 'preferred' | 'domain'
    }>
    missing: Array<{
      keyword: string
      importance: 'required' | 'preferred' | 'domain'
    }>
  }
  formatChecks: {
    score: number
    passed: boolean
    issues: Array<{
      id: string
      severity: 'error' | 'warning' | 'info'
      message: string
      deduction: number
    }>
    details: {
      hasTables: boolean
      hasColumns: boolean
      hasIcons: boolean
      textExtractable: boolean
      wordCount: number
      pageCount: number
      detectedSections: string[]
    }
  }
  suggestions: string[]
}

export interface CalculateAtsScoreOptions {
  resumeText: string
  keywords?: {
    requiredSkills?: string[]
    preferredSkills?: string[]
    bonusSkills?: string[]
    domainKeywords?: string[]
  }
  latexStructure?: LatexStructureCheckResult
  pdfInspection?: PdfInspectionResult
}

/**
 * Calculates weighted ATS score (0-100) combining keyword coverage and format audits (BE-5.03, BE-5.04).
 */
export function calculateAtsScore(options: CalculateAtsScoreOptions): AtsScoreResult {
  const { resumeText = '', keywords, latexStructure, pdfInspection } = options

  // -----------------------------------------------------------------
  // 1. Keyword Extraction & Categorization
  // -----------------------------------------------------------------
  const reqSkills = Array.from(new Set(keywords?.requiredSkills || [])).filter(Boolean)
  const prefSkills = Array.from(
    new Set([...(keywords?.preferredSkills || []), ...(keywords?.bonusSkills || [])])
  ).filter((s) => Boolean(s) && !reqSkills.includes(s))
  const domKeywords = Array.from(new Set(keywords?.domainKeywords || [])).filter(
    (s) => Boolean(s) && !reqSkills.includes(s) && !prefSkills.includes(s)
  )

  const allItems: KeywordCategoryItem[] = []

  for (const kw of reqSkills) {
    const match = matchTermInText(resumeText, kw)
    allItems.push({
      keyword: kw,
      matched: match.matched,
      matchedAs: match.matchedAs,
      count: match.count,
      importance: 'required',
      category: 'required_skills',
    })
  }

  for (const kw of prefSkills) {
    const match = matchTermInText(resumeText, kw)
    allItems.push({
      keyword: kw,
      matched: match.matched,
      matchedAs: match.matchedAs,
      count: match.count,
      importance: 'preferred',
      category: 'preferred_skills',
    })
  }

  for (const kw of domKeywords) {
    const match = matchTermInText(resumeText, kw)
    allItems.push({
      keyword: kw,
      matched: match.matched,
      matchedAs: match.matchedAs,
      count: match.count,
      importance: 'domain',
      category: 'domain_keywords',
    })
  }

  const totalKeywords = allItems.length
  const matchedItems = allItems.filter((i) => i.matched)
  const missingItems = allItems.filter((i) => !i.matched)
  const matchedCount = matchedItems.length
  const missingCount = missingItems.length

  // -----------------------------------------------------------------
  // 2. Keyword Coverage Scoring (Handles empty keyword sets gracefully BE-5.04)
  // -----------------------------------------------------------------
  let keywordScore = 100
  let coveragePercentage = 100

  if (totalKeywords > 0) {
    const reqItems = allItems.filter((i) => i.importance === 'required')
    const prefItems = allItems.filter((i) => i.importance === 'preferred')
    const domItems = allItems.filter((i) => i.importance === 'domain')

    const reqRate = reqItems.length > 0 ? reqItems.filter((i) => i.matched).length / reqItems.length : 1
    const prefRate = prefItems.length > 0 ? prefItems.filter((i) => i.matched).length / prefItems.length : 1
    const domRate = domItems.length > 0 ? domItems.filter((i) => i.matched).length / domItems.length : 1

    const wReq = reqItems.length > 0 ? 0.6 : 0
    const wPref = prefItems.length > 0 ? 0.2 : 0
    const wDom = domItems.length > 0 ? 0.2 : 0
    const wTotal = wReq + wPref + wDom

    if (wTotal > 0) {
      keywordScore = Math.round(((reqRate * wReq + prefRate * wPref + domRate * wDom) / wTotal) * 100)
    } else {
      keywordScore = 100
    }

    coveragePercentage = Math.round((matchedCount / totalKeywords) * 100)
  }

  // -----------------------------------------------------------------
  // 3. Format & Layout Auditing
  // -----------------------------------------------------------------
  const formatIssues: Array<{
    id: string
    severity: 'error' | 'warning' | 'info'
    message: string
    deduction: number
  }> = []

  let formatScore = 100
  let sectionScore = 100

  if (latexStructure) {
    for (const issue of latexStructure.issues) {
      formatIssues.push({
        id: issue.code,
        severity: issue.severity,
        message: issue.message,
        deduction: issue.deduction,
      })
    }
  }

  if (pdfInspection) {
    for (const issue of pdfInspection.issues) {
      formatIssues.push({
        id: issue.code,
        severity: issue.severity,
        message: issue.message,
        deduction: issue.deduction,
      })
    }

    // Section score derived from detected essential sections
    const missingSecCount = pdfInspection.missingSections.length
    sectionScore = Math.max(0, 100 - missingSecCount * 25)
  }

  if (latexStructure && pdfInspection) {
    formatScore = Math.round(latexStructure.score * 0.4 + pdfInspection.score * 0.6)
  } else if (latexStructure) {
    formatScore = latexStructure.score
  } else if (pdfInspection) {
    formatScore = pdfInspection.score
  }

  // -----------------------------------------------------------------
  // 4. Overall Weighted Score (0-100)
  // -----------------------------------------------------------------
  let finalScore: number
  if (totalKeywords > 0) {
    finalScore = Math.round(keywordScore * 0.7 + formatScore * 0.3)
  } else {
    // Graceful fallback when no keywords exist (BE-5.04)
    finalScore = formatScore
  }

  finalScore = Math.max(0, Math.min(100, finalScore))

  let grade: 'A' | 'B' | 'C' | 'D' | 'F'
  if (finalScore >= 90) grade = 'A'
  else if (finalScore >= 80) grade = 'B'
  else if (finalScore >= 70) grade = 'C'
  else if (finalScore >= 60) grade = 'D'
  else grade = 'F'

  // -----------------------------------------------------------------
  // 5. Actionable Improvement Suggestions
  // -----------------------------------------------------------------
  const suggestions: string[] = []

  const missingReq = missingItems.filter((i) => i.importance === 'required').slice(0, 5)
  if (missingReq.length > 0) {
    suggestions.push(
      `Incorporate missing core skills required by the job posting: ${missingReq.map((i) => `"${i.keyword}"`).join(', ')}.`
    )
  }

  const missingPref = missingItems.filter((i) => i.importance === 'preferred').slice(0, 3)
  if (missingPref.length > 0) {
    suggestions.push(
      `Consider mentioning preferred skills to boost score: ${missingPref.map((i) => `"${i.keyword}"`).join(', ')}.`
    )
  }

  if (latexStructure?.hasTables) {
    suggestions.push('Replace LaTeX tables with clean list formatting to avoid column-reading errors in ATS parsers.')
  }

  if (latexStructure?.hasColumns) {
    suggestions.push('Avoid multi-column resume layouts; use standard single-column document structures.')
  }

  if (latexStructure?.hasIcons) {
    suggestions.push('Remove FontAwesome/vector icons which may convert into corrupted characters during text parsing.')
  }

  if (pdfInspection && !pdfInspection.textExtractable) {
    suggestions.push('Ensure your PDF is generated with selectable text, not rasterized or scanned images.')
  }

  if (pdfInspection?.missingSections && pdfInspection.missingSections.length > 0) {
    suggestions.push(
      `Add standard headings for missing sections: ${pdfInspection.missingSections.join(', ')}.`
    )
  }

  if (suggestions.length === 0) {
    suggestions.push('Your resume is strongly optimized for modern ATS parsers with high keyword coverage.')
  }

  return {
    score: finalScore,
    grade,
    breakdown: {
      keywordScore,
      formatScore,
      sectionScore,
    },
    keywordAnalysis: {
      totalKeywords,
      matchedCount,
      missingCount,
      coveragePercentage,
      matched: matchedItems.map((i) => ({
        keyword: i.keyword,
        matchedAs: i.matchedAs,
        count: i.count,
        importance: i.importance,
      })),
      missing: missingItems.map((i) => ({
        keyword: i.keyword,
        importance: i.importance,
      })),
    },
    formatChecks: {
      score: formatScore,
      passed: formatScore >= 70 && (!latexStructure || latexStructure.passed),
      issues: formatIssues,
      details: {
        hasTables: latexStructure?.hasTables || false,
        hasColumns: latexStructure?.hasColumns || false,
        hasIcons: latexStructure?.hasIcons || false,
        textExtractable: pdfInspection ? pdfInspection.textExtractable : true,
        wordCount: pdfInspection ? pdfInspection.wordCount : 0,
        pageCount: pdfInspection ? pdfInspection.pageCount : 1,
        detectedSections: pdfInspection ? pdfInspection.detectedSections : [],
      },
    },
    suggestions,
  }
}
