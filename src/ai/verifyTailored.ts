import type { SanitizedProfile } from './sanitizeProfile.js'
import type { TailoredContent } from './prompts/tailor.v1.js'

export interface TraceabilityResult {
  valid: boolean
  violations: string[]
  invalidBulletIds: Set<string>
  fabricatedExperienceIds: Set<string>
}

export interface ChangeSummary {
  totalBulletsOriginal: number
  totalBulletsTailored: number
  bulletsModified: number
  bulletsUnchanged: number
  bulletsRemediated: number
  matchedKeywords: string[]
  sectionsChanged: string[]
  tailoringScore: number
  summaryChanged: boolean
  remediationNotes: string[]
}

/**
 * Verifies that all tailored resume entities and bullets map back strictly
 * to real source IDs in the candidate's profile, flagging any hallucinations or invalid mappings.
 */
export function verifyTailoredContent(
  tailored: TailoredContent,
  sourceProfile: SanitizedProfile
): TraceabilityResult {
  const violations: string[] = []
  const invalidBulletIds = new Set<string>()
  const fabricatedExperienceIds = new Set<string>()

  // Build maps of source entities
  const sourceExpMap = new Map<string, Set<string>>()
  for (const exp of sourceProfile.experience) {
    const bulletSet = new Set(exp.bullets.map((b) => b.id))
    sourceExpMap.set(exp.id, bulletSet)
  }

  // Check experience items
  for (const exp of tailored.experience) {
    const validBulletsForExp = sourceExpMap.get(exp.id)
    if (!validBulletsForExp) {
      violations.push(`Fabricated experience item detected with ID '${exp.id}' (${exp.company})`)
      fabricatedExperienceIds.add(exp.id)
      continue
    }

    // Check bullets in this experience
    for (const bullet of exp.bullets) {
      if (!bullet.sourceBulletId || !validBulletsForExp.has(bullet.sourceBulletId)) {
        violations.push(
          `Untraceable bullet detected in company '${exp.company}' with sourceBulletId '${bullet.sourceBulletId}'`
        )
        invalidBulletIds.add(bullet.id || bullet.sourceBulletId)
      }
    }
  }

  return {
    valid: violations.length === 0,
    violations,
    invalidBulletIds,
    fabricatedExperienceIds,
  }
}

/**
 * Applies automated remediation policies when traceability checks fail:
 * restores original candidate bullets and drops fabricated experiences.
 */
export function remediateTailoredContent(
  tailored: TailoredContent,
  sourceProfile: SanitizedProfile
): {
  remediated: TailoredContent
  remediatedCount: number
  remediationNotes: string[]
} {
  const verification = verifyTailoredContent(tailored, sourceProfile)
  if (verification.valid) {
    return {
      remediated: tailored,
      remediatedCount: 0,
      remediationNotes: [],
    }
  }

  const notes: string[] = []
  let remediatedCount = 0

  const sourceExpMap = new Map<string, (typeof sourceProfile.experience)[0]>()
  for (const exp of sourceProfile.experience) {
    sourceExpMap.set(exp.id, exp)
  }

  // Filter out any fabricated experiences
  const safeExperiences = tailored.experience.filter((exp) => {
    if (verification.fabricatedExperienceIds.has(exp.id)) {
      notes.push(`Dropped fabricated experience: '${exp.company} - ${exp.title}'`)
      remediatedCount++
      return false
    }
    return true
  })

  // Remediate invalid bullets in valid experiences
  const remediatedExperiences = safeExperiences.map((exp) => {
    const originalExp = sourceExpMap.get(exp.id)!
    const originalBulletMap = new Map(originalExp.bullets.map((b) => [b.id, b]))

    const cleanBullets = exp.bullets.map((bullet) => {
      const isInvalid =
        !bullet.sourceBulletId ||
        verification.invalidBulletIds.has(bullet.id) ||
        !originalBulletMap.has(bullet.sourceBulletId)

      if (isInvalid) {
        // Fallback to first available original bullet or original text
        const fallback = originalBulletMap.get(bullet.sourceBulletId) || originalExp.bullets[0]
        notes.push(
          `Remediated untraceable bullet in '${exp.company}': restored original candidate text.`
        )
        remediatedCount++
        return {
          id: bullet.id,
          sourceBulletId: fallback ? fallback.id : bullet.sourceBulletId,
          text: fallback ? fallback.text : bullet.text,
          keywordsMatched: [],
        }
      }

      return bullet
    })

    return {
      ...exp,
      bullets: cleanBullets,
    }
  })

  // Ensure summary is preserved or safely populated
  const safeSummary =
    tailored.summary && tailored.summary.trim().length > 0
      ? tailored.summary
      : sourceProfile.summary || ''

  return {
    remediated: {
      ...tailored,
      summary: safeSummary,
      experience: remediatedExperiences,
    },
    remediatedCount,
    remediationNotes: notes,
  }
}

/**
 * Builds a structured change summary capturing diff statistics, keyword coverage, and flags.
 */
export function buildChangeSummary(
  sourceProfile: SanitizedProfile,
  tailored: TailoredContent,
  jobKeywords: string[] = [],
  remediationNotes: string[] = []
): ChangeSummary {
  let totalBulletsOriginal = 0
  let totalBulletsTailored = 0
  let bulletsModified = 0
  let bulletsUnchanged = 0

  const originalBulletTexts = new Map<string, string>()
  for (const exp of sourceProfile.experience) {
    for (const b of exp.bullets) {
      totalBulletsOriginal++
      originalBulletTexts.set(b.id, b.text.trim())
    }
  }

  for (const exp of tailored.experience) {
    for (const b of exp.bullets) {
      totalBulletsTailored++
      const originalText = originalBulletTexts.get(b.sourceBulletId)
      if (originalText && originalText === b.text.trim()) {
        bulletsUnchanged++
      } else {
        bulletsModified++
      }
    }
  }

  // Keyword matching against entire tailored text
  const fullTailoredText = [
    tailored.summary,
    ...tailored.experience.flatMap((e) => e.bullets.map((b) => b.text)),
    ...tailored.skills.map((s) => s.name),
    ...tailored.projects.map((p) => `${p.title} ${p.description}`),
  ]
    .join(' ')
    .toLowerCase()

  const matchedKeywords = jobKeywords.filter((kw) => {
    if (!kw || kw.length < 2) return false
    const regex = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
    return regex.test(fullTailoredText)
  })

  const sectionsChanged: string[] = []
  const summaryChanged = (tailored.summary || '').trim() !== (sourceProfile.summary || '').trim()
  if (summaryChanged) sectionsChanged.push('summary')
  if (bulletsModified > 0) sectionsChanged.push('experience')
  if (tailored.skills.some((s) => s.isHighlighted)) sectionsChanged.push('skills')

  const tailoringScore =
    totalBulletsTailored > 0
      ? Math.min(100, Math.round((bulletsModified / totalBulletsTailored) * 100))
      : 0

  return {
    totalBulletsOriginal,
    totalBulletsTailored,
    bulletsModified,
    bulletsUnchanged,
    bulletsRemediated: remediationNotes.length,
    matchedKeywords,
    sectionsChanged,
    tailoringScore,
    summaryChanged,
    remediationNotes,
  }
}
