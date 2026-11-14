import fs from 'fs'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import { supabaseAdmin } from '../db/supabase.js'
import { env } from '../config/env.js'
import { AppError } from '../utils/errors.js'
import { logger } from '../utils/logger.js'
import {
  calculateProfileCompleteness,
  type ProfileCompletenessMetrics,
} from './completeness.service.js'
import { extractResumeText } from '../utils/textExtractor.js'
import { heuristicResumeParser, parseResumeWithAi } from '../ai/prompts/import.v1.js'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export function ensureUuid(id: unknown): string {
  if (typeof id === 'string' && UUID_REGEX.test(id)) {
    return id
  }
  return uuidv4()
}

export function sanitizeExperiencePayload(userId: string, item: Record<string, unknown>, sortOrder = 0) {
  const rawBullets = Array.isArray(item.bullets) ? item.bullets : []
  const bullets = rawBullets.map((b: unknown) => {
    if (typeof b === 'string') return { id: uuidv4(), text: b }
    if (b && typeof b === 'object' && 'text' in b) {
      const bObj = b as { id?: string; text: string }
      return { id: ensureUuid(bObj.id), text: String(bObj.text || '') }
    }
    return { id: uuidv4(), text: String(b) }
  })

  return {
    id: ensureUuid(item.id),
    user_id: userId,
    company: String(item.company || ''),
    title: String(item.title || ''),
    location: item.location ? String(item.location) : '',
    start_date: String(item.startDate || item.start_date || ''),
    end_date: item.endDate || item.end_date ? String(item.endDate || item.end_date) : null,
    current: Boolean(item.current),
    bullets,
    sort_order: typeof item.sortOrder === 'number' ? item.sortOrder : (typeof item.sort_order === 'number' ? item.sort_order : sortOrder),
  }
}

export function sanitizeEducationPayload(userId: string, item: Record<string, unknown>, sortOrder = 0) {
  return {
    id: ensureUuid(item.id),
    user_id: userId,
    institution: String(item.institution || ''),
    degree: String(item.degree || ''),
    field_of_study: item.fieldOfStudy || item.field_of_study ? String(item.fieldOfStudy || item.field_of_study) : '',
    location: item.location ? String(item.location) : '',
    start_date: String(item.startDate || item.start_date || ''),
    end_date: item.endDate || item.end_date ? String(item.endDate || item.end_date) : '',
    current: Boolean(item.current),
    gpa: item.gpa ? String(item.gpa) : '',
    honors: item.honors ? String(item.honors) : '',
    sort_order: typeof item.sortOrder === 'number' ? item.sortOrder : (typeof item.sort_order === 'number' ? item.sort_order : sortOrder),
  }
}

export function sanitizeCertificationPayload(userId: string, item: Record<string, unknown>, sortOrder = 0) {
  return {
    id: ensureUuid(item.id),
    user_id: userId,
    name: String(item.name || ''),
    issuer: String(item.issuer || ''),
    issue_date: String(item.issueDate || item.issue_date || ''),
    expiry_date: item.expiryDate || item.expiry_date ? String(item.expiryDate || item.expiry_date) : null,
    does_not_expire: Boolean(item.doesNotExpire ?? item.does_not_expire),
    credential_id: item.credentialId || item.credential_id ? String(item.credentialId || item.credential_id) : '',
    credential_url: item.credentialUrl || item.credential_url ? String(item.credentialUrl || item.credential_url) : '',
    sort_order: typeof item.sortOrder === 'number' ? item.sortOrder : (typeof item.sort_order === 'number' ? item.sort_order : sortOrder),
  }
}

export function sanitizeProjectPayload(userId: string, item: Record<string, unknown>, sortOrder = 0) {
  const rawTech = item.techStack || item.tech_stack
  const tech_stack = Array.isArray(rawTech) ? rawTech : []

  return {
    id: ensureUuid(item.id),
    user_id: userId,
    title: String(item.title || ''),
    role: item.role ? String(item.role) : '',
    description: String(item.description || ''),
    tech_stack,
    live_url: item.liveUrl || item.live_url ? String(item.liveUrl || item.live_url) : '',
    repo_url: item.repoUrl || item.repo_url ? String(item.repoUrl || item.repo_url) : '',
    sort_order: typeof item.sortOrder === 'number' ? item.sortOrder : (typeof item.sort_order === 'number' ? item.sort_order : sortOrder),
  }
}

export type ProfileSection = 'experience' | 'education' | 'skills' | 'certifications' | 'projects'

export interface ExperienceItem {
  id: string
  company: string
  title: string
  location?: string
  startDate: string
  endDate?: string | null
  current: boolean
  bullets: Array<{ id: string; text: string }>
  sortOrder?: number
}

export interface EducationItem {
  id: string
  institution: string
  degree: string
  fieldOfStudy?: string
  location?: string
  startDate: string
  endDate?: string
  current?: boolean
  gpa?: string
  honors?: string
  sortOrder?: number
}

export interface SkillItem {
  id: string
  name: string
  category: string
  sortOrder?: number
}

export interface CertificationItem {
  id: string
  name: string
  issuer: string
  issueDate: string
  expiryDate?: string | null
  doesNotExpire?: boolean
  credentialId?: string
  credentialUrl?: string
  sortOrder?: number
}

export interface ProjectItem {
  id: string
  title: string
  role?: string
  description: string
  techStack: string[]
  liveUrl?: string
  repoUrl?: string
  sortOrder?: number
}

export interface FullProfile {
  id: string
  email: string
  fullName: string
  headline: string
  phone: string
  location: string
  summary: string
  website?: string
  github?: string
  linkedin?: string
  customLinks?: Array<{ id: string; label: string; url: string }>
  completeness: ProfileCompletenessMetrics
  experience: ExperienceItem[]
  education: EducationItem[]
  skills: SkillItem[]
  certifications: CertificationItem[]
  projects: ProjectItem[]
  onboardingCompleted?: boolean
  updatedAt?: string
}

export interface ResumeImportDraft {
  importId: string
  fileName: string
  fileSize: number
  expiresAt: string
  parsedData: Record<string, unknown>
}

