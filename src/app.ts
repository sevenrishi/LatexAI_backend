import express, { type Express } from 'express'
import { env } from './config/env.js'
import { configureSecurityMiddlewares } from './middleware/security.js'
import { metricsMiddleware } from './utils/monitoring.js'
import { healthRouter } from './routes/health.routes.js'
import { apiRouter } from './routes/index.js'
import { notFoundHandler } from './middleware/notFound.js'
import { errorHandler } from './middleware/errorHandler.js'

export function createApp(): Express {
  const app = express()

  // Security, logging, parsing, compression, and rate limiting
  configureSecurityMiddlewares(app)

  // Metrics telemetry tracking (BE-7.04)
  app.use(metricsMiddleware)

  // Direct root health check routes for container/orchestrator liveness probes
  app.use(healthRouter)

  // Mount API routers under versioned prefix (e.g. /api/v1)
  app.use(env.API_PREFIX, apiRouter)

  // Catch-all 404 handler for undefined routes
  app.use(notFoundHandler)

  // Central global error handler
  app.use(errorHandler)

  return app
}

export const app = createApp()
