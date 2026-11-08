export interface ProfileCompletenessMetrics {
  percentage: number
  tier: 'needs_work' | 'good' | 'strong'
  sections: {
    contact: boolean
    summary: boolean
    experience: boolean
    education: boolean
    skills: boolean
    projects: boolean
    certifications: boolean
  }
  missingSections: string[]
}

export interface ProfileInputForCompleteness {
  fullName?: string | null
  email?: string | null
  phone?: string | null
  location?: string | null
  summary?: string | null
  experience?: Array<unknown>
  education?: Array<unknown>
  skills?: Array<unknown>
  projects?: Array<unknown>
  certifications?: Array<unknown>
}

/**
 * Calculates profile completeness metrics matching frontend specification
 */
export function calculateProfileCompleteness(
  profile: ProfileInputForCompleteness
): ProfileCompletenessMetrics {
  const sections = {
    contact: Boolean(profile.fullName && profile.email && profile.phone && profile.location),
    summary: Boolean(profile.summary && profile.summary.trim().length >= 30),
    experience: Boolean(profile.experience && profile.experience.length > 0),
    education: Boolean(profile.education && profile.education.length > 0),
    skills: Boolean(profile.skills && profile.skills.length >= 4),
    projects: Boolean(profile.projects && profile.projects.length > 0),
    certifications: Boolean(profile.certifications && profile.certifications.length > 0),
  }

  let percentage = 0
  if (sections.contact) percentage += 15
  if (sections.summary) percentage += 15
  if (sections.experience) percentage += 25
  if (sections.education) percentage += 15
  if (sections.skills) percentage += 15
  if (sections.projects) percentage += 10
  if (sections.certifications) percentage += 5

  const missingSections: string[] = []
  if (!sections.contact) missingSections.push('Contact info')
  if (!sections.summary) missingSections.push('Summary')
  if (!sections.experience) missingSections.push('Experience')
  if (!sections.education) missingSections.push('Education')
  if (!sections.skills) missingSections.push('Skills')
  if (!sections.projects) missingSections.push('Projects')
  if (!sections.certifications) missingSections.push('Certifications')

  const tier: 'needs_work' | 'good' | 'strong' =
    percentage >= 85 ? 'strong' : percentage >= 60 ? 'good' : 'needs_work'

  return {
    percentage,
    tier,
    sections,
    missingSections,
  }
}
