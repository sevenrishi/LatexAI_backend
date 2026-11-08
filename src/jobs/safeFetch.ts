import dns from 'node:dns/promises'
import net from 'node:net'
import http from 'node:http'
import https from 'node:https'
import { URL } from 'node:url'
import { AppError } from '../utils/errors.js'

export const MAX_FETCH_SIZE_BYTES = 5 * 1024 * 1024 // 5 MB
export const FETCH_TIMEOUT_MS = 10000 // 10 seconds
export const MAX_REDIRECTS = 3

/**
 * Checks if an IPv4 address is in a private, loopback, link-local, or reserved range.
 */
export function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map((p) => parseInt(p, 10))
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return true
  }

  const [a, b] = parts as [number, number, number, number]

  // 0.0.0.0/8
  if (a === 0) return true
  // 10.0.0.0/8
  if (a === 10) return true
  // 100.64.0.0/10 (100.64.0.0 to 100.127.255.255)
  if (a === 100 && b >= 64 && b <= 127) return true
  // 127.0.0.0/8 (Loopback)
  if (a === 127) return true
  // 169.254.0.0/16 (Link-local / cloud metadata)
  if (a === 169 && b === 254) return true
  // 172.16.0.0/12 (172.16.0.0 to 172.31.255.255)
  if (a === 172 && b >= 16 && b <= 31) return true
  // 192.0.0.0/24, 192.0.2.0/24 (TEST-NET-1)
  if (a === 192 && b === 0) return true
  // 192.168.0.0/16 (Private)
  if (a === 192 && b === 168) return true
  // 198.18.0.0/15 (198.18.0.0 to 198.19.255.255)
  if (a === 198 && (b === 18 || b === 19)) return true
  // 198.51.100.0/24 (TEST-NET-2)
  if (a === 198 && b === 51) return true
  // 203.0.113.0/24 (TEST-NET-3)
  if (a === 203 && b === 0) return true
  // 224.0.0.0/4 (Multicast: 224-239)
  if (a >= 224 && a <= 239) return true
  // 240.0.0.0/4 (Reserved: 240-255)
  if (a >= 240) return true

  return false
}

/**
 * Checks if an IPv6 address is in a private, loopback, link-local, or reserved range.
 */
export function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase().trim()

  // Loopback & unspecified
  if (normalized === '::1' || normalized === '::') return true

  // IPv4 mapped: ::ffff:192.0.2.128 or ::ffff:7f00:1
  if (normalized.startsWith('::ffff:')) {
    const v4Part = normalized.replace('::ffff:', '')
    if (net.isIPv4(v4Part)) {
      return isPrivateIPv4(v4Part)
    }
    return true
  }

  // Unique local addresses (fc00::/7 -> fc00 to fdff)
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true

  // Link-local unicast (fe80::/10 -> fe80 to febf)
  if (/^fe[89ab]/i.test(normalized)) return true

  return false
}

/**
 * Validates that an IP address is public and safe to connect to.
 */
export function isSafeIP(ip: string): boolean {
  const version = net.isIP(ip)
  if (version === 4) {
    return !isPrivateIPv4(ip)
  }
  if (version === 6) {
    return !isPrivateIPv6(ip)
  }
  return false
}

/**
 * Validates URL schema and verifies that target hostname resolves exclusively to safe public IPs.
 */
export async function validateSafeUrl(rawUrl: string): Promise<URL> {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw AppError.badRequest('Invalid URL format', undefined, 'URL_FETCH_FAILED')
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw AppError.badRequest(
      `Unsupported protocol '${parsed.protocol}'. Only http: and https: are allowed.`,
      undefined,
      'URL_FETCH_FAILED'
    )
  }

  const hostname = parsed.hostname.toLowerCase()

  // Block obvious internal hosts immediately
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname === 'metadata.google.internal' ||
    hostname === '169.254.169.254'
  ) {
    throw AppError.badRequest(
      'Access to internal/private hosts is prohibited.',
      undefined,
      'URL_FETCH_FAILED'
    )
  }

  // If hostname is directly an IP literal
  if (net.isIP(hostname)) {
    if (!isSafeIP(hostname)) {
      throw AppError.badRequest(
        'Access to private or local IP addresses is prohibited.',
        undefined,
        'URL_FETCH_FAILED'
      )
    }
    return parsed
  }

  // Resolve hostname via DNS
  let records: Array<{ address: string; family: number }>
  try {
    records = await dns.lookup(hostname, { all: true })
  } catch (err: unknown) {
    throw AppError.badRequest(
      `Unable to resolve host '${hostname}': ${(err as Error).message}`,
      undefined,
      'URL_FETCH_FAILED'
    )
  }

  if (!records || records.length === 0) {
    throw AppError.badRequest(
      `DNS resolution returned no addresses for '${hostname}'`,
      undefined,
      'URL_FETCH_FAILED'
    )
  }

  // Verify all resolved IP addresses are safe public IPs
  for (const record of records) {
    if (!isSafeIP(record.address)) {
      throw AppError.badRequest(
        `Host '${hostname}' resolves to restricted IP address (${record.address}).`,
        undefined,
        'URL_FETCH_FAILED'
      )
    }
  }

  return parsed
}

