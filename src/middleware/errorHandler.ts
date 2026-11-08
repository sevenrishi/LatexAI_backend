import type { Request, Response, NextFunction } from 'express'
import { AppError, ERROR_CODES } from '../utils/errors.js'
import { logger } from '../utils/logger.js'
import { env } from '../config/env.js'

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  const isDev = env.NODE_ENV !== 'production'

  let statusCode = 500
  let code: string = ERROR_CODES.INTERNAL_SERVER_ERROR
  let message = 'An unexpected internal server error occurred.'
  let details: unknown = undefined

  if (err instanceof AppError) {
    statusCode = err.statusCode
    code = err.code
    message = err.message
    details = err.details
  } else if ('type' in err && err.type === 'entity.parse.failed') {
    // Malformed JSON body
    statusCode = 400
    code = ERROR_CODES.BAD_REQUEST
    message = 'Malformed JSON in request body'
  } else if (
    ('type' in err && err.type === 'entity.too.large') ||
    ('status' in err && (err as { status?: number }).status === 413)
  ) {
    statusCode = 413
    code = 'PAYLOAD_TOO_LARGE'
    message = 'Request payload exceeds maximum allowed size'
  } else if (err.name === 'SyntaxError') {
    statusCode = 400
    code = ERROR_CODES.BAD_REQUEST
    message = err.message
  } else {
    // Unhandled standard error
    logger.error(
      {
        err,
        reqId: req.id,
        method: req.method,
        url: req.originalUrl,
      },
      `Unhandled server error: ${err.message}`
    )

    if (isDev) {
      message = err.message
      details = { stack: err.stack }
    }
  }

  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
    },
  })
}
