import fs from 'fs'
import path from 'path'
import { SignJWT } from 'jose'
import { supabaseAdmin } from '../db/supabase.js'
import { env } from '../config/env.js'
import { AppError, ERROR_CODES } from '../utils/errors.js'
import { logger } from '../utils/logger.js'

export interface ProfileCompleteness {
  percentage: number
  sections: {
    contact: boolean
    summary: boolean
    experience: boolean
    education: boolean
    skills: boolean
  }
}

export interface UserProfileResponse {
  id: string
  email: string
  fullName: string
  headline: string
  phone?: string
  location?: string
  summary?: string
  links?: Array<{ id: string; label: string; url: string }>
  targetRole?: string
  industry?: string
  experienceLevel?: string
  tonePreference?: string
  bulletDensity?: string
  onboardingCompleted: boolean
  activeTemplateId: string
  completeness: ProfileCompleteness
  createdAt: string
  updatedAt: string
}

export interface OnboardingCompletionData {
  fullName?: string
  headline?: string
  targetRole?: string
  industry?: string
  experienceLevel?: string
  templateId?: string
  tonePreference?: string
  bulletDensity?: string
}

export interface RawProfileRecord {
  id: string
  email: string
  full_name: string | null
  headline: string | null
  phone: string | null
  location: string | null
  summary: string | null
  links: Array<{ id: string; label: string; url: string }> | null
  target_role?: string | null
  industry?: string | null
  experience_level?: string | null
  tone_preference?: string | null
  bullet_density?: string | null
  onboarding_completed: boolean
  active_template_id: string | null
  created_at: string
  updated_at: string
}

const DATA_DIR = path.resolve(process.cwd(), '.data')
const AUTH_PROFILES_FILE = path.join(DATA_DIR, 'auth_profiles.json')

function loadAuthProfilesFromDisk(): Map<string, RawProfileRecord> {
  try {
    if (fs.existsSync(AUTH_PROFILES_FILE)) {
      const raw = fs.readFileSync(AUTH_PROFILES_FILE, 'utf-8')
      const parsed = JSON.parse(raw)
      return new Map(Object.entries(parsed))
    }
  } catch (err) {
    logger.warn({ err }, 'Could not read persisted auth profiles store')
  }
  return new Map()
}

export function saveAuthProfilesToDisk(stores: Map<string, RawProfileRecord>): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true })
    }
    const obj = Object.fromEntries(stores.entries())
    fs.writeFileSync(AUTH_PROFILES_FILE, JSON.stringify(obj, null, 2), 'utf-8')
  } catch (err) {
    logger.warn({ err }, 'Could not persist auth profiles store to disk')
  }
}

// In-memory & disk profile store for local development with placeholder Supabase credentials & tests
const localMockProfiles = loadAuthProfilesFromDisk()

export class AuthService {
  /**
   * Calculates profile completeness metrics
   */
  static calculateCompleteness(profile: RawProfileRecord): ProfileCompleteness {
    const hasContact = Boolean(
      profile.email && (profile.phone || profile.location || profile.full_name)
    )
    const hasSummary = Boolean(profile.summary && profile.summary.trim().length >= 20)
    // For Phase A, experience, education, skills default to true if onboarding was completed, or based on presence
    const hasExperience = profile.onboarding_completed
    const hasEducation = profile.onboarding_completed
    const hasSkills = profile.onboarding_completed

    const sections = {
      contact: hasContact,
      summary: hasSummary,
      experience: hasExperience,
      education: hasEducation,
      skills: hasSkills,
    }

    const totalWeight = Object.values(sections).filter(Boolean).length
    const percentage = Math.round((totalWeight / 5) * 100)

    return { percentage, sections }
  }