export interface SafeFetchResult {
  url: string
  statusCode: number
  contentType: string
  body: string
}

/**
 * Performs an SSRF-safe HTTP GET fetch with redirect limits, timeout, and response body size cap.
 */
export async function safeFetchUrl(
  targetUrl: string,
  options: {
    maxRedirects?: number
    timeoutMs?: number
    maxSizeBytes?: number
  } = {}
): Promise<SafeFetchResult> {
  const maxRedirects = options.maxRedirects ?? MAX_REDIRECTS
  const timeoutMs = options.timeoutMs ?? FETCH_TIMEOUT_MS
  const maxSizeBytes = options.maxSizeBytes ?? MAX_FETCH_SIZE_BYTES

  let currentUrl = targetUrl
  let redirectsCount = 0

  while (redirectsCount <= maxRedirects) {
    const validUrl = await validateSafeUrl(currentUrl)

    const isHttps = validUrl.protocol === 'https:'
    const client = isHttps ? https : http

    const fetchResult = await new Promise<SafeFetchResult | { redirectUrl: string }>(
      (resolve, reject) => {
        const controller = new AbortController()
        const timer = setTimeout(() => {
          controller.abort()
          reject(
            AppError.badRequest(
              `Fetch timed out after ${timeoutMs}ms`,
              undefined,
              'URL_FETCH_FAILED'
            )
          )
        }, timeoutMs)

        const req = client.request(
          validUrl,
          {
            method: 'GET',
            signal: controller.signal,
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
              Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.9',
            },
          },
          (res) => {
            const statusCode = res.statusCode || 200

            // Handle redirects
            if ([301, 302, 303, 307, 308].includes(statusCode)) {
              clearTimeout(timer)
              const location = res.headers.location
              if (!location) {
                reject(
                  AppError.badRequest(
                    'Redirect response missing location header',
                    undefined,
                    'URL_FETCH_FAILED'
                  )
                )
                return
              }
              // Resolve relative redirects against current URL
              const resolvedRedirect = new URL(location, validUrl).toString()
              resolve({ redirectUrl: resolvedRedirect })
              res.resume() // discard remaining stream
              return
            }

            let totalBytes = 0
            const chunks: Buffer[] = []

            res.on('data', (chunk: Buffer) => {
              totalBytes += chunk.length
              if (totalBytes > maxSizeBytes) {
                clearTimeout(timer)
                res.destroy()
                reject(
                  AppError.badRequest(
                    `Response exceeded maximum allowed size of ${maxSizeBytes / 1024 / 1024}MB`,
                    undefined,
                    'URL_FETCH_FAILED'
                  )
                )
                return
              }
              chunks.push(chunk)
            })

            res.on('end', () => {
              clearTimeout(timer)
              const body = Buffer.concat(chunks).toString('utf-8')
              const contentType = (res.headers['content-type'] || 'text/html').toLowerCase()
              resolve({
                url: validUrl.toString(),
                statusCode,
                contentType,
                body,
              })
            })

            res.on('error', (err) => {
              clearTimeout(timer)
              reject(
                AppError.badRequest(
                  `Error reading response: ${err.message}`,
                  undefined,
                  'URL_FETCH_FAILED'
                )
              )
            })
          }
        )

        req.on('error', (err) => {
          clearTimeout(timer)
          reject(
            AppError.badRequest(
              `Network request failed: ${err.message}`,
              undefined,
              'URL_FETCH_FAILED'
            )
          )
        })

        req.end()
      }
    )

    if ('redirectUrl' in fetchResult) {
      redirectsCount++
      if (redirectsCount > maxRedirects) {
        throw AppError.badRequest(
          'Too many redirects encountered while fetching URL',
          undefined,
          'URL_FETCH_FAILED'
        )
      }
      currentUrl = fetchResult.redirectUrl
      continue
    }

    return fetchResult
  }

  throw AppError.badRequest('Fetch failed after redirects', undefined, 'URL_FETCH_FAILED')
}
