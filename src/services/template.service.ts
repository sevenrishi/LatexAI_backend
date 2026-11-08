/**
 * Template Management Service.
 * Complies with tasks BE-3.05 - BE-3.11.
 */

import { v4 as uuidv4 } from 'uuid'
import { supabaseAdmin } from '../db/supabase.js'
import { env } from '../config/env.js'
import { AppError, ERROR_CODES } from '../utils/errors.js'
import { logger } from '../utils/logger.js'
import { lintTemplate } from '../latex/linter.js'
import {
  extractPlaceholders,
  PLACEHOLDER_DESCRIPTIONS,
  ALLOWED_PLACEHOLDERS,
} from '../latex/placeholders.js'
import { renderTemplate } from '../latex/templateRenderer.js'
import { compileLatex } from '../latex/compilerClient.js'
import { ProfileService, type FullProfile } from './profile.service.js'
import { SAMPLE_PROFILE } from '../latex/dataAdapter.js'
import {
  DEFAULT_SWE_LATEX_CODE,
  DEFAULT_SWE_TEMPLATE_ID,
  DEFAULT_SWE_TEMPLATE_NAME,
  DEFAULT_SWE_TEMPLATE_DESCRIPTION,
} from '../latex/templates/defaultSwe.js'
import {
  MINIMAL_TECH_LATEX_CODE,
  MINIMAL_TECH_TEMPLATE_ID,
  MINIMAL_TECH_TEMPLATE_NAME,
  MINIMAL_TECH_TEMPLATE_DESCRIPTION,
} from '../latex/templates/minimalTech.js'

export interface TemplateRecord {
  id: string
  user_id: string | null
  name: string
  description: string | null
  category: string
  latex_code: string
  is_system: boolean
  thumbnail_url: string | null
  created_at: string
  updated_at: string
}

export interface TemplateListItem {
  id: string
  name: string
  description: string | null
  category: string
  isSystem: boolean
  isActive: boolean
  thumbnailUrl: string | null
  createdAt: string
  updatedAt: string
}

export interface TemplateDetail extends TemplateListItem {
  latexCode: string
  placeholders: string[]
}

function isMockMode(): boolean {
  return (
    env.SUPABASE_URL.includes('placeholder') ||
    env.SUPABASE_URL.includes('mock') ||
    env.NODE_ENV === 'test'
  )
}

// In-memory templates for mock & test mode
const mockTemplates = new Map<string, TemplateRecord>()
const mockUserActiveTemplate = new Map<string, string>()

function initMockTemplates() {
  if (mockTemplates.size === 0) {
    const now = new Date().toISOString()
    mockTemplates.set(DEFAULT_SWE_TEMPLATE_ID, {
      id: DEFAULT_SWE_TEMPLATE_ID,
      user_id: null,
      name: DEFAULT_SWE_TEMPLATE_NAME,
      description: DEFAULT_SWE_TEMPLATE_DESCRIPTION,
      category: 'engineering',
      latex_code: DEFAULT_SWE_LATEX_CODE,
      is_system: true,
      thumbnail_url: null,
      created_at: now,
      updated_at: now,
    })
    mockTemplates.set(MINIMAL_TECH_TEMPLATE_ID, {
      id: MINIMAL_TECH_TEMPLATE_ID,
      user_id: null,
      name: MINIMAL_TECH_TEMPLATE_NAME,
      description: MINIMAL_TECH_TEMPLATE_DESCRIPTION,
      category: 'engineering',
      latex_code: MINIMAL_TECH_LATEX_CODE,
      is_system: true,
      thumbnail_url: null,
      created_at: now,
      updated_at: now,
    })
  }
}

initMockTemplates()

export class TemplateService {
  /**
   * Resets mock templates to seed state (useful in tests).
   */
  static resetMockStore(): void {
    mockTemplates.clear()
    mockUserActiveTemplate.clear()
    initMockTemplates()
  }

  /**
   * Retrieves active template ID for a user.
   */
  static async getUserActiveTemplateId(userId: string): Promise<string> {
    if (isMockMode()) {
      return mockUserActiveTemplate.get(userId) || DEFAULT_SWE_TEMPLATE_ID
    }

    try {
      const { data } = await supabaseAdmin
        .from('profiles')
        .select('active_template_id')
        .eq('id', userId)
        .maybeSingle()
      return data?.active_template_id || DEFAULT_SWE_TEMPLATE_ID
    } catch {
      return DEFAULT_SWE_TEMPLATE_ID
    }
  }

