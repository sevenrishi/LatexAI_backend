import * as cheerio from 'cheerio'
import { AppError } from '../utils/errors.js'
import { normalizeJobText, MIN_JD_LENGTH } from './normalize.js'

export interface ExtractedJobContent {
  jobTitle?: string
  companyName?: string
  rawText: string
  extractedVia: 'jsonld' | 'html'
}

/**
 * Checks for known bot-walls, CAPTCHAs, and login gates.
 */
export function detectBotWall(html: string, statusCode = 200): boolean {
  if (statusCode === 403 || statusCode === 429) {
    return true
  }

  const lower = html.toLowerCase()

  const botWallSignatures = [
    'cf-browser-verification',
    'cf-ray',
    'checking your browser before accessing',
    'attention required! | cloudflare',
    'cloudflare ray id',
    'verify you are human',
    'press & hold',
    'px-captcha',
    'perimeterx',
    'datadome',
    'security check',
    'access to this page has been denied',
    'authwall',
    'join linkedin to view',
    'sign in to view this job',
    'please sign in or create an account',
    'enable javascript and cookies to continue',
  ]

  return botWallSignatures.some((sig) => lower.includes(sig))
}

/**
 * Strips HTML tags and formats lists into readable plain text with bullets.
 */
function htmlToPlainText($: cheerio.CheerioAPI, element: ReturnType<cheerio.CheerioAPI>): string {
  // Replace line breaks and paragraphs with distinct newlines
  element.find('br').replaceWith('\n')
  element.find('p').each((_, el) => {
    $(el).append('\n\n')
  })
  element.find('li').each((_, el) => {
    $(el).prepend('\n• ').append('\n')
  })
  element.find('h1, h2, h3, h4, h5, h6').each((_, el) => {
    $(el).prepend('\n\n').append('\n')
  })

  return element.text()
}

/**
 * Searches JSON-LD data structures recursively for a JobPosting entity.
 */
function findJobPostingInJsonLd(obj: unknown): Record<string, unknown> | null {
  if (!obj || typeof obj !== 'object') return null

  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = findJobPostingInJsonLd(item)
      if (found) return found
    }
    return null
  }

  const record = obj as Record<string, unknown>
  const type = record['@type']
  if (type === 'JobPosting' || (Array.isArray(type) && type.includes('JobPosting'))) {
    return record
  }

  if (record['@graph'] && Array.isArray(record['@graph'])) {
    return findJobPostingInJsonLd(record['@graph'])
  }

  return null
}

/**
 * Extracts job description from static HTML or JSON-LD.
 */
export function extractJobFromHtml(html: string, statusCode = 200): ExtractedJobContent {
  if (detectBotWall(html, statusCode)) {
    throw new AppError(
      400,
      'URL_BLOCKED',
      'This job posting URL is protected by anti-bot verification or a login wall. Please copy and paste the job description text directly.'
    )
  }

  const $ = cheerio.load(html)

  // 1. Try JSON-LD extraction first
  const jsonLdScripts = $('script[type="application/ld+json"]').toArray()
  for (const script of jsonLdScripts) {
    try {
      const content = $(script).html()
      if (!content) continue
      const parsed = JSON.parse(content)
      const jobPosting = findJobPostingInJsonLd(parsed)

      if (jobPosting && typeof jobPosting.description === 'string') {
        const desc$ = cheerio.load(jobPosting.description)
        const plainDesc = normalizeJobText(htmlToPlainText(desc$, desc$.root()))

        if (plainDesc.length >= MIN_JD_LENGTH) {
          const title = typeof jobPosting.title === 'string' ? jobPosting.title.trim() : undefined
          const org = jobPosting.hiringOrganization as Record<string, unknown> | undefined
          const companyName = org && typeof org.name === 'string' ? org.name.trim() : undefined

          return {
            jobTitle: title,
            companyName,
            rawText: plainDesc,
            extractedVia: 'jsonld',
          }
        }
      }
    } catch {
      // Ignore malformed JSON-LD script and continue
    }
  }

  // 2. Fallback to Cheerio semantic HTML parsing
  // Remove scripts, styles, navigational chrome, and common ads
  $(
    'script, style, noscript, nav, footer, header, svg, iframe, form, button, [role="navigation"], [role="banner"], [role="contentinfo"], .footer, .header, .ad, .advertisement'
  ).remove()

  // Extract candidate job title
  let jobTitle = $('h1').first().text().trim()
  if (!jobTitle) {
    const ogTitle = $('meta[property="og:title"]').attr('content')
    if (ogTitle) {
      jobTitle = ogTitle.split(/[-|–]/)[0]?.trim() || ''
    }
  }

  // Extract company name
  let companyName = $(
    '[itemprop="hiringOrganization"], .company-name, .employer-name, [data-company]'
  )
    .first()
    .text()
    .trim()
  if (!companyName) {
    companyName = $('meta[property="og:site_name"]').attr('content') || ''
  }

  // Target candidate main content containers
  const selectors = [
    '[itemtype*="JobPosting"]',
    '[data-automation="jobDescription"]',
    '#job-description',
    '.job-description',
    '#job-details',
    '.job-details',
    'article',
    'main',
    '[role="main"]',
    'body',
  ]

  let mainText = ''
  for (const selector of selectors) {
    const el = $(selector).first()
    if (el.length > 0) {
      const text = normalizeJobText(htmlToPlainText($, el))
      if (text.length >= MIN_JD_LENGTH) {
        mainText = text
        break
      }
    }
  }

  if (mainText.length < MIN_JD_LENGTH) {
    throw AppError.badRequest(
      'Could not extract sufficient job description text from the provided URL. Please copy and paste the text directly.',
      undefined,
      'URL_FETCH_FAILED'
    )
  }

  return {
    jobTitle: jobTitle || undefined,
    companyName: companyName || undefined,
    rawText: mainText,
    extractedVia: 'html',
  }
}