// In-memory mock store for test and offline dev mode
interface MockProfileData {
  root: Record<string, unknown>
  experience: ExperienceItem[]
  education: EducationItem[]
  skills: SkillItem[]
  certifications: CertificationItem[]
  projects: ProjectItem[]
}

const DATA_DIR = path.resolve(process.cwd(), '.data')
const PROFILES_FILE = path.join(DATA_DIR, 'profiles.json')

function loadStoresFromDisk(): Map<string, MockProfileData> {
  try {
    if (fs.existsSync(PROFILES_FILE)) {
      const raw = fs.readFileSync(PROFILES_FILE, 'utf-8')
      const parsed = JSON.parse(raw)
      return new Map(Object.entries(parsed))
    }
  } catch (err) {
    logger.warn({ err }, 'Could not read persisted profiles store')
  }
  return new Map()
}

function saveStoresToDisk(stores: Map<string, MockProfileData>): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true })
    }
    const obj = Object.fromEntries(stores.entries())
    fs.writeFileSync(PROFILES_FILE, JSON.stringify(obj, null, 2), 'utf-8')
  } catch (err) {
    logger.warn({ err }, 'Could not persist profiles store to disk')
  }
}

const mockStores = loadStoresFromDisk()
export const mockImports = new Map<string, ResumeImportDraft & { userId: string }>()

function isMockMode(): boolean {
  return (
    env.SUPABASE_URL.includes('placeholder') ||
    env.SUPABASE_URL.includes('mock') ||
    env.NODE_ENV === 'test'
  )
}

function getOrCreateMockStore(userId: string, email = ''): MockProfileData {
  let store = mockStores.get(userId)
  if (!store) {
    const isExplicitDemo = userId.includes('demo') || userId === 'usr_demo_456'
    store = {
      root: {
        id: userId,
        email: email || `${userId}@example.com`,
        full_name: isExplicitDemo ? 'Alex Morgan' : (email ? email.split('@')[0] : ''),
        headline: isExplicitDemo ? 'Senior Full Stack Engineer' : '',
        phone: isExplicitDemo ? '+1 (555) 019-2834' : '',
        location: isExplicitDemo ? 'San Francisco, CA' : '',
        summary: isExplicitDemo ? 'Experienced software engineer specializing in web and distributed systems.' : '',
        website: isExplicitDemo ? 'https://alexmorgan.dev' : '',
        github: isExplicitDemo ? 'https://github.com/alexmorgan' : '',
        linkedin: isExplicitDemo ? 'https://linkedin.com/in/alexmorgan' : '',
        customLinks: [],
        onboarding_completed: isExplicitDemo,
        updated_at: new Date().toISOString(),
      },
      experience: isExplicitDemo ? [
        {
          id: uuidv4(),
          company: 'CloudScale Inc',
          title: 'Staff Architect',
          location: 'San Francisco, CA',
          startDate: '2023-01',
          endDate: null,
          current: true,
          bullets: [
            {
              id: uuidv4(),
              text: 'Architected distributed event systems handling 50M+ requests/day.',
            },
          ],
        },
      ] : [],
      education: isExplicitDemo ? [
        {
          id: uuidv4(),
          institution: 'UC Berkeley',
          degree: 'B.S. in Computer Science',
          fieldOfStudy: 'Computer Science',
          startDate: '2018-08',
          endDate: '2022-05',
        },
      ] : [],
      skills: isExplicitDemo ? [
        { id: uuidv4(), name: 'TypeScript', category: 'Languages' },
        { id: uuidv4(), name: 'React', category: 'Frontend' },
        { id: uuidv4(), name: 'Node.js', category: 'Backend' },
        { id: uuidv4(), name: 'PostgreSQL', category: 'Databases' },
      ] : [],
      certifications: isExplicitDemo ? [
        {
          id: uuidv4(),
          name: 'Certified Kubernetes Administrator',
          issuer: 'CNCF',
          issueDate: '2023-05',
          doesNotExpire: false,
        },
      ] : [],
      projects: isExplicitDemo ? [
        {
          id: uuidv4(),
          title: 'LatexAI Engine',
          role: 'Creator',
          description: 'Automated ATS LaTeX typesetting platform.',
          techStack: ['TypeScript', 'Express', 'React'],
        },
      ] : [],
    }
    mockStores.set(userId, store)
  }
  return store
}

