/**
 * Supabase Storage Service for generated PDFs and LaTeX sources.
 * Complies with task BE-3.26.
 */

import { supabaseAdmin } from '../db/supabase.js'
import { env } from '../config/env.js'
import { logger } from '../utils/logger.js'

export const GENERATED_BUCKET = 'generated'

export interface StoredGeneratedFile {
  bucket: string
  path: string
  signedUrl: string
  expiresAt: string
}

// In-memory mock storage for testing & offline mode
const mockStorage = new Map<string, { buffer: Buffer; contentType: string }>()

function isMockMode(): boolean {
  return (
    env.SUPABASE_URL.includes('placeholder') ||
    env.SUPABASE_URL.includes('mock') ||
    env.NODE_ENV === 'test'
  )
}

export class StorageService {
  /**
   * Uploads a generated file (PDF or .tex) to the private `generated` bucket.
   */
  static async uploadGeneratedDocument(
    userId: string,
    fileId: string,
    extension: 'pdf' | 'tex',
    content: Buffer | string,
    mimeType: string
  ): Promise<StoredGeneratedFile> {
    const filePath = `${userId}/${fileId}.${extension}`
    const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8')

    if (isMockMode()) {
      mockStorage.set(`${GENERATED_BUCKET}:${filePath}`, {
        buffer,
        contentType: mimeType,
      })
      const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString()
      return {
        bucket: GENERATED_BUCKET,
        path: filePath,
        signedUrl: `https://mock-supabase.test/storage/v1/object/sign/${GENERATED_BUCKET}/${filePath}?token=mock_signed_url_token`,
        expiresAt,
      }
    }

    const { error: uploadError } = await supabaseAdmin.storage
      .from(GENERATED_BUCKET)
      .upload(filePath, buffer, {
        contentType: mimeType,
        upsert: true,
      })

    if (uploadError) {
      logger.error(
        { uploadError, filePath },
        'Failed to upload generated document to Supabase Storage'
      )
      throw new Error(`Failed to store generated file: ${uploadError.message}`)
    }

    const signedUrl = await this.getSignedDownloadUrl(userId, fileId, extension, 3600)
    const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString()

    return {
      bucket: GENERATED_BUCKET,
      path: filePath,
      signedUrl,
      expiresAt,
    }
  }

  /**
   * Generates a short-lived signed URL for downloading a generated file.
   */
  static async getSignedDownloadUrl(
    userId: string,
    fileId: string,
    extension: 'pdf' | 'tex',
    expiresInSeconds = 3600
  ): Promise<string> {
    const filePath = `${userId}/${fileId}.${extension}`

    if (isMockMode()) {
      return `https://mock-supabase.test/storage/v1/object/sign/${GENERATED_BUCKET}/${filePath}?token=mock_signed_url_token`
    }

    const { data, error } = await supabaseAdmin.storage
      .from(GENERATED_BUCKET)
      .createSignedUrl(filePath, expiresInSeconds)

    if (error || !data?.signedUrl) {
      logger.error({ error, filePath }, 'Failed to generate signed download URL')
      throw new Error(`Failed to generate signed URL: ${error?.message || 'Unknown error'}`)
    }

    return data.signedUrl
  }

  /**
   * Downloads a generated file (PDF or .tex) from private storage as a Buffer.
   */
  static async downloadGeneratedDocument(
    userId: string,
    fileId: string,
    extension: 'pdf' | 'tex'
  ): Promise<Buffer | null> {
    const filePath = `${userId}/${fileId}.${extension}`

    if (isMockMode()) {
      const entry = mockStorage.get(`${GENERATED_BUCKET}:${filePath}`)
      return entry?.buffer || null
    }

    try {
      const { data, error } = await supabaseAdmin.storage
        .from(GENERATED_BUCKET)
        .download(filePath)

      if (error || !data) {
        return null
      }

      const arrayBuffer = await data.arrayBuffer()
      return Buffer.from(arrayBuffer)
    } catch (err) {
      logger.warn({ err, userId, fileId, extension }, 'Failed to download generated file from storage')
      return null
    }
  }

  /**
   * Removes generated files associated with a generation or preview.
   */
  static async deleteGeneratedFiles(userId: string, fileIds: string[]): Promise<void> {
    const pathsToDelete: string[] = []
    for (const id of fileIds) {
      pathsToDelete.push(`${userId}/${id}.pdf`)
      pathsToDelete.push(`${userId}/${id}.tex`)
    }

    if (isMockMode()) {
      for (const p of pathsToDelete) {
        mockStorage.delete(`${GENERATED_BUCKET}:${p}`)
      }
      return
    }

    try {
      await supabaseAdmin.storage.from(GENERATED_BUCKET).remove(pathsToDelete)
    } catch (err) {
      logger.warn({ err, userId, pathsToDelete }, 'Error during storage file deletion')
    }
  }

  /**
   * Clears mock storage (useful in tests)
   */
  static clearMockStorage(): void {
    mockStorage.clear()
  }

  /**
   * Purges orphaned storage files that have no matching record (BE-6.08).
   */
  static async purgeOrphanedFiles(validFileIds: Set<string>): Promise<number> {
    let purgedCount = 0

    if (isMockMode()) {
      for (const [key] of mockStorage.entries()) {
        const match = key.match(/:([^/]+)\/([^.]+)\.(pdf|tex)$/)
        if (match) {
          const fileId = match[2]
          if (fileId && !validFileIds.has(fileId)) {
            mockStorage.delete(key)
            purgedCount++
          }
        }
      }
      return purgedCount
    }

    try {
      const { data: files } = await supabaseAdmin.storage.from(GENERATED_BUCKET).list()
      if (files && files.length > 0) {
        const toDelete: string[] = []
        for (const file of files) {
          const id = file.name.replace(/\.(pdf|tex)$/, '')
          if (!validFileIds.has(id)) {
            toDelete.push(file.name)
          }
        }
        if (toDelete.length > 0) {
          await supabaseAdmin.storage.from(GENERATED_BUCKET).remove(toDelete)
          purgedCount = toDelete.length
        }
      }
    } catch (err) {
      logger.warn({ err }, 'Error during orphaned storage file purge')
    }

    return purgedCount
  }
}