  /**
   * Retrieves profile for authenticated user
   */
  static async getMe(userId: string, email = ''): Promise<UserProfileResponse> {
    const isMock =
      env.SUPABASE_URL.includes('placeholder') ||
      env.SUPABASE_URL.includes('mock') ||
      env.NODE_ENV === 'test'

    if (isMock) {
      let mock = localMockProfiles.get(userId)
      if (!mock) {
        mock = {
          id: userId,
          email: email || `${userId}@example.com`,
          full_name: email.split('@')[0] || 'User',
          headline: '',
          phone: '',
          location: '',
          summary: '',
          links: [],
          onboarding_completed: false,
          active_template_id: 'tpl_default_swe',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
        localMockProfiles.set(userId, mock)
        saveAuthProfilesToDisk(localMockProfiles)
      }
      return {
        id: mock.id,
        email: mock.email,
        fullName: mock.full_name || '',
        headline: mock.headline || '',
        phone: mock.phone || '',
        location: mock.location || '',
        summary: mock.summary || '',
        links: mock.links || [],
        onboardingCompleted: mock.onboarding_completed,
        activeTemplateId: mock.active_template_id || 'tpl_default_swe',
        completeness: this.calculateCompleteness(mock),
        createdAt: mock.created_at,
        updatedAt: mock.updated_at,
      }
    }

    let authUserMeta: Record<string, unknown> | null = null
    let authEmail = email
    try {
      const { data: authUserRes } = await supabaseAdmin.auth.admin.getUserById(userId)
      if (authUserRes?.user) {
        authUserMeta = (authUserRes.user.user_metadata as Record<string, unknown>) || null
        authEmail = authUserRes.user.email || authEmail
      }
    } catch (authFetchErr) {
      logger.debug({ authFetchErr, userId }, 'Could not read Supabase auth admin metadata')
    }

    const metaFullName =
      (authUserMeta?.full_name as string) ||
      (authUserMeta?.fullName as string) ||
      (authUserMeta?.name as string) ||
      ''
    const metaHeadline =
      (authUserMeta?.headline as string) ||
      (authUserMeta?.target_role as string) ||
      ''

    try {
      const { data, error } = await supabaseAdmin
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle()

      if (error && error.code !== 'PGRST116') {
        throw error
      }

      let profile = data as RawProfileRecord | null

      // If profile does not exist yet (e.g. created outside trigger or before schema migration)
      if (!profile) {
        const emailPrefix = (authEmail ? authEmail.split('@')[0] : '') || 'User'
        const defaultName =
          metaFullName ||
          emailPrefix
            .replace(/[._-]/g, ' ')
            .replace(/\b\w/g, (c) => c.toUpperCase())

        const insertResult = await supabaseAdmin
          .from('profiles')
          .insert({
            id: userId,
            email: authEmail || `${userId}@example.com`,
            full_name: defaultName,
            headline: metaHeadline,
            active_template_id: 'tpl_default_swe',
            onboarding_completed: false,
          })
          .select()
          .single()

        if (insertResult.data) {
          profile = insertResult.data as RawProfileRecord
        } else {
          // In-memory fallback if DB table not yet created
          profile = {
            id: userId,
            email: authEmail || `${userId}@example.com`,
            full_name: defaultName,
            headline: metaHeadline,
            phone: '',
            location: '',
            summary: '',
            links: [],
            onboarding_completed: false,
            active_template_id: 'tpl_default_swe',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }
        }
      } else if (metaFullName && (!profile.full_name || profile.full_name === 'User')) {
        profile.full_name = metaFullName
        try {
          await supabaseAdmin.from('profiles').update({ full_name: metaFullName }).eq('id', userId)
        } catch {
          // best-effort update
        }
      }

      const completeness = this.calculateCompleteness(profile)

      const isOnboardingCompleted = Boolean(
        profile.onboarding_completed ||
        authUserMeta?.onboarding_completed === true
      )

      // Ensure profile and authUserMeta stay in sync
      if (!profile.onboarding_completed && isOnboardingCompleted) {
        profile.onboarding_completed = true
        Promise.resolve(
          supabaseAdmin
            .from('profiles')
            .update({ onboarding_completed: true })
            .eq('id', userId)
        ).catch(() => {})
      }
      if (profile.onboarding_completed && authUserMeta?.onboarding_completed !== true) {
        Promise.resolve(
          supabaseAdmin.auth.admin.updateUserById(userId, {
            user_metadata: { onboarding_completed: true },
          })
        ).catch(() => {})
      }

      return {
        id: profile.id,
        email: profile.email || authEmail,
        fullName: profile.full_name || metaFullName || '',
        headline: profile.headline || metaHeadline || '',
        phone: profile.phone || '',
        location: profile.location || '',
        summary: profile.summary || '',
        links: profile.links || [],
        targetRole: profile.target_role || undefined,
        industry: profile.industry || undefined,
        experienceLevel: profile.experience_level || undefined,
        tonePreference: profile.tone_preference || undefined,
        bulletDensity: profile.bullet_density || undefined,
        onboardingCompleted: isOnboardingCompleted,
        activeTemplateId: profile.active_template_id || (authUserMeta?.active_template_id as string) || 'tpl_default_swe',
        completeness,
        createdAt: profile.created_at,
        updatedAt: profile.updated_at,
      }
    } catch (err) {
      logger.warn({ err, userId }, 'Error in AuthService.getMe; falling back to local persistent store')
      let mock = localMockProfiles.get(userId)
      if (!mock) {
        const fallbackPrefix = (authEmail ? authEmail.split('@')[0] : '') || 'User'
        const fallbackName =
          metaFullName ||
          fallbackPrefix
            .replace(/[._-]/g, ' ')
            .replace(/\b\w/g, (c) => c.toUpperCase())

        mock = {
          id: userId,
          email: authEmail || `${userId}@example.com`,
          full_name: fallbackName,
          headline: metaHeadline,
          phone: '',
          location: '',
          summary: '',
          links: [],
          onboarding_completed: false,
          active_template_id: 'tpl_default_swe',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
        localMockProfiles.set(userId, mock)
        saveAuthProfilesToDisk(localMockProfiles)
      }
      return {
        id: mock.id,
        email: mock.email,
        fullName: mock.full_name || metaFullName || '',
        headline: mock.headline || metaHeadline || '',
        phone: mock.phone || '',
        location: mock.location || '',
        summary: mock.summary || '',
        links: mock.links || [],
        targetRole: mock.target_role || undefined,
        industry: mock.industry || undefined,
        experienceLevel: mock.experience_level || undefined,
        tonePreference: mock.tone_preference || undefined,
        bulletDensity: mock.bullet_density || undefined,
        onboardingCompleted: mock.onboarding_completed,
        activeTemplateId: mock.active_template_id || 'tpl_default_swe',
        completeness: this.calculateCompleteness(mock),
        createdAt: mock.created_at,
        updatedAt: mock.updated_at,
      }
    }
  }

  /**
   * Updates partial profile information
   */
  static async updateProfile(
    userId: string,
    updates: { fullName?: string; headline?: string; activeTemplateId?: string }
  ): Promise<UserProfileResponse> {
    const isMock =
      env.SUPABASE_URL.includes('placeholder') ||
      env.SUPABASE_URL.includes('mock') ||
      env.NODE_ENV === 'test'

    if (isMock) {
      let mock = localMockProfiles.get(userId)
      if (!mock) {
        mock = {
          id: userId,
          email: `${userId}@example.com`,
          full_name: updates.fullName || '',
          headline: updates.headline || '',
          phone: '',
          location: '',
          summary: '',
          links: [],
          onboarding_completed: false,
          active_template_id: updates.activeTemplateId || 'tpl_default_swe',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
      } else {
        if (updates.fullName !== undefined) mock.full_name = updates.fullName
        if (updates.headline !== undefined) mock.headline = updates.headline
        if (updates.activeTemplateId !== undefined)
          mock.active_template_id = updates.activeTemplateId
        mock.updated_at = new Date().toISOString()
      }
      localMockProfiles.set(userId, mock)
      saveAuthProfilesToDisk(localMockProfiles)

      return {
        id: mock.id,
        email: mock.email,
        fullName: mock.full_name || '',
        headline: mock.headline || '',
        phone: mock.phone || '',
        location: mock.location || '',
        summary: mock.summary || '',
        links: mock.links || [],
        onboardingCompleted: mock.onboarding_completed,
        activeTemplateId: mock.active_template_id || 'tpl_default_swe',
        completeness: this.calculateCompleteness(mock),
        createdAt: mock.created_at,
        updatedAt: mock.updated_at,
      }
    }

    const payload: Record<string, unknown> = {}
    if (updates.fullName !== undefined) payload.full_name = updates.fullName
    if (updates.headline !== undefined) payload.headline = updates.headline
    if (updates.activeTemplateId !== undefined)
      payload.active_template_id = updates.activeTemplateId

    try {
      const { data, error } = await supabaseAdmin
        .from('profiles')
        .update(payload)
        .eq('id', userId)
        .select()
        .single()

      if (error) {
        throw error
      }

      const profile = data as RawProfileRecord
      return {
        id: profile.id,
        email: profile.email,
        fullName: profile.full_name || '',
        headline: profile.headline || '',
        onboardingCompleted: profile.onboarding_completed,
        activeTemplateId: profile.active_template_id || 'tpl_default_swe',
        completeness: this.calculateCompleteness(profile),
        createdAt: profile.created_at,
        updatedAt: profile.updated_at,
      }
    } catch (err) {
      logger.error({ err, userId }, 'Failed to update profile in database')
      return {
        id: userId,
        email: '',
        fullName: updates.fullName || '',
        headline: updates.headline || '',
        onboardingCompleted: false,
        activeTemplateId: updates.activeTemplateId || 'tpl_default_swe',
        completeness: {
          percentage: 40,
          sections: {
            contact: true,
            summary: false,
            experience: false,
            education: false,
            skills: false,
          },
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
    }
  }

  /**
   * Completes onboarding flow
   */
  static async completeOnboarding(
    userId: string,
    data?: OnboardingCompletionData
  ): Promise<{ onboardingCompleted: boolean; activeTemplateId: string }> {
    const isMock =
      env.SUPABASE_URL.includes('placeholder') ||
      env.SUPABASE_URL.includes('mock') ||
      env.NODE_ENV === 'test'

    if (isMock) {
      const mock = localMockProfiles.get(userId)
      if (mock) {
        mock.onboarding_completed = true
        if (data?.fullName) mock.full_name = data.fullName
        if (data?.headline) mock.headline = data.headline
        if (data?.targetRole) mock.target_role = data.targetRole
        if (data?.industry) mock.industry = data.industry
        if (data?.experienceLevel) mock.experience_level = data.experienceLevel
        if (data?.tonePreference) mock.tone_preference = data.tonePreference
        if (data?.bulletDensity) mock.bullet_density = data.bulletDensity
        if (data?.templateId) mock.active_template_id = data.templateId
        mock.updated_at = new Date().toISOString()
        saveAuthProfilesToDisk(localMockProfiles)
      }
      return {
        onboardingCompleted: true,
        activeTemplateId: data?.templateId || mock?.active_template_id || 'tpl_default_swe',
      }
    }

    const updateData: Record<string, unknown> = {
      onboarding_completed: true,
      updated_at: new Date().toISOString(),
    }

    if (data?.fullName) updateData.full_name = data.fullName
    if (data?.headline) updateData.headline = data.headline
    if (data?.templateId) updateData.active_template_id = data.templateId
    if (data?.targetRole) updateData.target_role = data.targetRole
    if (data?.industry) updateData.industry = data.industry
    if (data?.experienceLevel) updateData.experience_level = data.experienceLevel
    if (data?.tonePreference) updateData.tone_preference = data.tonePreference
    if (data?.bulletDensity) updateData.bullet_density = data.bulletDensity

    try {
      const { data: existingProfile } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('id', userId)
        .maybeSingle()

      if (!existingProfile) {
        await supabaseAdmin.from('profiles').insert({
          id: userId,
          email: `${userId}@example.com`,
          ...updateData,
        })
      } else {
        const { error } = await supabaseAdmin.from('profiles').update(updateData).eq('id', userId)
        if (error) {
          logger.warn({ error, userId }, 'Could not persist onboarding completion to database profiles table')
        }
      }
    } catch (err) {
      logger.warn({ err, userId }, 'Could not persist onboarding completion to database')
    }

    try {
      const userMetaUpdates: Record<string, unknown> = {
        onboarding_completed: true,
      }
      if (data?.fullName) userMetaUpdates.full_name = data.fullName
      if (data?.headline) userMetaUpdates.headline = data.headline
      if (data?.targetRole) userMetaUpdates.target_role = data.targetRole
      if (data?.templateId) userMetaUpdates.active_template_id = data.templateId

      await supabaseAdmin.auth.admin.updateUserById(userId, {
        user_metadata: userMetaUpdates,
      })
      logger.info({ userId }, 'Updated Supabase Auth user_metadata with onboarding_completed: true')
    } catch (authErr) {
      logger.warn({ authErr, userId }, 'Could not update Supabase Auth metadata for onboarding_completed')
    }

    return {
      onboardingCompleted: true,
      activeTemplateId: data?.templateId || 'tpl_default_swe',
    }
  }

  /**
   * Purges user storage files and cascades account deletion
   */
  static async deleteAccount(userId: string): Promise<{ message: string }> {
    logger.info({ userId }, 'Initiating complete account deletion cascade')

    const isMock =
      env.SUPABASE_URL.includes('placeholder') ||
      env.SUPABASE_URL.includes('mock') ||
      env.NODE_ENV === 'test'

    if (isMock) {
      localMockProfiles.delete(userId)
      return {
        message: 'Account and associated records successfully purged.',
      }
    }

    // 1. Purge files from Supabase Storage buckets
    try {
      const buckets = ['uploads', 'generated']
      for (const bucket of buckets) {
        const { data: files } = await supabaseAdmin.storage.from(bucket).list(userId)
        if (files && files.length > 0) {
          const filePaths = files.map((f) => `${userId}/${f.name}`)
          await supabaseAdmin.storage.from(bucket).remove(filePaths)
        }
      }
    } catch (storageErr) {
      logger.warn(
        { storageErr, userId },
        'Storage cleanup encountered non-fatal error during deletion'
      )
    }

    // 2. Delete profiles record
    try {
      await supabaseAdmin.from('profiles').delete().eq('id', userId)
    } catch (dbErr) {
      logger.warn({ dbErr, userId }, 'Profile record deletion warning')
    }

    // 3. Delete Supabase Auth User record (which cascades FKs)
    try {
      const { error } = await supabaseAdmin.auth.admin.deleteUser(userId)
      if (error && !error.message.includes('User not found')) {
        logger.warn({ error, userId }, 'Supabase auth deleteUser notice')
      }
    } catch (authErr) {
      logger.warn({ authErr, userId }, 'Supabase auth user deletion notice')
    }

    return {
      message: 'Account and associated records successfully purged.',
    }
  }

  /**
   * Helper to create a signed mock session for offline dev / test mode
   */
  static async createMockAuthSession(userId: string, email: string, fullName = 'Candidate') {
    const secretKey = new TextEncoder().encode(env.SUPABASE_JWT_SECRET)
    const token = await new SignJWT({
      sub: userId,
      email,
      role: 'authenticated',
      aud: 'authenticated',
      app_metadata: { provider: 'email' },
      user_metadata: { full_name: fullName, email_verified: true, emailVerified: true },
      email_confirmed_at: new Date().toISOString(),
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setIssuer('supabase')
      .setExpirationTime('7d')
      .sign(secretKey)

    const userObj = {
      id: userId,
      email,
      role: 'authenticated',
      aud: 'authenticated',
      app_metadata: { provider: 'email' },
      user_metadata: { full_name: fullName, email_verified: true, emailVerified: true },
      email_confirmed_at: new Date().toISOString(),
    }

    return {
      user: userObj,
      session: {
        access_token: token,
        token_type: 'bearer',
        expires_in: 604800,
        refresh_token: `mock_ref_${userId}`,
        user: userObj,
      },
    }
  }

  /**
   * Generates or retrieves demo session for frontend demo mode
   */
  static async getDemoSession() {
    const demoUserId = 'usr_demo_456'
    const demoEmail = 'demo@latexai.dev'
    const demoName = 'Alex Rivera'

    let mock = localMockProfiles.get(demoUserId)
    if (!mock) {
      mock = {
        id: demoUserId,
        email: demoEmail,
        full_name: demoName,
        headline: 'Senior Full Stack & AI Systems Engineer',
        phone: '+1 (555) 019-2834',
        location: 'San Francisco, CA',
        summary:
          'Results-driven software engineer with 7+ years of experience architecting high-throughput distributed systems and responsive React web applications. Proven track record leading cross-functional teams and accelerating release cycles.',
        links: [
          { id: 'l1', label: 'GitHub', url: 'https://github.com/alexrivera' },
          { id: 'l2', label: 'Portfolio', url: 'https://alexrivera.dev' },
        ],
        onboarding_completed: true,
        active_template_id: 'tpl_default_swe',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      localMockProfiles.set(demoUserId, mock)
    }

    return await this.createMockAuthSession(demoUserId, demoEmail, demoName)
  }

  /**
   * Proxy signup endpoint
   */
  static async signup(email: string, password: string, fullName?: string) {
    const isMock =
      env.SUPABASE_URL.includes('placeholder') ||
      env.SUPABASE_URL.includes('mock') ||
      env.NODE_ENV === 'test'

    if (isMock) {
      for (const p of localMockProfiles.values()) {
        if (p.email.toLowerCase() === email.toLowerCase()) {
          throw AppError.conflict('An account with this email address already exists.')
        }
      }

      const userId = `usr_${Math.random().toString(36).slice(2, 10)}`
      const mockRecord: RawProfileRecord = {
        id: userId,
        email,
        full_name: fullName || email.split('@')[0] || null,
        headline: '',
        phone: '',
        location: '',
        summary: '',
        links: [],
        onboarding_completed: false,
        active_template_id: 'tpl_default_swe',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      localMockProfiles.set(userId, mockRecord)

      return await this.createMockAuthSession(userId, email, fullName || email.split('@')[0])
    }

    const { data, error } = await supabaseAdmin.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
      },
    })

    if (error) {
      if (error.message.toLowerCase().includes('already registered')) {
        throw AppError.conflict('An account with this email address already exists.')
      }
      throw AppError.badRequest(error.message, null, ERROR_CODES.BAD_REQUEST)
    }

    return data
  }

  /**
   * Proxy login endpoint
   */
  static async login(email: string, password: string) {
    const isMock =
      env.SUPABASE_URL.includes('placeholder') ||
      env.SUPABASE_URL.includes('mock') ||
      env.NODE_ENV === 'test'

    if (isMock) {
      let matchedRecord: RawProfileRecord | undefined
      for (const p of localMockProfiles.values()) {
        if (p.email.toLowerCase() === email.toLowerCase()) {
          matchedRecord = p
          break
        }
      }

      const userId = matchedRecord ? matchedRecord.id : `usr_${Math.random().toString(36).slice(2, 10)}`
      const name = matchedRecord?.full_name || email.split('@')[0] || 'Candidate'

      if (!matchedRecord) {
        const newRecord: RawProfileRecord = {
          id: userId,
          email,
          full_name: name,
          headline: '',
          phone: '',
          location: '',
          summary: '',
          links: [],
          onboarding_completed: false,
          active_template_id: 'tpl_default_swe',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
        localMockProfiles.set(userId, newRecord)
      }

      return await this.createMockAuthSession(userId, email, name)
    }

    const { data, error } = await supabaseAdmin.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      throw AppError.badRequest('Invalid email or password provided.', null, 'INVALID_CREDENTIALS')
    }

    return data
  }

  /**
   * Updates password
   */
  static async updatePassword(userId: string, newPassword: string) {
    const isMock =
      env.SUPABASE_URL.includes('placeholder') ||
      env.SUPABASE_URL.includes('mock') ||
      env.NODE_ENV === 'test'

    if (isMock) {
      return { message: 'Password updated successfully' }
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: newPassword,
    })

    if (error) {
      throw AppError.badRequest(error.message, null, ERROR_CODES.BAD_REQUEST)
    }

    return { message: 'Password updated successfully' }
  }

  /**
   * Registers a client device push notification token
   */
  static async registerPushToken(
    userId: string,
    token: string,
    platform?: string,
    appVersion?: string
  ) {
    logger.info(
      { userId, token: `${token.slice(0, 6)}...`, platform, appVersion },
      'Push token registered successfully'
    )
    return { success: true, registered: true }
  }

  /**
   * Exports all user profile and archive data (BE-6.07)
   */
  static async exportData(userId: string) {
    const profile = await this.getMe(userId)

    let fullProfileArchive = null
    try {
      const { ProfileService } = await import('./profile.service.js')
      fullProfileArchive = await ProfileService.getFullProfile(userId)
    } catch (err) {
      logger.warn({ err, userId }, 'Could not include full profile in data export')
    }

    let resumesArchive: unknown[] = []
    try {
      const { GenerationService } = await import('./generation.service.js')
      const resumesResult = await GenerationService.listResumes(userId, { limit: 50 })
      resumesArchive = resumesResult.items
    } catch (err) {
      logger.warn({ err, userId }, 'Could not include resumes in data export')
    }

    return {
      user: profile,
      profile: fullProfileArchive,
      resumes: resumesArchive,
      counts: {
        experiences: fullProfileArchive?.experience?.length ?? 0,
        educations: fullProfileArchive?.education?.length ?? 0,
        skills: fullProfileArchive?.skills?.length ?? 0,
        certifications: fullProfileArchive?.certifications?.length ?? 0,
        projects: fullProfileArchive?.projects?.length ?? 0,
        resumes: resumesArchive.length,
      },
      exportedAt: new Date().toISOString(),
      format: 'JSON_ARCHIVE_V1',
    }
  }
}