export class ProfileService {
  /**
   * Retrieves aggregated full profile with completeness metrics
   */
  static async getFullProfile(userId: string, email = ''): Promise<FullProfile> {
    if (isMockMode()) {
      const store = getOrCreateMockStore(userId, email)
      const completeness = calculateProfileCompleteness({
        fullName: store.root.full_name as string,
        email: store.root.email as string,
        phone: store.root.phone as string,
        location: store.root.location as string,
        summary: store.root.summary as string,
        experience: store.experience,
        education: store.education,
        skills: store.skills,
        projects: store.projects,
        certifications: store.certifications,
      })

      return {
        id: userId,
        email: (store.root.email as string) || email,
        fullName: (store.root.full_name as string) || '',
        headline: (store.root.headline as string) || '',
        phone: (store.root.phone as string) || '',
        location: (store.root.location as string) || '',
        summary: (store.root.summary as string) || '',
        website: (store.root.website as string) || '',
        github: (store.root.github as string) || '',
        linkedin: (store.root.linkedin as string) || '',
        customLinks:
          (store.root.customLinks as Array<{ id: string; label: string; url: string }>) || [],
        completeness,
        experience: store.experience,
        education: store.education,
        skills: store.skills,
        certifications: store.certifications,
        projects: store.projects,
        onboardingCompleted: Boolean(store.root.onboarding_completed),
        updatedAt: store.root.updated_at as string,
      }
    }

    try {
      // 1. Fetch root profile
      const { data: profile, error: profileError } = await supabaseAdmin
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()

      if (profileError) {
        throw profileError
      }

      // 2. Fetch sections in parallel
      const [expRes, eduRes, skillRes, certRes, projRes] = await Promise.all([
        supabaseAdmin
          .from('profile_experience')
          .select('*')
          .eq('user_id', userId)
          .order('sort_order', { ascending: true }),
        supabaseAdmin
          .from('profile_education')
          .select('*')
          .eq('user_id', userId)
          .order('sort_order', { ascending: true }),
        supabaseAdmin
          .from('profile_skills')
          .select('*')
          .eq('user_id', userId)
          .order('sort_order', { ascending: true }),
        supabaseAdmin
          .from('profile_certifications')
          .select('*')
          .eq('user_id', userId)
          .order('sort_order', { ascending: true }),
        supabaseAdmin
          .from('profile_projects')
          .select('*')
          .eq('user_id', userId)
          .order('sort_order', { ascending: true }),
      ])

      // Deduplicate each section defensively and track duplicate IDs for background cleanup
      const seenExp = new Set<string>()
      const duplicateExpIds: string[] = []
      const experience: ExperienceItem[] = []
      for (const e of (expRes.data || [])) {
        const sig = `${(e.company || '').trim().toLowerCase()}::${(e.title || '').trim().toLowerCase()}`
        if (seenExp.has(sig)) {
          duplicateExpIds.push(e.id)
        } else {
          seenExp.add(sig)
          experience.push({
            id: e.id,
            company: e.company,
            title: e.title,
            location: e.location,
            startDate: e.start_date,
            endDate: e.end_date,
            current: e.current,
            bullets: e.bullets || [],
            sortOrder: e.sort_order,
          })
        }
      }

      const seenEdu = new Set<string>()
      const duplicateEduIds: string[] = []
      const education: EducationItem[] = []
      for (const e of (eduRes.data || [])) {
        const sig = `${(e.institution || '').trim().toLowerCase()}::${(e.degree || '').trim().toLowerCase()}`
        if (seenEdu.has(sig)) {
          duplicateEduIds.push(e.id)
        } else {
          seenEdu.add(sig)
          education.push({
            id: e.id,
            institution: e.institution,
            degree: e.degree,
            fieldOfStudy: e.field_of_study,
            location: e.location,
            startDate: e.start_date,
            endDate: e.end_date,
            current: e.current,
            gpa: e.gpa,
            honors: e.honors,
            sortOrder: e.sort_order,
          })
        }
      }

      const seenSkills = new Set<string>()
      const duplicateSkillIds: string[] = []
      const skills: SkillItem[] = []
      for (const s of (skillRes.data || [])) {
        const sig = (s.name || '').trim().toLowerCase()
        if (seenSkills.has(sig)) {
          duplicateSkillIds.push(s.id)
        } else {
          seenSkills.add(sig)
          skills.push({
            id: s.id,
            name: s.name,
            category: s.category,
            sortOrder: s.sort_order,
          })
        }
      }

      const seenCerts = new Set<string>()
      const duplicateCertIds: string[] = []
      const certifications: CertificationItem[] = []
      for (const c of (certRes.data || [])) {
        const sig = `${(c.name || '').trim().toLowerCase()}::${(c.issuer || '').trim().toLowerCase()}`
        if (seenCerts.has(sig)) {
          duplicateCertIds.push(c.id)
        } else {
          seenCerts.add(sig)
          certifications.push({
            id: c.id,
            name: c.name,
            issuer: c.issuer,
            issueDate: c.issue_date,
            expiryDate: c.expiry_date,
            doesNotExpire: c.does_not_expire,
            credentialId: c.credential_id,
            credentialUrl: c.credential_url,
            sortOrder: c.sort_order,
          })
        }
      }

      const seenProj = new Set<string>()
      const duplicateProjIds: string[] = []
      const projects: ProjectItem[] = []
      for (const p of (projRes.data || [])) {
        const sig = (p.title || '').trim().toLowerCase()
        if (seenProj.has(sig)) {
          duplicateProjIds.push(p.id)
        } else {
          seenProj.add(sig)
          projects.push({
            id: p.id,
            title: p.title,
            role: p.role,
            description: p.description,
            techStack: p.tech_stack || [],
            liveUrl: p.live_url,
            repoUrl: p.repo_url,
            sortOrder: p.sort_order,
          })
        }
      }

      // Asynchronously purge duplicate rows from Supabase
      if (!isMockMode()) {
        if (duplicateExpIds.length > 0) void supabaseAdmin.from('profile_experience').delete().in('id', duplicateExpIds)
        if (duplicateEduIds.length > 0) void supabaseAdmin.from('profile_education').delete().in('id', duplicateEduIds)
        if (duplicateCertIds.length > 0) void supabaseAdmin.from('profile_certifications').delete().in('id', duplicateCertIds)
        if (duplicateProjIds.length > 0) void supabaseAdmin.from('profile_projects').delete().in('id', duplicateProjIds)
        if (duplicateSkillIds.length > 0) void supabaseAdmin.from('profile_skills').delete().in('id', duplicateSkillIds)
      }

      const completeness = calculateProfileCompleteness({
        fullName: profile?.full_name,
        email: profile?.email || email,
        phone: profile?.phone,
        location: profile?.location,
        summary: profile?.summary,
        experience,
        education,
        skills,
        projects,
        certifications,
      })

      const rawLinks = Array.isArray(profile?.links) ? profile.links : []
      const websiteLink = rawLinks.find((l: any) => l.id === 'website' || l.label?.toLowerCase() === 'website' || l.label?.toLowerCase() === 'portfolio')
      const githubLink = rawLinks.find((l: any) => l.id === 'github' || l.label?.toLowerCase() === 'github')
      const linkedinLink = rawLinks.find((l: any) => l.id === 'linkedin' || l.label?.toLowerCase() === 'linkedin')
      const customLinks = rawLinks.filter((l: any) => !['website', 'github', 'linkedin'].includes(l.id) && !['website', 'github', 'linkedin', 'portfolio'].includes(l.label?.toLowerCase()))

      return {
        id: userId,
        email: profile?.email || email,
        fullName: profile?.full_name || '',
        headline: profile?.headline || '',
        phone: profile?.phone || '',
        location: profile?.location || '',
        summary: profile?.summary || '',
        website: profile?.website || (websiteLink ? websiteLink.url : ''),
        github: profile?.github || (githubLink ? githubLink.url : ''),
        linkedin: profile?.linkedin || (linkedinLink ? linkedinLink.url : ''),
        customLinks,
        completeness,
        experience,
        education,
        skills,
        certifications,
        projects,
        onboardingCompleted: Boolean(profile?.onboarding_completed),
        updatedAt: profile?.updated_at,
      }
    } catch (err) {
      logger.warn({ err, userId }, 'Error fetching full profile from DB; falling back to local persistent store')
      const store = getOrCreateMockStore(userId, email)
      const completeness = calculateProfileCompleteness({
        fullName: store.root.full_name as string,
        email: store.root.email as string,
        phone: store.root.phone as string,
        location: store.root.location as string,
        summary: store.root.summary as string,
        experience: store.experience,
        education: store.education,
        skills: store.skills,
        projects: store.projects,
        certifications: store.certifications,
      })

      return {
        id: userId,
        email: (store.root.email as string) || email,
        fullName: (store.root.full_name as string) || '',
        headline: (store.root.headline as string) || '',
        phone: (store.root.phone as string) || '',
        location: (store.root.location as string) || '',
        summary: (store.root.summary as string) || '',
        website: (store.root.website as string) || '',
        github: (store.root.github as string) || '',
        linkedin: (store.root.linkedin as string) || '',
        customLinks:
          (store.root.customLinks as Array<{ id: string; label: string; url: string }>) || [],
        completeness,
        experience: store.experience,
        education: store.education,
        skills: store.skills,
        certifications: store.certifications,
        projects: store.projects,
        onboardingCompleted: Boolean(store.root.onboarding_completed),
        updatedAt: store.root.updated_at as string,
      }
    }
  }

