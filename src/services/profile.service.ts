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

const camelToSnakeMap: Record<string, string> = {
  startDate: 'start_date',
  endDate: 'end_date',
  fieldOfStudy: 'field_of_study',
  sortOrder: 'sort_order',
  issueDate: 'issue_date',
  expiryDate: 'expiry_date',
  doesNotExpire: 'does_not_expire',
  credentialId: 'credential_id',
  credentialUrl: 'credential_url',
  techStack: 'tech_stack',
  repoUrl: 'repo_url',
  liveUrl: 'live_url',
  fullName: 'full_name',
}

function mapToSnakeCase(data: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      const dbKey = camelToSnakeMap[key] || key
      result[dbKey] = value
    }
  }
  return result
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
    store = {
      root: {
        id: userId,
        email: email || `${userId}@example.com`,
        full_name: 'Alex Morgan',
        headline: 'Senior Full Stack Engineer',
        phone: '+1 (555) 019-2834',
        location: 'San Francisco, CA',
        summary: 'Experienced software engineer specializing in web and distributed systems.',
        website: 'https://alexmorgan.dev',
        github: 'https://github.com/alexmorgan',
        linkedin: 'https://linkedin.com/in/alexmorgan',
        customLinks: [],
        onboarding_completed: true,
        updated_at: new Date().toISOString(),
      },
      experience: [
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
      ],
      education: [
        {
          id: uuidv4(),
          institution: 'UC Berkeley',
          degree: 'B.S. in Computer Science',
          fieldOfStudy: 'Computer Science',
          startDate: '2018-08',
          endDate: '2022-05',
        },
      ],
      skills: [
        { id: uuidv4(), name: 'TypeScript', category: 'Languages' },
        { id: uuidv4(), name: 'React', category: 'Frontend' },
        { id: uuidv4(), name: 'Node.js', category: 'Backend' },
        { id: uuidv4(), name: 'PostgreSQL', category: 'Databases' },
      ],
      certifications: [
        {
          id: uuidv4(),
          name: 'Certified Kubernetes Administrator',
          issuer: 'CNCF',
          issueDate: '2023-05',
          doesNotExpire: false,
        },
      ],
      projects: [
        {
          id: uuidv4(),
          title: 'LatexAI Engine',
          role: 'Creator',
          description: 'Automated ATS LaTeX typesetting platform.',
          techStack: ['TypeScript', 'Express', 'React'],
        },
      ],
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

      const experience: ExperienceItem[] = (expRes.data || []).map((e) => ({
        id: e.id,
        company: e.company,
        title: e.title,
        location: e.location,
        startDate: e.start_date,
        endDate: e.end_date,
        current: e.current,
        bullets: e.bullets || [],
        sortOrder: e.sort_order,
      }))

      const education: EducationItem[] = (eduRes.data || []).map((e) => ({
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
      }))

      const skills: SkillItem[] = (skillRes.data || []).map((s) => ({
        id: s.id,
        name: s.name,
        category: s.category,
        sortOrder: s.sort_order,
      }))

      const certifications: CertificationItem[] = (certRes.data || []).map((c) => ({
        id: c.id,
        name: c.name,
        issuer: c.issuer,
        issueDate: c.issue_date,
        expiryDate: c.expiry_date,
        doesNotExpire: c.does_not_expire,
        credentialId: c.credential_id,
        credentialUrl: c.credential_url,
        sortOrder: c.sort_order,
      }))

      const projects: ProjectItem[] = (projRes.data || []).map((p) => ({
        id: p.id,
        title: p.title,
        role: p.role,
        description: p.description,
        techStack: p.tech_stack || [],
        liveUrl: p.live_url,
        repoUrl: p.repo_url,
        sortOrder: p.sort_order,
      }))

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

      return {
        id: userId,
        email: profile?.email || email,
        fullName: profile?.full_name || '',
        headline: profile?.headline || '',
        phone: profile?.phone || '',
        location: profile?.location || '',
        summary: profile?.summary || '',
        website: profile?.website || '',
        github: profile?.github || '',
        linkedin: profile?.linkedin || '',
        customLinks: profile?.links || [],
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
    if (updates.phone !== undefined) payload.phone = updates.phone
    if (updates.location !== undefined) payload.location = updates.location
    if (updates.summary !== undefined) payload.summary = updates.summary
    if (updates.customLinks !== undefined) payload.links = updates.customLinks
    payload.updated_at = new Date().toISOString()

    try {
      if (Object.keys(payload).length > 0) {
        const { error: updateErr } = await supabaseAdmin.from('profiles').update(payload).eq('id', userId)
        if (updateErr) throw updateErr
      }

      if (Array.isArray(updates.experience)) {
        await supabaseAdmin.from('profile_experience').delete().eq('user_id', userId)
        if (updates.experience.length > 0) {
          const rows = (updates.experience as Record<string, unknown>[]).map((e, idx) => ({
            id: (e.id as string) || uuidv4(),
            user_id: userId,
            company: e.company,
            title: e.title,
            location: e.location,
            start_date: e.startDate,
            end_date: e.endDate,
            current: Boolean(e.current),
            bullets: e.bullets || [],
            sort_order: (e.sortOrder as number) ?? idx,
          }))
          await supabaseAdmin.from('profile_experience').insert(rows)
        }
      }

      if (Array.isArray(updates.education)) {
        await supabaseAdmin.from('profile_education').delete().eq('user_id', userId)
        if (updates.education.length > 0) {
          const rows = (updates.education as Record<string, unknown>[]).map((e, idx) => ({
            id: (e.id as string) || uuidv4(),
            user_id: userId,
            institution: e.institution,
            degree: e.degree,
            field_of_study: e.fieldOfStudy,
            location: e.location,
            start_date: e.startDate,
            end_date: e.endDate,
            current: Boolean(e.current),
            gpa: e.gpa,
            honors: e.honors,
            sort_order: (e.sortOrder as number) ?? idx,
          }))
          await supabaseAdmin.from('profile_education').insert(rows)
        }
      }

      if (Array.isArray(updates.skills)) {
        await supabaseAdmin.from('profile_skills').delete().eq('user_id', userId)
        if (updates.skills.length > 0) {
          const rows = updates.skills.map((s, idx) => ({
            id: (typeof s === 'object' && s && 'id' in s ? (s as { id?: string }).id : '') || uuidv4(),
            user_id: userId,
            name: typeof s === 'string' ? s : (s as { name: string }).name,
            category: (typeof s === 'object' && s && 'category' in s ? (s as { category?: string }).category : 'Other') || 'Other',
            sort_order: idx,
          }))
          await supabaseAdmin.from('profile_skills').insert(rows)
        }
      }

      if (Array.isArray(updates.certifications)) {
        await supabaseAdmin.from('profile_certifications').delete().eq('user_id', userId)
        if (updates.certifications.length > 0) {
          const rows = (updates.certifications as Record<string, unknown>[]).map((c, idx) => ({
            id: (c.id as string) || uuidv4(),
            user_id: userId,
            name: c.name,
            issuer: c.issuer,
            issue_date: c.issueDate,
            expiry_date: c.expiryDate,
            does_not_expire: Boolean(c.doesNotExpire),
            credential_id: c.credentialId,
            credential_url: c.credentialUrl,
            sort_order: (c.sortOrder as number) ?? idx,
          }))
          await supabaseAdmin.from('profile_certifications').insert(rows)
        }
      }

      if (Array.isArray(updates.projects)) {
        await supabaseAdmin.from('profile_projects').delete().eq('user_id', userId)
        if (updates.projects.length > 0) {
          const rows = (updates.projects as Record<string, unknown>[]).map((p, idx) => ({
            id: (p.id as string) || uuidv4(),
            user_id: userId,
            title: p.title,
            role: p.role,
            description: p.description,
            tech_stack: p.techStack || [],
            live_url: p.liveUrl,
            repo_url: p.repoUrl,
            sort_order: (p.sortOrder as number) ?? idx,
          }))
          await supabaseAdmin.from('profile_projects').insert(rows)
        }
      }

      return this.getFullProfile(userId)
    } catch (err) {
      logger.warn({ err, userId }, 'Error updating profile in DB; falling back to local persistent store')
      const store = getOrCreateMockStore(userId)
      if (updates.fullName !== undefined) store.root.full_name = updates.fullName
      if (updates.headline !== undefined) store.root.headline = updates.headline
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
    const itemId = (itemData.id as string) || uuidv4()

    // Bullet point server-side UUID normalization for experience (BE-2.06)
    if (section === 'experience' && Array.isArray(itemData.bullets)) {
      itemData.bullets = itemData.bullets.map((b: unknown) => {
        if (typeof b === 'string') return { id: uuidv4(), text: b }
        if (b && typeof b === 'object' && 'text' in b) {
          return { id: (b as { id?: string }).id || uuidv4(), text: (b as { text: string }).text }
        }
        return { id: uuidv4(), text: String(b) }
      })
    }

    if (isMockMode()) {
      const store = getOrCreateMockStore(userId)
      const newItem = { id: itemId, ...itemData }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(store[section] as any[]).push(newItem)
      saveStoresToDisk(mockStores)
      return newItem
    }

    const tableName = `profile_${section}`
    const dbPayload: Record<string, unknown> = {
      id: itemId,
      user_id: userId,
      ...mapToSnakeCase(itemData),
    }

    const { data, error } = await supabaseAdmin.from(tableName).insert(dbPayload).select().single()
    if (error) {
      logger.warn({ error, section, userId }, 'Database insert error for section item; falling back to local persistent store')
      const store = getOrCreateMockStore(userId)
      const newItem = { id: itemId, ...itemData }
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
    if (section === 'experience' && Array.isArray(itemData.bullets)) {
      itemData.bullets = itemData.bullets.map((b: unknown) => {
        if (typeof b === 'string') return { id: uuidv4(), text: b }
        if (b && typeof b === 'object' && 'text' in b) {
          return { id: (b as { id?: string }).id || uuidv4(), text: (b as { text: string }).text }
        }
        return { id: uuidv4(), text: String(b) }
      })
    }

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

    const tableName = `profile_${section}`
    const dbPayload = mapToSnakeCase(itemData)
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

    if (isMockMode() || mockImports.has(importId)) {
      const draft = mockImports.get(importId)
      if (!draft || draft.userId !== userId) {
        throw AppError.notFound('Resume import draft not found or expired.', 'IMPORT_NOT_FOUND')
      }
      draftData = options.overrides || options.selectedData || draft.parsedData
      mockImports.delete(importId)
    } else {
      try {
        const { data, error } = await supabaseAdmin
          .from('resume_imports')
          .select('*')
          .eq('id', importId)
          .eq('user_id', userId)
          .single()
        if (error || !data) {
          throw AppError.notFound('Resume import draft not found or expired.', 'IMPORT_NOT_FOUND')
        }
        draftData = options.overrides || options.selectedData || data.parsed_data
        await supabaseAdmin.from('resume_imports').delete().eq('id', importId)
      } catch (err) {
        if (err instanceof AppError) throw err
        const draft = mockImports.get(importId)
        if (draft && draft.userId === userId) {
          draftData = options.overrides || options.selectedData || draft.parsedData
          mockImports.delete(importId)
        } else {
          throw AppError.notFound('Resume import draft not found or expired.', 'IMPORT_NOT_FOUND')
        }
      }
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
      for (const exp of payload.experience) {
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
      for (const edu of payload.education) {
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
      for (const cert of payload.certifications) {
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
      for (const proj of payload.projects) {
        await this.createSectionItem(userId, 'projects', proj)
      }
    }

    return this.getFullProfile(userId)
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
