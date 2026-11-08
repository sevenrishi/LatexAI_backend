import { rateLimit } from 'express-rate-limit'
import { env } from '../config/env.js'
import { AppError } from '../utils/errors.js'

const skipInTest = () => env.NODE_ENV === 'test'

/**
 * Stricter rate limiter for sensitive authentication routes
 * e.g., login, signup, password resets, account deletion.
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // 30 requests per 15 min window
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(
      AppError.tooManyRequests(
        'Too many authentication attempts. Please try again after 15 minutes.'
      )
    )
  },
  skip: skipInTest,
})

/**
 * Rate limiter for generation and recompilation endpoints (BE-4.24, BE-7.01)
 */
export const generateRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 requests per minute
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(AppError.tooManyRequests('Too many generation requests. Please slow down.'))
  },
  skip: skipInTest,
})

/**
 * Rate limiter for resume history, detail, and download endpoints (BE-7.01)
 */
export const resumesRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(AppError.tooManyRequests('Too many resume history requests. Please slow down.'))
  },
  skip: skipInTest,
})

/**
 * Rate limiter for job extraction and URL fetch endpoints (BE-7.01)
 */
export const jobsRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(AppError.tooManyRequests('Too many job extraction requests. Please slow down.'))
  },
  skip: skipInTest,
})

/**
 * Rate limiter for PDF audit and inspection uploads (BE-7.01)
 */
export const pdfInspectRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 requests per minute
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(AppError.tooManyRequests('Too many PDF audit requests. Please slow down.'))
  },
  skip: skipInTest,
})

/**
 * Stricter rate limiter for full user data export (BE-6.07, BE-7.01)
 */
export const exportRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 export requests per hour
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(AppError.tooManyRequests('Too many data export requests. Please try again later.'))
  },
  skip: skipInTest,
})

/**
 * Rate limiter for profile mutations and imports (BE-7.01)
 */
export const profileRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(AppError.tooManyRequests('Too many profile update requests. Please slow down.'))
  },
  skip: skipInTest,
})

/**
 * Rate limiter for dashboard aggregate metrics (BE-7.01)
 */
export const dashboardRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(AppError.tooManyRequests('Too many dashboard summary requests. Please slow down.'))
  },
  skip: skipInTest,
})
