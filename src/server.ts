import http from 'node:http'
import { app } from './app.js'
import { env } from './config/env.js'
import { logger } from './utils/logger.js'

const server = http.createServer(app)

let isShuttingDown = false

function gracefulShutdown(signal: string) {
  if (isShuttingDown) return
  isShuttingDown = true

  logger.info({ signal }, `Received ${signal}. Initiating graceful shutdown...`)

  // Stop accepting new connections
  server.close((err) => {
    if (err) {
      logger.error({ err }, 'Error closing HTTP server during shutdown')
      process.exit(1)
    }

    logger.info('HTTP server closed successfully. Cleanup finished.')
    process.exit(0)
  })

  // Force shutdown after timeout if connections hang
  const SHUTDOWN_TIMEOUT_MS = 10000
  const timeoutTimer = setTimeout(() => {
    logger.warn(`Shutdown timed out after ${SHUTDOWN_TIMEOUT_MS}ms. Forcefully exiting.`)
    process.exit(1)
  }, SHUTDOWN_TIMEOUT_MS)

  timeoutTimer.unref()
}

// Start listening
server.listen(env.PORT, () => {
  logger.info(
    {
      port: env.PORT,
      env: env.NODE_ENV,
      prefix: env.API_PREFIX,
      logLevel: env.LOG_LEVEL,
    },
    `LatexAI Backend API listening on port ${env.PORT}`
  )

  // Crash recovery tasks (BE-4.21)
  import('./services/generation.service.js')
    .then(({ GenerationService }) => GenerationService.recoverCrashedGenerations())
    .catch((err) => logger.warn({ err }, 'Crash recovery task encountered error on startup'))

  // Retention scheduler (BE-6.08)
  import('./services/retention.service.js')
    .then(({ RetentionService }) => RetentionService.startRetentionScheduler())
    .catch((err) => logger.warn({ err }, 'Retention scheduler encountered error on startup'))
})

// Process signals & unhandled rejections
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))

process.on('unhandledRejection', (reason, promise) => {
  logger.error({ reason, promise }, 'Unhandled Rejection detected')
})

process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught Exception detected! Shutting down...')
  process.exit(1)
})

export { server }
