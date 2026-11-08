import { Router, type Request, type Response, type NextFunction } from 'express'
import { checkDbConnection } from '../db/supabase.js'
import { env } from '../config/env.js'
import { ok } from '../utils/response.js'
import { AppError } from '../utils/errors.js'

import { metricsRegistry } from '../utils/monitoring.js'
import { getQueueStatus } from '../services/generationQueue.js'

export const healthRouter = Router()

/**
 * GET /health
 * Liveness probe: returns status 200 if the Node.js server process is responding.
 */
healthRouter.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    service: 'latexai-api',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  })
})

/**
 * GET /health/ready
 * Readiness probe: checks database and downstream service dependencies, queue status, and alerts (BE-7.04).
 */
healthRouter.get('/health/ready', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const dbCheck = await checkDbConnection()
    const queue = getQueueStatus()
    const alerts = metricsRegistry.evaluateAlerts()

    const checks = {
      database: {
        status: dbCheck.connected ? 'healthy' : 'unhealthy',
        latencyMs: dbCheck.latencyMs,
        ...(dbCheck.error ? { error: dbCheck.error } : {}),
      },
      queue: {
        status: queue.size + queue.pending > 50 ? 'degraded' : 'healthy',
        size: queue.size,
        pending: queue.pending,
      },
    }

    const hasCriticalAlert = alerts.some((a) => a.severity === 'critical')

    if (!dbCheck.connected || hasCriticalAlert) {
      return res.status(503).json({
        status: 'unhealthy',
        service: 'latexai-api',
        checks,
        alerts,
        timestamp: new Date().toISOString(),
      })
    }

    return res.status(200).json({
      status: 'ok',
      service: 'latexai-api',
      checks,
      alerts,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    return next(err)
  }
})

/**
 * GET /metrics
 * Monitoring metrics snapshot and queue telemetry (BE-7.04).
 */
healthRouter.get('/metrics', (_req: Request, res: Response) => {
  const snapshot = metricsRegistry.getSnapshot()
  const alerts = metricsRegistry.evaluateAlerts()
  return ok(res, {
    ...snapshot,
    alerts,
    timestamp: new Date().toISOString(),
  })
})

/**
 * GET /config
 * Conditional public system configuration endpoint.
 */
healthRouter.get('/config', (_req: Request, res: Response, next: NextFunction) => {
  if (!env.ENABLE_CONFIG_ENDPOINT) {
    return next(AppError.notFound('Configuration endpoint is disabled in this environment.'))
  }

  return ok(res, {
    apiVersion: 'v1',
    environment: env.NODE_ENV,
    features: {
      auth: true,
      profileKnowledgeBase: true,
      templateRendering: true,
      aiTailoring: true,
      latexCompilation: true,
      atsScoring: true,
    },
    limits: {
      maxUploadSizeBytes: 5 * 1024 * 1024, // 5MB
      allowedFileTypes: [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ],
      rateLimitMax: env.RATE_LIMIT_MAX,
      rateLimitWindowMs: env.RATE_LIMIT_WINDOW_MS,
    },
  })
})
