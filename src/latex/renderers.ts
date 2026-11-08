/**
 * Pure LaTeX section renderers for mapping profile structures into LaTeX code blocks.
 * Complies with task BE-3.15.
 */

import { escapeLatex, escapeLatexUrl } from './escape.js'
import type {
  ExperienceItem,
  EducationItem,
  SkillItem,
  CertificationItem,
  ProjectItem,
} from '../services/profile.service.js'

export interface RenderLinkItem {
  label: string
  url: string
}

/**
 * Formats a date or date range safely into LaTeX (e.g., "Jan 2022 -- Present")
 */
function formatDateRange(startDate: string, endDate?: string | null, current?: boolean): string {
  const start = escapeLatex(startDate || '')
  if (current) return `${start} -- Present`
  if (!endDate) return start
  return `${start} -- ${escapeLatex(endDate)}`
}

/**
 * Renders the top contact and social links row.
 */
export function renderLinksBlock(contact: {
  phone?: string
  email?: string
  location?: string
  website?: string
  linkedin?: string
  github?: string
  customLinks?: RenderLinkItem[]
}): string {
  const parts: string[] = []

  if (contact.email) {
    const escapedEmail = escapeLatex(contact.email)
    const escapedHref = escapeLatexUrl(`mailto:${contact.email}`)
    parts.push(`\\href{${escapedHref}}{${escapedEmail}}`)
  }

  if (contact.phone) {
    const escapedPhone = escapeLatex(contact.phone)
    const escapedHref = escapeLatexUrl(`tel:${contact.phone.replace(/[^0-9+]/g, '')}`)
    parts.push(`\\href{${escapedHref}}{${escapedPhone}}`)
  }

  if (contact.location) {
    parts.push(escapeLatex(contact.location))
  }

  if (contact.website) {
    const url = contact.website.startsWith('http') ? contact.website : `https://${contact.website}`
    const label = contact.website.replace(/^https?:\/\/(www\.)?/, '')
    parts.push(`\\href{${escapeLatexUrl(url)}}{${escapeLatex(label)}}`)
  }

  if (contact.linkedin) {
    const url = contact.linkedin.startsWith('http')
      ? contact.linkedin
      : `https://linkedin.com/in/${contact.linkedin}`
    parts.push(`\\href{${escapeLatexUrl(url)}}{LinkedIn}`)
  }

  if (contact.github) {
    const url = contact.github.startsWith('http')
      ? contact.github
      : `https://github.com/${contact.github}`
    parts.push(`\\href{${escapeLatexUrl(url)}}{GitHub}`)
  }

  if (Array.isArray(contact.customLinks)) {
    for (const link of contact.customLinks) {
      if (link.url && link.label) {
        parts.push(`\\href{${escapeLatexUrl(link.url)}}{${escapeLatex(link.label)}}`)
      }
    }
  }

  if (parts.length === 0) return ''
  return parts.join(' $|$ ')
}

/**
 * Renders the Experience block.
 */
export function renderExperienceBlock(items: ExperienceItem[]): string {
  if (!items || items.length === 0) return ''

  const lines: string[] = ['\\section{Experience}', '\\resumeSubHeadingListStart']

  for (const item of items) {
    const title = escapeLatex(item.title)
    const company = escapeLatex(item.company)
    const location = escapeLatex(item.location || '')
    const dateRange = formatDateRange(item.startDate, item.endDate, item.current)

    lines.push(`    \\resumeSubheading`)
    lines.push(`      {${title}}{${dateRange}}`)
    lines.push(`      {${company}}{${location}}`)

    if (item.bullets && item.bullets.length > 0) {
      lines.push('      \\resumeItemListStart')
      for (const bullet of item.bullets) {
        const text = typeof bullet === 'string' ? bullet : bullet.text
        if (text && text.trim().length > 0) {
          lines.push(`        \\resumeItem{${escapeLatex(text)}}`)
        }
      }
      lines.push('      \\resumeItemListEnd')
    }
  }

  lines.push('\\resumeSubHeadingListEnd')
  return lines.join('\n')
}

/**
 * Renders the Education block.
 */
