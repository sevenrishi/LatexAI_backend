/**
 * Placeholder mapping contracts for LaTeX templates.
 * Complies with task BE-3.02.
 */

export const ALLOWED_PLACEHOLDERS = [
  '{{FULL_NAME}}',
  '{{HEADLINE}}',
  '{{EMAIL}}',
  '{{PHONE}}',
  '{{LOCATION}}',
  '{{WEBSITE}}',
  '{{LINKEDIN}}',
  '{{GITHUB}}',
  '{{LINKS_BLOCK}}',
  '{{SUMMARY}}',
  '{{SUMMARY_BLOCK}}',
  '{{EXPERIENCE_BLOCK}}',
  '{{EDUCATION_BLOCK}}',
  '{{SKILLS_BLOCK}}',
  '{{PROJECTS_BLOCK}}',
  '{{CERTIFICATIONS_BLOCK}}',
] as const

export type PlaceholderKey = (typeof ALLOWED_PLACEHOLDERS)[number]

export const PLACEHOLDER_DESCRIPTIONS: Record<PlaceholderKey, string> = {
  '{{FULL_NAME}}': "Candidate's full name",
  '{{HEADLINE}}': 'Professional headline or current job title',
  '{{EMAIL}}': 'Primary email address',
  '{{PHONE}}': 'Phone number',
  '{{LOCATION}}': 'City, State or Country location',
  '{{WEBSITE}}': 'Personal website or portfolio URL',
  '{{LINKEDIN}}': 'LinkedIn profile URL or handle',
  '{{GITHUB}}': 'GitHub profile URL or handle',
  '{{LINKS_BLOCK}}': 'Rendered list/row of contact & custom profile links with icons/separators',
  '{{SUMMARY}}': 'Raw escaped text of the professional summary statement',
  '{{SUMMARY_BLOCK}}': 'Complete summary section including section header',
  '{{EXPERIENCE_BLOCK}}': 'Complete work experience section with jobs, dates, and bullet points',
  '{{EDUCATION_BLOCK}}': 'Complete education section with degrees, institutions, and dates',
  '{{SKILLS_BLOCK}}': 'Complete skills section categorized or listed',
  '{{PROJECTS_BLOCK}}': 'Complete portfolio projects section with links and descriptions',
  '{{CERTIFICATIONS_BLOCK}}': 'Complete certifications section with issuers and dates',
}

/**
 * Regex matching any double-brace placeholder syntax: {{NAME}}
 */
export const PLACEHOLDER_REGEX = /\{\{([A-Z_]+)\}\}/g

/**
 * Returns all double-brace placeholders found in a LaTeX string.
 */
export function extractPlaceholders(latex: string): string[] {
  const matches = new Set<string>()
  let match: RegExpExecArray | null
  const regex = new RegExp(PLACEHOLDER_REGEX)

  while ((match = regex.exec(latex)) !== null) {
    matches.add(match[0])
  }

  return Array.from(matches)
}