  /**
   * Lists all system templates and user's custom templates (BE-3.05).
   */
  static async listTemplates(userId: string): Promise<TemplateListItem[]> {
    const activeTemplateId = await this.getUserActiveTemplateId(userId)

    if (isMockMode()) {
      const templates = Array.from(mockTemplates.values()).filter(
        (t) => t.is_system || t.user_id === userId
      )

      return templates.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        category: t.category,
        isSystem: t.is_system,
        isActive: t.id === activeTemplateId,
        thumbnailUrl: t.thumbnail_url,
        createdAt: t.created_at,
        updatedAt: t.updated_at,
      }))
    }

    const { data, error } = await supabaseAdmin
      .from('templates')
      .select(
        'id, name, description, category, is_system, thumbnail_url, created_at, updated_at, user_id'
      )
      .or(`is_system.eq.true,user_id.eq.${userId}`)
      .order('is_system', { ascending: false })
      .order('created_at', { ascending: true })

    if (error) {
      logger.error({ error, userId }, 'Failed to list templates from database')
      throw AppError.internal('Failed to retrieve templates list.')
    }

    return (data || []).map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      category: t.category,
      isSystem: t.is_system,
      isActive: t.id === activeTemplateId,
      thumbnailUrl: t.thumbnail_url,
      createdAt: t.created_at,
      updatedAt: t.updated_at,
    }))
  }

  /**
   * Retrieves single template by ID if accessible (BE-3.05).
   */
  static async getTemplateById(templateId: string, userId: string): Promise<TemplateDetail> {
    const activeTemplateId = await this.getUserActiveTemplateId(userId)

    if (isMockMode()) {
      const t = mockTemplates.get(templateId)
      if (!t || (!t.is_system && t.user_id !== userId)) {
        throw new AppError(404, 'TEMPLATE_NOT_FOUND', `Template "${templateId}" not found.`)
      }

      return {
        id: t.id,
        name: t.name,
        description: t.description,
        category: t.category,
        latexCode: t.latex_code,
        isSystem: t.is_system,
        isActive: t.id === activeTemplateId,
        thumbnailUrl: t.thumbnail_url,
        placeholders: extractPlaceholders(t.latex_code),
        createdAt: t.created_at,
        updatedAt: t.updated_at,
      }
    }

    const { data, error } = await supabaseAdmin
      .from('templates')
      .select('*')
      .eq('id', templateId)
      .maybeSingle()

    if (error) {
      logger.error({ error, templateId }, 'Database error getting template by ID')
      throw AppError.internal('Error fetching template.')
    }

    if (!data || (!data.is_system && data.user_id !== userId)) {
      throw new AppError(404, 'TEMPLATE_NOT_FOUND', `Template "${templateId}" not found.`)
    }

    return {
      id: data.id,
      name: data.name,
      description: data.description,
      category: data.category,
      latexCode: data.latex_code,
      isSystem: data.is_system,
      isActive: data.id === activeTemplateId,
      thumbnailUrl: data.thumbnail_url,
      placeholders: extractPlaceholders(data.latex_code),
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    }
  }

  /**
   * Creates a new custom template with pre-save security and syntax linting (BE-3.06).
   */
  static async createTemplate(
    userId: string,
    payload: {
      name: string
      description?: string
      category?: string
      latexCode: string
    }
  ): Promise<TemplateDetail> {
    // 1. Lint LaTeX template
    const lintResult = lintTemplate(payload.latexCode)
    if (!lintResult.valid) {
      throw AppError.badRequest('Template validation failed', {
        errors: lintResult.errors,
      })
    }

    const templateId = `tpl_${uuidv4().replace(/-/g, '').slice(0, 12)}`
    const now = new Date().toISOString()

    const newRecord: TemplateRecord = {
      id: templateId,
      user_id: userId,
      name: payload.name.trim(),
      description: payload.description?.trim() || null,
      category: payload.category?.trim() || 'custom',
      latex_code: payload.latexCode,
      is_system: false,
      thumbnail_url: null,
      created_at: now,
      updated_at: now,
    }

    if (isMockMode()) {
      mockTemplates.set(templateId, newRecord)
      return {
        id: newRecord.id,
        name: newRecord.name,
        description: newRecord.description,
        category: newRecord.category,
        latexCode: newRecord.latex_code,
        isSystem: false,
        isActive: false,
        thumbnailUrl: null,
        placeholders: lintResult.placeholdersFound,
        createdAt: now,
        updatedAt: now,
      }
    }

    const { data, error } = await supabaseAdmin
      .from('templates')
      .insert({
        id: templateId,
        user_id: userId,
        name: newRecord.name,
        description: newRecord.description,
        category: newRecord.category,
        latex_code: newRecord.latex_code,
        is_system: false,
      })
      .select()
      .single()

    if (error) {
      logger.error({ error, userId }, 'Failed to insert template to database')
      throw AppError.internal('Failed to create custom template.')
    }

    return {
      id: data.id,
      name: data.name,
      description: data.description,
      category: data.category,
      latexCode: data.latex_code,
      isSystem: false,
      isActive: false,
      thumbnailUrl: data.thumbnail_url,
      placeholders: extractPlaceholders(data.latex_code),
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    }
  }

  /**
   * Updates an existing custom template (BE-3.07).
   */
  static async updateTemplate(
    templateId: string,
    userId: string,
    updates: {
      name?: string
      description?: string
      category?: string
      latexCode?: string
    }
  ): Promise<TemplateDetail> {
    const existing = await this.getTemplateById(templateId, userId)

    if (existing.isSystem) {
      throw new AppError(
        403,
        ERROR_CODES.FORBIDDEN,
        'System templates cannot be modified. Duplicate this template to customize it.'
      )
    }

    if (updates.latexCode !== undefined) {
      const lintResult = lintTemplate(updates.latexCode)
      if (!lintResult.valid) {
        throw AppError.badRequest('Template validation failed', {
          errors: lintResult.errors,
        })
      }
    }

    const now = new Date().toISOString()

    if (isMockMode()) {
      const current = mockTemplates.get(templateId)!
      const updated: TemplateRecord = {
        ...current,
        name: updates.name !== undefined ? updates.name.trim() : current.name,
        description:
          updates.description !== undefined ? updates.description.trim() : current.description,
        category: updates.category !== undefined ? updates.category.trim() : current.category,
        latex_code: updates.latexCode !== undefined ? updates.latexCode : current.latex_code,
        updated_at: now,
      }
      mockTemplates.set(templateId, updated)

      return {
        id: updated.id,
        name: updated.name,
        description: updated.description,
        category: updated.category,
        latexCode: updated.latex_code,
        isSystem: false,
        isActive: existing.isActive,
        thumbnailUrl: updated.thumbnail_url,
        placeholders: extractPlaceholders(updated.latex_code),
        createdAt: updated.created_at,
        updatedAt: now,
      }
    }

    const updateFields: Record<string, unknown> = {
      updated_at: now,
    }
    if (updates.name !== undefined) updateFields.name = updates.name.trim()
    if (updates.description !== undefined) updateFields.description = updates.description.trim()
    if (updates.category !== undefined) updateFields.category = updates.category.trim()
    if (updates.latexCode !== undefined) updateFields.latex_code = updates.latexCode

    const { data, error } = await supabaseAdmin
      .from('templates')
      .update(updateFields)
      .eq('id', templateId)
      .eq('user_id', userId)
      .select()
      .single()

    if (error) {
      logger.error({ error, templateId }, 'Database error updating template')
      throw AppError.internal('Failed to update template.')
    }

    return {
      id: data.id,
      name: data.name,
      description: data.description,
      category: data.category,
      latexCode: data.latex_code,
      isSystem: false,
      isActive: existing.isActive,
      thumbnailUrl: data.thumbnail_url,
      placeholders: extractPlaceholders(data.latex_code),
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    }
  }

  /**
   * Deletes a custom template with fallback activation rule (BE-3.07).
   */
  static async deleteTemplate(
    templateId: string,
    userId: string
  ): Promise<{ deleted: boolean; fallbackActivated: boolean; activeTemplateId: string }> {
    const existing = await this.getTemplateById(templateId, userId)

    if (existing.isSystem) {
      throw new AppError(403, ERROR_CODES.FORBIDDEN, 'System templates cannot be deleted.')
    }

    let fallbackActivated = false
    let activeTemplateId = existing.isActive ? DEFAULT_SWE_TEMPLATE_ID : ''

    if (existing.isActive) {
      // Revert user active template to default
      fallbackActivated = true
      activeTemplateId = DEFAULT_SWE_TEMPLATE_ID
      await this.activateTemplate(DEFAULT_SWE_TEMPLATE_ID, userId)
    }

    if (isMockMode()) {
      mockTemplates.delete(templateId)
      return {
        deleted: true,
        fallbackActivated,
        activeTemplateId,
      }
    }

    const { error } = await supabaseAdmin
      .from('templates')
      .delete()
      .eq('id', templateId)
      .eq('user_id', userId)

    if (error) {
      logger.error({ error, templateId }, 'Database error deleting template')
      throw AppError.internal('Failed to delete template.')
    }

    return {
      deleted: true,
      fallbackActivated,
      activeTemplateId,
    }
  }

  /**
   * Duplicates an existing template into a new custom template for user (BE-3.08).
   */
  static async duplicateTemplate(
    templateId: string,
    userId: string,
    customName?: string
  ): Promise<TemplateDetail> {
    const source = await this.getTemplateById(templateId, userId)
    const newName = customName?.trim() || `Copy of ${source.name}`

    return this.createTemplate(userId, {
      name: newName,
      description: source.description || undefined,
      category: source.category,
      latexCode: source.latexCode,
    })
  }

  /**
   * Sets active template for the user (BE-3.09).
   */
  static async activateTemplate(
    templateId: string,
    userId: string
  ): Promise<{ activeTemplateId: string }> {
    // Validate template exists and accessible
    await this.getTemplateById(templateId, userId)

    if (isMockMode()) {
      mockUserActiveTemplate.set(userId, templateId)
      return { activeTemplateId: templateId }
    }

    const { error } = await supabaseAdmin
      .from('profiles')
      .update({ active_template_id: templateId, updated_at: new Date().toISOString() })
      .eq('id', userId)

    if (error) {
      logger.error({ error, templateId, userId }, 'Failed to set active template in profile')
      throw AppError.internal('Failed to activate template.')
    }

    return { activeTemplateId: templateId }
  }

  /**
   * Renders and compiles sample or profile data into temporary PDF preview (BE-3.10).
   */
  static async previewTemplate(
    templateId: string,
    userId: string,
    options?: {
      profileData?: Partial<FullProfile>
      latexOverride?: string
    }
  ): Promise<{
    pdfBase64: string
    pageCount: number
    renderedLatex: string
    durationMs: number
  }> {
    let latexCode = options?.latexOverride

    if (!latexCode) {
      const template = await this.getTemplateById(templateId, userId)
      latexCode = template.latexCode
    }

    // Determine profile data for rendering
    let profileToRender: Partial<FullProfile> | null = null
    if (options?.profileData) {
      profileToRender = options.profileData
    } else {
      try {
        const fullProfile = await ProfileService.getFullProfile(userId)
        // If profile has experience or education, use it; otherwise fallback to sample
        if (
          (fullProfile.experience && fullProfile.experience.length > 0) ||
          (fullProfile.education && fullProfile.education.length > 0)
        ) {
          profileToRender = fullProfile
        } else {
          profileToRender = SAMPLE_PROFILE
        }
      } catch {
        profileToRender = SAMPLE_PROFILE
      }
    }

    // Render template placeholders
    const renderedLatex = renderTemplate(latexCode, profileToRender)

    // Compile rendered LaTeX to PDF via compiler service client
    const compileResult = await compileLatex(renderedLatex)

    if (!compileResult.success) {
      throw new AppError(422, 'COMPILER_ERROR', 'LaTeX preview compilation failed.', {
        errors: compileResult.errors,
        rawLog: compileResult.rawLog,
      })
    }

    return {
      pdfBase64: compileResult.pdfBuffer.toString('base64'),
      pageCount: compileResult.pageCount,
      renderedLatex,
      durationMs: compileResult.durationMs,
    }
  }

  /**
   * Retrieves placeholder details for template editor integration (BE-3.11).
   */
  static async getTemplatePlaceholders(
    templateId: string,
    userId: string
  ): Promise<{
    templateId: string
    placeholders: Array<{
      placeholder: string
      description: string
      isSupported: boolean
    }>
  }> {
    const template = await this.getTemplateById(templateId, userId)
    const found = extractPlaceholders(template.latexCode)
    const allowedSet = new Set<string>(ALLOWED_PLACEHOLDERS)

    const placeholders = found.map((ph) => ({
      placeholder: ph,
      description:
        PLACEHOLDER_DESCRIPTIONS[ph as keyof typeof PLACEHOLDER_DESCRIPTIONS] ||
        'Custom template placeholder',
      isSupported: allowedSet.has(ph),
    }))

    return {
      templateId,
      placeholders,
    }
  }
}
