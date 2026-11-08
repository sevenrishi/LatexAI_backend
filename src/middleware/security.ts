import type { Express, Request, Response, NextFunction } from 'express'
import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import compression from 'compression'
import { pinoHttp } from 'pino-http'
import { rateLimit } from 'express-rate-limit'
import { v4 as uuidv4 } from 'uuid'
import { env } from '../config/env.js'
import { logger } from '../utils/logger.js'
import { AppError } from '../utils/errors.js'

export function configureSecurityMiddlewares(app: Express): void {
  // Request ID generator & injector
  app.use((req: Request, res: Response, next: NextFunction) => {
    const requestId = (req.headers['x-request-id'] as string) || uuidv4()
    req.id = requestId
    res.setHeader('x-request-id', requestId)
    next()
  })

  // Pino HTTP structured logging (skip health checks to keep logs clean)
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => req.id || uuidv4(),
      autoLogging: {
        ignore: (req) => {
          const url = req.url || ''
          return url === '/health' || url === '/health/ready' || url === '/api/v1/health'
        },
      },
      customLogLevel: (_req, res, err) => {
        if (res.statusCode >= 500 || err) return 'error'
        if (res.statusCode >= 400) return 'warn'
        return 'info'
      },
    })
  )

  // Helmet for security headers
  app.use(
    helmet({
      contentSecurityPolicy: false, // API server does not render HTML pages
      crossOriginEmbedderPolicy: false,
    })
  )

  // CORS allow-list configuration
  const allowedOrigins = env.CORS_ORIGIN.split(',').map((o) => o.trim())
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
        if (!origin) return callback(null, true)
        if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
          return callback(null, true)
        }
        return callback(
          new AppError(403, 'CORS_NOT_ALLOWED', `Origin ${origin} not allowed by CORS`)
        )
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id'],
      exposedHeaders: ['x-request-id'],
    })
  )

  // Compression
  app.use(compression())

  // JSON and URL-encoded body limits
  app.use(express.json({ limit: '2mb' }))
  app.use(express.urlencoded({ extended: true, limit: '2mb' }))

  // Global rate limiter
  const globalLimiter = rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_MAX,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, _res, next) => {
      next(AppError.tooManyRequests('Global rate limit exceeded. Please try again later.'))
    },
    skip: (req) => {
      // Don't rate limit health checks
      return req.path === '/health' || req.path === '/health/ready'
    },
  })

  // In test environment, skip global rate limiter to prevent test flakiness
  if (env.NODE_ENV !== 'test') {
    app.use(globalLimiter)
  }
}