export function renderEducationBlock(items: EducationItem[]): string {
  if (!items || items.length === 0) return ''

  const lines: string[] = ['\\section{Education}', '\\resumeSubHeadingListStart']

  for (const item of items) {
    const inst = escapeLatex(item.institution)
    const loc = escapeLatex(item.location || '')
    const dateRange = formatDateRange(item.startDate, item.endDate, item.current)

    let degreeField = escapeLatex(item.degree)
    if (item.fieldOfStudy) {
      degreeField += ` in ${escapeLatex(item.fieldOfStudy)}`
    }
    if (item.gpa) {
      degreeField += ` (GPA: ${escapeLatex(item.gpa)})`
    }

    lines.push(`    \\resumeSubheading`)
    lines.push(`      {${inst}}{${loc}}`)
    lines.push(`      {${degreeField}}{${dateRange}}`)
  }

  lines.push('\\resumeSubHeadingListEnd')
  return lines.join('\n')
}

/**
 * Renders the Skills block categorized or grouped.
 */
export function renderSkillsBlock(items: SkillItem[]): string {
  if (!items || items.length === 0) return ''

  // Group skills by category
  const groups = new Map<string, string[]>()
  for (const skill of items) {
    const cat = (skill.category || 'Technical Skills').trim()
    const name = escapeLatex(skill.name)
    if (!groups.has(cat)) {
      groups.set(cat, [])
    }
    groups.get(cat)!.push(name)
  }

  const lines: string[] = [
    '\\section{Technical Skills}',
    '\\begin{itemize}[leftmargin=0.15in, label={}]',
    '  \\small{\\item{',
  ]

  const categoryLines: string[] = []
  for (const [category, skills] of groups.entries()) {
    categoryLines.push(`    \\textbf{${escapeLatex(category)}}{: ${skills.join(', ')}}`)
  }

  lines.push(categoryLines.join(' \\\\\n'))
  lines.push('  }}')
  lines.push('\\end{itemize}')

  return lines.join('\n')
}

/**
 * Renders the Projects block.
 */
export function renderProjectsBlock(items: ProjectItem[]): string {
  if (!items || items.length === 0) return ''

  const lines: string[] = ['\\section{Projects}', '\\resumeSubHeadingListStart']

  for (const item of items) {
    const title = escapeLatex(item.title)
    const tech =
      item.techStack && item.techStack.length > 0
        ? ` $|$ \\emph{${item.techStack.map(escapeLatex).join(', ')}}`
        : ''

    let linkPart = ''
    if (item.liveUrl) {
      linkPart = ` $|$ \\href{${escapeLatexUrl(item.liveUrl)}}{Link}`
    } else if (item.repoUrl) {
      linkPart = ` $|$ \\href{${escapeLatexUrl(item.repoUrl)}}{Code}`
    }

    lines.push(`    \\resumeProjectHeading`)
    lines.push(`      {\\textbf{${title}}${tech}${linkPart}}{}`)

    if (item.description) {
      lines.push('      \\resumeItemListStart')
      lines.push(`        \\resumeItem{${escapeLatex(item.description)}}`)
      lines.push('      \\resumeItemListEnd')
    }
  }

  lines.push('\\resumeSubHeadingListEnd')
  return lines.join('\n')
}

/**
 * Renders the Certifications block.
 */
export function renderCertificationsBlock(items: CertificationItem[]): string {
  if (!items || items.length === 0) return ''

  const lines: string[] = ['\\section{Certifications}', '\\resumeSubHeadingListStart']

  for (const item of items) {
    const name = escapeLatex(item.name)
    const issuer = escapeLatex(item.issuer)
    const date = escapeLatex(item.issueDate || '')
    const idInfo = item.credentialId ? `ID: ${escapeLatex(item.credentialId)}` : ''

    lines.push(`    \\resumeSubheading`)
    lines.push(`      {${name}}{${date}}`)
    lines.push(`      {${issuer}}{${idInfo}}`)
  }

  lines.push('\\resumeSubHeadingListEnd')
  return lines.join('\n')
}

/**
 * Renders the Summary block with section header.
 */
export function renderSummaryBlock(summary: string | null | undefined): string {
  if (!summary || summary.trim().length === 0) return ''

  return [
    '\\section{Summary}',
    '\\begin{flushleft}',
    escapeLatex(summary.trim()),
    '\\end{flushleft}',
  ].join('\n')
}