  /**
   * Updates root profile information (contact, links, summary, and sections if provided)
   */
  static async updateProfileRoot(
    userId: string,
    updates: Record<string, unknown>
  ): Promise<FullProfile> {
    if (isMockMode()) {
      const store = getOrCreateMockStore(userId)
      if (updates.fullName !== undefined) store.root.full_name = updates.fullName
      if (updates.headline !== undefined) store.root.headline = updates.headline
      if (updates.email !== undefined) store.root.email = updates.email
      if (updates.phone !== undefined) store.root.phone = updates.phone
      if (updates.location !== undefined) store.root.location = updates.location
      if (updates.summary !== undefined) store.root.summary = updates.summary
      if (updates.website !== undefined) store.root.website = updates.website
      if (updates.github !== undefined) store.root.github = updates.github
      if (updates.linkedin !== undefined) store.root.linkedin = updates.linkedin
      if (updates.customLinks !== undefined) store.root.customLinks = updates.customLinks
      if (Array.isArray(updates.experience)) store.experience = updates.experience as ExperienceItem[]
      if (Array.isArray(updates.education)) store.education = updates.education as EducationItem[]
      if (Array.isArray(updates.skills)) store.skills = updates.skills as SkillItem[]
      if (Array.isArray(updates.certifications)) store.certifications = updates.certifications as CertificationItem[]
      if (Array.isArray(updates.projects)) store.projects = updates.projects as ProjectItem[]
      store.root.updated_at = new Date().toISOString()
      saveStoresToDisk(mockStores)
      return this.getFullProfile(userId)
    }

    const payload: Record<string, unknown> = {}
    if (updates.fullName !== undefined) payload.full_name = updates.fullName
    if (updates.headline !== undefined) payload.headline = updates.headline
    if (updates.email !== undefined) payload.email = updates.email
    if (updates.phone !== undefined) payload.phone = updates.phone
    if (updates.location !== undefined) payload.location = updates.location
    if (updates.summary !== undefined) payload.summary = updates.summary

    const hasLinkUpdates =
      updates.website !== undefined ||
      updates.github !== undefined ||
      updates.linkedin !== undefined ||
      updates.customLinks !== undefined

    if (hasLinkUpdates) {
      let existingLinks: Array<{ id: string; label: string; url: string }> = []
      try {
        const { data: cur } = await supabaseAdmin.from('profiles').select('links').eq('id', userId).maybeSingle()
        if (Array.isArray(cur?.links)) existingLinks = cur.links
      } catch {
        // continue
      }

      const newLinks: Array<{ id: string; label: string; url: string }> = []
      const targetWebsite = updates.website !== undefined ? (updates.website as string) : existingLinks.find((l) => l.id === 'website')?.url
      const targetGithub = updates.github !== undefined ? (updates.github as string) : existingLinks.find((l) => l.id === 'github')?.url
      const targetLinkedin = updates.linkedin !== undefined ? (updates.linkedin as string) : existingLinks.find((l) => l.id === 'linkedin')?.url

      if (targetWebsite) newLinks.push({ id: 'website', label: 'Website', url: targetWebsite })
      if (targetLinkedin) newLinks.push({ id: 'linkedin', label: 'LinkedIn', url: targetLinkedin })
      if (targetGithub) newLinks.push({ id: 'github', label: 'GitHub', url: targetGithub })

      const incomingCustom = Array.isArray(updates.customLinks)
        ? (updates.customLinks as Array<{ id: string; label: string; url: string }>)
        : existingLinks.filter((l) => !['website', 'github', 'linkedin'].includes(l.id))

      for (const cl of incomingCustom) {
        if (!['website', 'github', 'linkedin'].includes(cl.id)) {
          newLinks.push(cl)
        }
      }
      payload.links = newLinks
    }
    payload.updated_at = new Date().toISOString()

    try {
      const { data: existingProfile } = await supabaseAdmin.from('profiles').select('id, email').eq('id', userId).maybeSingle()
      if (!existingProfile) {
        await supabaseAdmin.from('profiles').insert({
          id: userId,
          email: `${userId}@example.com`,
          ...payload,
        })
      } else if (Object.keys(payload).length > 0) {
        const { error: updateErr } = await supabaseAdmin.from('profiles').update(payload).eq('id', userId)
        if (updateErr) throw updateErr
      }

      if (Array.isArray(updates.experience)) {
        await supabaseAdmin.from('profile_experience').delete().eq('user_id', userId)
        if (updates.experience.length > 0) {
          const rows = (updates.experience as Record<string, unknown>[]).map((e, idx) =>
            sanitizeExperiencePayload(userId, e, idx)
          )
          await supabaseAdmin.from('profile_experience').insert(rows)
        }
      }

      if (Array.isArray(updates.education)) {
        await supabaseAdmin.from('profile_education').delete().eq('user_id', userId)
        if (updates.education.length > 0) {
          const rows = (updates.education as Record<string, unknown>[]).map((e, idx) =>
            sanitizeEducationPayload(userId, e, idx)
          )
          await supabaseAdmin.from('profile_education').insert(rows)
        }
      }

      if (Array.isArray(updates.skills)) {
        await supabaseAdmin.from('profile_skills').delete().eq('user_id', userId)
        if (updates.skills.length > 0) {
          await this.bulkAddSkills(userId, updates.skills as Array<string | { name: string; category?: string }>)
        }
      }

      if (Array.isArray(updates.certifications)) {
        await supabaseAdmin.from('profile_certifications').delete().eq('user_id', userId)
        if (updates.certifications.length > 0) {
          const rows = (updates.certifications as Record<string, unknown>[]).map((c, idx) =>
            sanitizeCertificationPayload(userId, c, idx)
          )
          await supabaseAdmin.from('profile_certifications').insert(rows)
        }
      }

      if (Array.isArray(updates.projects)) {
        await supabaseAdmin.from('profile_projects').delete().eq('user_id', userId)
        if (updates.projects.length > 0) {
          const rows = (updates.projects as Record<string, unknown>[]).map((p, idx) =>
            sanitizeProjectPayload(userId, p, idx)
          )
          await supabaseAdmin.from('profile_projects').insert(rows)
        }
      }

      return this.getFullProfile(userId)
    } catch (err) {
      logger.warn({ err, userId }, 'Error updating profile in DB; falling back to local persistent store')
      const store = getOrCreateMockStore(userId)
      if (updates.fullName !== undefined) store.root.full_name = updates.fullName
      if (updates.headline !== undefined) store.root.headline = updates.headline
      if (updates.email !== undefined) store.root.email = updates.email
      if (updates.phone !== undefined) store.root.phone = updates.phone
      if (updates.location !== undefined) store.root.location = updates.location
      if (updates.summary !== undefined) store.root.summary = updates.summary
      if (updates.website !== undefined) store.root.website = updates.website
      if (updates.github !== undefined) store.root.github = updates.github
      if (updates.linkedin !== undefined) store.root.linkedin = updates.linkedin
      if (updates.customLinks !== undefined) store.root.customLinks = updates.customLinks
      if (Array.isArray(updates.experience)) store.experience = updates.experience as ExperienceItem[]
      if (Array.isArray(updates.education)) store.education = updates.education as EducationItem[]
      if (Array.isArray(updates.skills)) store.skills = updates.skills as SkillItem[]
      if (Array.isArray(updates.certifications)) store.certifications = updates.certifications as CertificationItem[]
      if (Array.isArray(updates.projects)) store.projects = updates.projects as ProjectItem[]
      store.root.updated_at = new Date().toISOString()
      saveStoresToDisk(mockStores)
      return this.getFullProfile(userId)
    }
  }

