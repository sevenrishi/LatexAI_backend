/**
 * Single-pass LaTeX template renderer.
 * Complies with task BE-3.16.
 */

import { escapeLatex, escapeLatexUrl } from './escape.js'
import {
  renderLinksBlock,
  renderExperienceBlock,
  renderEducationBlock,
  renderSkillsBlock,
  renderProjectsBlock,
  renderCertificationsBlock,
  renderSummaryBlock,
} from './renderers.js'
import { adaptProfileForRendering } from './dataAdapter.js'
import type { FullProfile } from '../services/profile.service.js'

/**
 * Builds the map of placeholder replacements for the given profile.
 */
export function buildPlaceholderMap(
  profileInput?: Partial<FullProfile> | null
): Record<string, string> {
  const profile = adaptProfileForRendering(profileInput)

  return {
    '{{FULL_NAME}}': escapeLatex(profile.fullName),
    '{{HEADLINE}}': escapeLatex(profile.headline),
    '{{EMAIL}}': escapeLatex(profile.email),
    '{{PHONE}}': escapeLatex(profile.phone),
    '{{LOCATION}}': escapeLatex(profile.location),
    '{{WEBSITE}}': escapeLatexUrl(profile.website),
    '{{LINKEDIN}}': escapeLatexUrl(profile.linkedin),
    '{{GITHUB}}': escapeLatexUrl(profile.github),
    '{{LINKS_BLOCK}}': renderLinksBlock({
      phone: profile.phone,
      email: profile.email,
      location: profile.location,
      website: profile.website,
      linkedin: profile.linkedin,
      github: profile.github,
      customLinks: profile.customLinks,
    }),
    '{{SUMMARY}}': escapeLatex(profile.summary),
    '{{SUMMARY_BLOCK}}': renderSummaryBlock(profile.summary),
    '{{EXPERIENCE_BLOCK}}': renderExperienceBlock(profile.experience),
    '{{EDUCATION_BLOCK}}': renderEducationBlock(profile.education),
    '{{SKILLS_BLOCK}}': renderSkillsBlock(profile.skills),
    '{{PROJECTS_BLOCK}}': renderProjectsBlock(profile.projects),
    '{{CERTIFICATIONS_BLOCK}}': renderCertificationsBlock(profile.certifications),
  }
}

/**
 * Renders a complete LaTeX resume document by replacing all whitelisted placeholders
 * in a single pass.
 */
export function renderTemplate(
  templateLatex: string,
  profile?: Partial<FullProfile> | null
): string {
  if (!templateLatex) return ''

  const replacers = buildPlaceholderMap(profile)

  // Single-pass replacement using regex matching {{TAG}}
  return templateLatex.replace(/\{\{([A-Z_]+)\}\}/g, (match) => {
    if (Object.prototype.hasOwnProperty.call(replacers, match)) {
      return replacers[match] ?? match
    }
    // Return unchanged if placeholder not in dictionary
    return match
  })
}
