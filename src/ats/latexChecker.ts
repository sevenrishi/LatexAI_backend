/**
 * LaTeX Template Structure & ATS Compatibility Checker
 * Complies with task BE-5.05.
 *
 * Scans LaTeX source code to detect constructs that frequently cause
 * parsing failures, scrambled text ordering, or lost contact data in ATS systems.
 */

export interface LatexStructureIssue {
  code: string
  severity: 'error' | 'warning' | 'info'
  message: string
  deduction: number
}

export interface LatexStructureCheckResult {
  passed: boolean
  score: number
  hasTables: boolean
  hasColumns: boolean
  hasIcons: boolean
  hasComplexBoxes: boolean
  hasHeaderFooterIssues: boolean
  issues: LatexStructureIssue[]
  details: {
    tableCount: number
    columnCount: number
    iconCount: number
  }
}

/**
 * Inspects LaTeX code for ATS-unfriendly layout constructs (BE-5.05).
 */
export function checkLatexStructure(latexCode: string): LatexStructureCheckResult {
  if (!latexCode || typeof latexCode !== 'string') {
    return {
      passed: false,
      score: 50,
      hasTables: false,
      hasColumns: false,
      hasIcons: false,
      hasComplexBoxes: false,
      hasHeaderFooterIssues: false,
      issues: [
        {
          code: 'EMPTY_LATEX',
          severity: 'error',
          message: 'No LaTeX source code provided for ATS structural analysis.',
          deduction: 50,
        },
      ],
      details: { tableCount: 0, columnCount: 0, iconCount: 0 },
    }
  }

  const issues: LatexStructureIssue[] = []
  let deductionSum = 0

  // 1. Table Checks (\begin{tabular}, \begin{table}, tabularx, tabulary)
  const tableRegex = /\\begin\{(tabular|table|tabularx|tabulary)\}/g
  const tableMatches = latexCode.match(tableRegex) || []
  const hasTables = tableMatches.length > 0

  if (hasTables) {
    const deduction = Math.min(40, 20 + (tableMatches.length - 1) * 10)
    deductionSum += deduction
    issues.push({
      code: 'UNFRIENDLY_TABLES',
      severity: 'warning',
      message: `Detected ${tableMatches.length} LaTeX table construct(s). ATS parsers frequently scramble text across table columns. Prefer single-column list layouts.`,
      deduction,
    })
  }

  // 2. Multi-column checks (\begin{multicols}, \twocolumn, \begin{columns}, \begin{minipage})
  const columnRegex = /\\begin\{(multicols|columns)\}|\\twocolumn|\\begin\{minipage\}/g
  const columnMatches = latexCode.match(columnRegex) || []
  const hasColumns = columnMatches.length > 0

  if (hasColumns) {
    const deduction = Math.min(40, 20 + (columnMatches.length - 1) * 10)
    deductionSum += deduction
    issues.push({
      code: 'UNFRIENDLY_COLUMNS',
      severity: 'warning',
      message: `Detected multi-column or minipage structures. ATS robots parse documents horizontally line-by-line, which can interleave two parallel columns into gibberish.`,
      deduction,
    })
  }

  // 3. Icons and Graphics (\fa..., \fontawesome, \includegraphics, tikzpicture)
  const iconRegex = /\\fa[A-Z][a-zA-Z]*|\\faIcon|\\includegraphics|\\begin\{tikzpicture\}/g
  const iconMatches = latexCode.match(iconRegex) || []
  const hasIcons = iconMatches.length > 0

  if (hasIcons) {
    const deduction = Math.min(20, 10 + (iconMatches.length - 1) * 5)
    deductionSum += deduction
    issues.push({
      code: 'UNFRIENDLY_ICONS',
      severity: 'info',
      message: `Detected ${iconMatches.length} icon or graphic construct(s). Icons are stripped or converted to corrupted unicode characters by ATS parsers.`,
      deduction,
    })
  }

  // 4. Complex Colored Boxes (\begin{tcolorbox}, \colorbox, \fcolorbox)
  const boxRegex = /\\begin\{tcolorbox\}|\\colorbox\{|\\fcolorbox\{/g
  const boxMatches = latexCode.match(boxRegex) || []
  const hasComplexBoxes = boxMatches.length > 0

  if (hasComplexBoxes) {
    const deduction = 10
    deductionSum += deduction
    issues.push({
      code: 'COMPLEX_BOXES',
      severity: 'warning',
      message: `Detected colored boxes or callout frames. Text inside decorative containers is frequently ignored by ATS resume extractors.`,
      deduction,
    })
  }

  // 5. Header / Footer Contact Information Risk (\fancyhead, \fancyfoot)
  const headerFooterRegex = /\\fancyhead|\\fancyfoot|\\pagestyle\{fancy\}/g
  const hasHeaderFooterIssues = headerFooterRegex.test(latexCode)

  if (hasHeaderFooterIssues) {
    const deduction = 5
    deductionSum += deduction
    issues.push({
      code: 'HEADER_FOOTER_CONTENT',
      severity: 'info',
      message: `Detected custom headers or footers. Ensure key contact info is in the document body, as ATS algorithms routinely drop header and footer sections.`,
      deduction,
    })
  }

  const score = Math.max(0, 100 - deductionSum)
  const passed = score >= 70 && !hasTables && !hasColumns

  return {
    passed,
    score,
    hasTables,
    hasColumns,
    hasIcons,
    hasComplexBoxes,
    hasHeaderFooterIssues,
    issues,
    details: {
      tableCount: tableMatches.length,
      columnCount: columnMatches.length,
      iconCount: iconMatches.length,
    },
  }
}
