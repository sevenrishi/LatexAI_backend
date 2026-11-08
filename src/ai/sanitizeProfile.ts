import type { FullProfile } from '../services/profile.service.js'

export interface SanitizedBullet {
  id: string
  text: string
}

export interface SanitizedExperience {
  id: string
  company: string
  title: string
  location?: string
  startDate: string
  endDate?: string | null
  current: boolean
  bullets: SanitizedBullet[]
}

export interface SanitizedEducation {
  id: string
  institution: string
  degree: string
  fieldOfStudy?: string
  startDate?: string
  endDate?: string | null
  gpa?: string
  honors?: string
}

export interface SanitizedSkill {
  id: string
  name: string
  category: string
}

export interface SanitizedProject {
  id: string
  title: string
  role?: string
  description: string
  techStack: string[]
}

export interface SanitizedProfile {
  headline?: string
  summary?: string
  experience: SanitizedExperience[]
  education: SanitizedEducation[]
  skills: SanitizedSkill[]
  projects: SanitizedProject[]
}

/**
 * Builds a sanitized profile model omitting sensitive candidate PII
 * (phone, email, full address, social handles) while strictly retaining
 * entity and bullet UUIDs for downstream traceability verification.
 */
export function buildSanitizedProfile(profile: FullProfile): SanitizedProfile {
  return {
    headline: profile.headline || undefined,
    summary: profile.summary || undefined,
    experience: (profile.experience || []).map((exp) => ({
      id: exp.id,
      company: exp.company,
      title: exp.title,
      location: exp.location || undefined,
      startDate: exp.startDate,
      endDate: exp.endDate,
      current: exp.current,
      bullets: (exp.bullets || []).map((b) => ({
        id: b.id,
        text: b.text,
      })),
    })),
    education: (profile.education || []).map((edu) => ({
      id: edu.id,
      institution: edu.institution,
      degree: edu.degree,
      fieldOfStudy: edu.fieldOfStudy || undefined,
      startDate: edu.startDate,
      endDate: edu.endDate,
      gpa: edu.gpa || undefined,
      honors: edu.honors || undefined,
    })),
    skills: (profile.skills || []).map((sk) => ({
      id: sk.id,
      name: sk.name,
      category: sk.category,
    })),
    projects: (profile.projects || []).map((proj) => ({
      id: proj.id,
      title: proj.title,
      role: proj.role || undefined,
      description: proj.description,
      techStack: proj.techStack || [],
    })),
  }
}