  /**
   * Retrieves section items
   */
  static async getSectionItems(userId: string, section: ProfileSection): Promise<unknown[]> {
    if (isMockMode()) {
      const store = getOrCreateMockStore(userId)
      return store[section] || []
    }

    const tableName = `profile_${section}`
    const { data, error } = await supabaseAdmin
      .from(tableName)
      .select('*')
      .eq('user_id', userId)
      .order('sort_order', { ascending: true })
    if (error) throw AppError.internal(`Failed to fetch ${section}`)
    return data || []
  }

  /**
   * Adds an item to a profile section with UUID assignment for bullet points
   */
  static async createSectionItem(
    userId: string,
    section: ProfileSection,
    itemData: Record<string, unknown>
  ): Promise<unknown> {
    const itemId = ensureUuid(itemData.id)

    if (isMockMode()) {
      const store = getOrCreateMockStore(userId)
      let newItem: Record<string, unknown> = { ...itemData, id: itemId }
      if (section === 'experience') {
        const rawBullets = Array.isArray(itemData.bullets) ? itemData.bullets : []
        const bullets = rawBullets.map((b: unknown) => {
          if (typeof b === 'string') return { id: uuidv4(), text: b }
          if (b && typeof b === 'object' && 'text' in b) {
            const bObj = b as { id?: string; text: string }
            return { id: ensureUuid(bObj.id), text: String(bObj.text || '') }
          }
          return { id: uuidv4(), text: String(b) }
        })
        newItem = { ...newItem, bullets }
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(store[section] as any[]).push(newItem)
      saveStoresToDisk(mockStores)
      return newItem
    }

    let dbPayload: Record<string, unknown>
    if (section === 'experience') {
      dbPayload = sanitizeExperiencePayload(userId, { ...itemData, id: itemId })
    } else if (section === 'education') {
      dbPayload = sanitizeEducationPayload(userId, { ...itemData, id: itemId })
    } else if (section === 'certifications') {
      dbPayload = sanitizeCertificationPayload(userId, { ...itemData, id: itemId })
    } else if (section === 'projects') {
      dbPayload = sanitizeProjectPayload(userId, { ...itemData, id: itemId })
    } else {
      dbPayload = {
        id: itemId,
        user_id: userId,
        name: String(itemData.name || ''),
        category: String(itemData.category || 'Other'),
        sort_order: typeof itemData.sortOrder === 'number' ? itemData.sortOrder : 0,
      }
    }

    const tableName = `profile_${section}`
    const { data, error } = await supabaseAdmin.from(tableName).insert(dbPayload).select().single()
    if (error) {
      logger.warn({ error, section, userId }, 'Database insert error for section item; falling back to local persistent store')
      const store = getOrCreateMockStore(userId)
      let newItem: Record<string, unknown> = { ...itemData, id: itemId }
      if (section === 'experience') {
        const rawBullets = Array.isArray(itemData.bullets) ? itemData.bullets : []
        const bullets = rawBullets.map((b: unknown) => {
          if (typeof b === 'string') return { id: uuidv4(), text: b }
          if (b && typeof b === 'object' && 'text' in b) {
            const bObj = b as { id?: string; text: string }
            return { id: ensureUuid(bObj.id), text: String(bObj.text || '') }
          }
          return { id: uuidv4(), text: String(b) }
        })
        newItem = { ...newItem, bullets }
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(store[section] as any[]).push(newItem)
      saveStoresToDisk(mockStores)
      return newItem
    }
    return data
  }

  /**
   * Updates an existing section item
   */
  static async updateSectionItem(
    userId: string,
    section: ProfileSection,
    itemId: string,
    itemData: Record<string, unknown>
  ): Promise<unknown> {
    if (isMockMode()) {
      const store = getOrCreateMockStore(userId)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const list = store[section] as any[]
      const idx = list.findIndex((i) => i.id === itemId)
      if (idx === -1) {
        throw AppError.notFound(`Item with ID ${itemId} not found in ${section}`)
      }
      list[idx] = { ...list[idx], ...itemData, id: itemId }
      saveStoresToDisk(mockStores)
      return list[idx]
    }

    let dbPayload: Record<string, unknown>
    if (section === 'experience') {
      dbPayload = sanitizeExperiencePayload(userId, { ...itemData, id: itemId })
    } else if (section === 'education') {
      dbPayload = sanitizeEducationPayload(userId, { ...itemData, id: itemId })
    } else if (section === 'certifications') {
      dbPayload = sanitizeCertificationPayload(userId, { ...itemData, id: itemId })
    } else if (section === 'projects') {
      dbPayload = sanitizeProjectPayload(userId, { ...itemData, id: itemId })
    } else {
      dbPayload = {
        name: String(itemData.name || ''),
        category: String(itemData.category || 'Other'),
        sort_order: typeof itemData.sortOrder === 'number' ? itemData.sortOrder : 0,
      }
    }

    delete dbPayload.id
    delete dbPayload.user_id

    const tableName = `profile_${section}`
    const { data, error } = await supabaseAdmin
      .from(tableName)
      .update(dbPayload)
      .eq('id', itemId)
      .eq('user_id', userId)
      .select()
      .single()

    if (error) throw AppError.badRequest(`Failed to update item: ${error.message}`)
    return data
  }

  /**
   * Deletes a section item
   */
  static async deleteSectionItem(
    userId: string,
    section: ProfileSection,
    itemId: string
  ): Promise<{ deleted: boolean; id: string }> {
    if (isMockMode()) {
      const store = getOrCreateMockStore(userId)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const list = store[section] as any[]
      const idx = list.findIndex((i) => i.id === itemId)
      if (idx !== -1) list.splice(idx, 1)
      saveStoresToDisk(mockStores)
      return { deleted: true, id: itemId }
    }

    const tableName = `profile_${section}`
    const { error } = await supabaseAdmin
      .from(tableName)
      .delete()
      .eq('id', itemId)
      .eq('user_id', userId)
    if (error) throw AppError.badRequest(`Failed to delete item: ${error.message}`)
    return { deleted: true, id: itemId }
  }

  /**
   * Bulk adds skills case-insensitively (BE-2.07)
   */
  static async bulkAddSkills(
    userId: string,
    rawSkills: Array<{ name: string; category?: string } | string>
  ): Promise<SkillItem[]> {
    if (isMockMode()) {
      const store = getOrCreateMockStore(userId)
      const existingNames = new Set(store.skills.map((s) => s.name.toLowerCase().trim()))

      for (const raw of rawSkills) {
        const name = typeof raw === 'string' ? raw.trim() : raw.name.trim()
        const category = typeof raw === 'object' && raw.category ? raw.category : 'Other'
        if (name && !existingNames.has(name.toLowerCase())) {
          existingNames.add(name.toLowerCase())
          store.skills.push({
            id: uuidv4(),
            name,
            category,
          })
        }
      }
      saveStoresToDisk(mockStores)
      return store.skills
    }

    // Database flow: fetch existing skills first to prevent case-insensitive collisions
    const { data: existing } = await supabaseAdmin
      .from('profile_skills')
      .select('name')
      .eq('user_id', userId)
    const existingSet = new Set((existing || []).map((s) => s.name.toLowerCase().trim()))

    const toInsert = []
    for (const raw of rawSkills) {
      const name = typeof raw === 'string' ? raw.trim() : raw.name.trim()
      const category = typeof raw === 'object' && raw.category ? raw.category : 'Other'
      if (name && !existingSet.has(name.toLowerCase())) {
        existingSet.add(name.toLowerCase())
        toInsert.push({
          id: uuidv4(),
          user_id: userId,
          name,
          category,
        })
      }
    }

    try {
      if (toInsert.length > 0) {
        const { error } = await supabaseAdmin.from('profile_skills').insert(toInsert)
        if (error) throw error
      }

      const { data } = await supabaseAdmin.from('profile_skills').select('*').eq('user_id', userId)
      return (data || []).map((s) => ({ id: s.id, name: s.name, category: s.category }))
    } catch (err) {
      logger.warn({ err, userId }, 'Database bulkAddSkills error; falling back to local persistent store')
      const store = getOrCreateMockStore(userId)
      const existingNames = new Set(store.skills.map((s) => s.name.toLowerCase().trim()))
      for (const raw of rawSkills) {
        const name = typeof raw === 'string' ? raw.trim() : raw.name.trim()
        const category = typeof raw === 'object' && raw.category ? raw.category : 'Other'
        if (name && !existingNames.has(name.toLowerCase())) {
          existingNames.add(name.toLowerCase())
          store.skills.push({ id: uuidv4(), name, category })
        }
      }
      saveStoresToDisk(mockStores)
      return store.skills
    }
  }

  /**
   * Reorders items within a section (BE-2.08)
   */
  static async reorderSection(
    userId: string,
    section: ProfileSection,
    orderedIds: string[]
  ): Promise<FullProfile> {
    if (isMockMode()) {
      const store = getOrCreateMockStore(userId)
      const list = store[section] as unknown as Array<{ id: string; [key: string]: unknown }>
      const idMap = new Map(list.map((item) => [item.id, item]))
      const sorted: Array<{ id: string; [key: string]: unknown }> = []

      for (const id of orderedIds) {
        if (idMap.has(id)) {
          sorted.push(idMap.get(id)!)
          idMap.delete(id)
        }
      }
      // Append any remaining items
      for (const remaining of idMap.values()) {
        sorted.push(remaining)
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      store[section] = sorted as any
      saveStoresToDisk(mockStores)
      return this.getFullProfile(userId)
    }

    // Update sort_order for each item in Postgres
    await Promise.all(
      orderedIds.map((id, index) =>
        supabaseAdmin
          .from(`profile_${section}`)
          .update({ sort_order: index })
          .eq('id', id)
          .eq('user_id', userId)
      )
    )

    return this.getFullProfile(userId)
  }

  /**
   * Creates a temporary resume import draft (BE-2.12 - BE-2.15)
   */
  static async createResumeImport(
    userId: string,
    fileBuffer: Buffer,
    fileName: string,
    fileSize: number
  ): Promise<ResumeImportDraft> {
    // 1. Text extraction with guards (BE-2.13)
    const { rawText } = await extractResumeText(fileBuffer)

    // 2. Structured parsing (BE-2.14)
    let parsedData
    try {
      parsedData = await parseResumeWithAi(rawText)
    } catch (err) {
      logger.warn({ err }, 'AI parsing failed; falling back to heuristicResumeParser')
      parsedData = heuristicResumeParser(rawText)
    }

    const importId = `imp_${uuidv4().replace(/-/g, '').slice(0, 16)}`
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

    const draft: ResumeImportDraft = {
      importId,
      fileName,
      fileSize,
      expiresAt,
      parsedData,
    }

    // Always keep in-memory backup in mockImports
    mockImports.set(importId, { ...draft, userId })

    if (isMockMode()) {
      return draft
    }

    try {
      // Persist to resume_imports table (BE-2.15)
      await supabaseAdmin.from('resume_imports').insert({
        id: importId,
        user_id: userId,
        file_name: fileName,
        file_size: fileSize,
        parsed_data: parsedData,
        expires_at: expiresAt,
      })
    } catch (err) {
      logger.warn({ err }, 'Failed to persist import draft to Supabase; draft retained in memory')
    }

    return draft
  }

  /**
   * Confirms resume import applying merge or replace strategy (BE-2.16)
   */
  static async confirmResumeImport(
    userId: string,
    importId: string,
    options: {
      strategy?: 'merge' | 'replace'
      sections?: Record<string, boolean>
      selectedData?: Record<string, unknown>
      overrides?: Record<string, unknown>
    }
  ): Promise<FullProfile> {
    let draftData: Record<string, unknown> | null = null

    // 1. Prioritize explicit overrides or selectedData from the confirmation payload
    if (options.overrides && Object.keys(options.overrides).length > 0) {
      draftData = options.overrides
    } else if (options.selectedData && Object.keys(options.selectedData).length > 0) {
      draftData = options.selectedData
    }

    // 2. Check in-memory mockImports
    if (!draftData && mockImports.has(importId)) {
      const draft = mockImports.get(importId)
      if (draft && draft.userId === userId) {
        draftData = draft.parsedData
        mockImports.delete(importId)
      }
    }

    // 3. Check Supabase resume_imports table
    if (!draftData && !isMockMode()) {
      try {
        const { data } = await supabaseAdmin
          .from('resume_imports')
          .select('*')
          .eq('id', importId)
          .eq('user_id', userId)
          .single()
        if (data?.parsed_data) {
          draftData = data.parsed_data
          await supabaseAdmin.from('resume_imports').delete().eq('id', importId)
        }
      } catch {
        // continue
      }
    }

    if (!draftData) {
      throw AppError.notFound('Resume import draft not found or expired.', 'IMPORT_NOT_FOUND')
    }

    const strategy = options.strategy || 'merge'
    const allowed = options.sections || {
      contact: true,
      summary: true,
      experience: true,
      education: true,
      skills: true,
      certifications: true,
      projects: true,
    }

    const payload = (draftData || {}) as {
      contact?: {
        fullName?: string
        headline?: string
        email?: string
        phone?: string
        location?: string
        website?: string
        linkedin?: string
        github?: string
      }
      summary?: string
      experience?: Record<string, unknown>[]
      education?: Record<string, unknown>[]
      skills?: Array<string | { name: string; category?: string }>
      certifications?: Record<string, unknown>[]
      projects?: Record<string, unknown>[]
    }

    // Apply updates based on strategy
    if (payload.contact && allowed.contact !== false) {
      await this.updateProfileRoot(userId, {
        fullName: payload.contact.fullName,
        headline: payload.contact.headline,
        email: payload.contact.email,
        phone: payload.contact.phone,
        location: payload.contact.location,
        website: payload.contact.website,
        linkedin: payload.contact.linkedin,
        github: payload.contact.github,
      })
    }

    if (payload.summary && allowed.summary !== false) {
      await this.updateProfileRoot(userId, { summary: payload.summary })
    }

    if (Array.isArray(payload.experience) && allowed.experience !== false) {
      if (strategy === 'replace') {
        if (!isMockMode()) {
          try {
            await supabaseAdmin.from('profile_experience').delete().eq('user_id', userId)
          } catch {
            // Ignore DB error, will populate mock store
          }
        }
        getOrCreateMockStore(userId).experience = []
      }

      let existingExpKeys = new Set<string>()
      if (strategy === 'merge') {
        if (isMockMode()) {
          const store = getOrCreateMockStore(userId)
          existingExpKeys = new Set((store.experience || []).map((e) => `${(e.company || '').trim().toLowerCase()}::${(e.title || '').trim().toLowerCase()}`))
        } else {
          try {
            const { data } = await supabaseAdmin.from('profile_experience').select('company, title').eq('user_id', userId)
            existingExpKeys = new Set((data || []).map((e: any) => `${(e.company || '').trim().toLowerCase()}::${(e.title || '').trim().toLowerCase()}`))
          } catch {
            // continue
          }
        }
      }

      for (const exp of payload.experience) {
        const key = `${String((exp as any).company || '').trim().toLowerCase()}::${String((exp as any).title || '').trim().toLowerCase()}`
        if (strategy === 'merge' && existingExpKeys.has(key)) {
          continue
        }
        existingExpKeys.add(key)
        await this.createSectionItem(userId, 'experience', exp)
      }
    }

    if (Array.isArray(payload.education) && allowed.education !== false) {
      if (strategy === 'replace') {
        if (!isMockMode()) {
          try {
            await supabaseAdmin.from('profile_education').delete().eq('user_id', userId)
          } catch {
            // Ignore DB error
          }
        }
        getOrCreateMockStore(userId).education = []
      }

      let existingEduKeys = new Set<string>()
      if (strategy === 'merge') {
        if (isMockMode()) {
          const store = getOrCreateMockStore(userId)
          existingEduKeys = new Set((store.education || []).map((e) => `${(e.institution || '').trim().toLowerCase()}::${(e.degree || '').trim().toLowerCase()}`))
        } else {
          try {
            const { data } = await supabaseAdmin.from('profile_education').select('institution, degree').eq('user_id', userId)
            existingEduKeys = new Set((data || []).map((e: any) => `${(e.institution || '').trim().toLowerCase()}::${(e.degree || '').trim().toLowerCase()}`))
          } catch {
            // continue
          }
        }
      }

      for (const edu of payload.education) {
        const key = `${String((edu as any).institution || '').trim().toLowerCase()}::${String((edu as any).degree || '').trim().toLowerCase()}`
        if (strategy === 'merge' && existingEduKeys.has(key)) {
          continue
        }
        existingEduKeys.add(key)
        await this.createSectionItem(userId, 'education', edu)
      }
    }

    if (Array.isArray(payload.skills) && allowed.skills !== false) {
      if (strategy === 'replace') {
        if (!isMockMode()) {
          try {
            await supabaseAdmin.from('profile_skills').delete().eq('user_id', userId)
          } catch {
            // Ignore DB error
          }
        }
        getOrCreateMockStore(userId).skills = []
      }
      await this.bulkAddSkills(userId, payload.skills)
    }

    if (Array.isArray(payload.certifications) && allowed.certifications !== false) {
      if (strategy === 'replace') {
        if (!isMockMode()) {
          try {
            await supabaseAdmin.from('profile_certifications').delete().eq('user_id', userId)
          } catch {
            // Ignore DB error
          }
        }
        getOrCreateMockStore(userId).certifications = []
      }

      let existingCertKeys = new Set<string>()
      if (strategy === 'merge') {
        if (isMockMode()) {
          const store = getOrCreateMockStore(userId)
          existingCertKeys = new Set((store.certifications || []).map((c) => `${(c.name || '').trim().toLowerCase()}::${(c.issuer || '').trim().toLowerCase()}`))
        } else {
          try {
            const { data } = await supabaseAdmin.from('profile_certifications').select('name, issuer').eq('user_id', userId)
            existingCertKeys = new Set((data || []).map((c: any) => `${(c.name || '').trim().toLowerCase()}::${(c.issuer || '').trim().toLowerCase()}`))
          } catch {
            // continue
          }
        }
      }

      for (const cert of payload.certifications) {
        const key = `${String((cert as any).name || '').trim().toLowerCase()}::${String((cert as any).issuer || '').trim().toLowerCase()}`
        if (strategy === 'merge' && existingCertKeys.has(key)) {
          continue
        }
        existingCertKeys.add(key)
        await this.createSectionItem(userId, 'certifications', cert)
      }
    }

    if (Array.isArray(payload.projects) && allowed.projects !== false) {
      if (strategy === 'replace') {
        if (!isMockMode()) {
          try {
            await supabaseAdmin.from('profile_projects').delete().eq('user_id', userId)
          } catch {
            // Ignore DB error
          }
        }
        getOrCreateMockStore(userId).projects = []
      }

      let existingProjKeys = new Set<string>()
      if (strategy === 'merge') {
        if (isMockMode()) {
          const store = getOrCreateMockStore(userId)
          existingProjKeys = new Set((store.projects || []).map((p) => (p.title || '').trim().toLowerCase()))
        } else {
          try {
            const { data } = await supabaseAdmin.from('profile_projects').select('title').eq('user_id', userId)
            existingProjKeys = new Set((data || []).map((p: any) => (p.title || '').trim().toLowerCase()))
          } catch {
            // continue
          }
        }
      }

      for (const proj of payload.projects) {
        const key = String((proj as any).title || '').trim().toLowerCase()
        if (strategy === 'merge' && existingProjKeys.has(key)) {
          continue
        }
        existingProjKeys.add(key)
        await this.createSectionItem(userId, 'projects', proj)
      }
    }

    return await this.getFullProfile(userId)
  }

  /**
   * Discards stale import draft (BE-2.17)
   */
  static async discardResumeImport(
    userId: string,
    importId: string
  ): Promise<{ discarded: boolean }> {
    if (isMockMode()) {
      mockImports.delete(importId)
      return { discarded: true }
    }

    await supabaseAdmin.from('resume_imports').delete().eq('id', importId).eq('user_id', userId)
    return { discarded: true }
  }

  /**
   * Resets or configures mock store (for testing)
   */
  static clearMockData(userId?: string): void {
    if (userId) {
      mockStores.delete(userId)
    } else {
      mockStores.clear()
    }
  }

  static setMockStore(userId: string, data: Partial<MockProfileData>): void {
    const store = getOrCreateMockStore(userId)
    if (data.root) Object.assign(store.root, data.root)
    if (data.experience) store.experience = data.experience
    if (data.education) store.education = data.education
    if (data.skills) store.skills = data.skills
    if (data.projects) store.projects = data.projects
    if (data.certifications) store.certifications = data.certifications
  }

  /**
   * Purges expired or stale resume import drafts (BE-6.08).
   */
  static async purgeStaleImports(olderThanHours = 24): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanHours * 3600 * 1000).toISOString()
    let purged = 0
    if (isMockMode()) {
      for (const [id, item] of mockImports.entries()) {
        if (item.expiresAt < cutoff) {
          mockImports.delete(id)
          purged++
        }
      }
      return purged
    }

    try {
      const { data } = await supabaseAdmin
        .from('resume_imports')
        .delete()
        .lt('created_at', cutoff)
        .select('id')
      purged = data?.length || 0
    } catch {
      // non-fatal
    }
    return purged
  }
}
