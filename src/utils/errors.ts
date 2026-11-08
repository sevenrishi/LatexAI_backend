export const ERROR_CODES = {
  BAD_REQUEST: 'BAD_REQUEST',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
  INVALID_TOKEN: 'INVALID_TOKEN',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  ROUTE_NOT_FOUND: 'ROUTE_NOT_FOUND',
  CONFLICT: 'CONFLICT',
  UNPROCESSABLE_ENTITY: 'UNPROCESSABLE_ENTITY',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  URL_BLOCKED: 'URL_BLOCKED',
  URL_FETCH_FAILED: 'URL_FETCH_FAILED',
  PROFILE_INCOMPLETE: 'PROFILE_INCOMPLETE',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
} as const

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES] | string

export class AppError extends Error {
  public readonly statusCode: number
  public readonly code: ErrorCode
  public readonly details?: unknown
  public readonly isOperational: boolean

  constructor(
    statusCode: number,
    code: ErrorCode,
    message: string,
    details?: unknown,
    isOperational = true
  ) {
    super(message)
    this.name = 'AppError'
    this.statusCode = statusCode
    this.code = code
    this.details = details
    this.isOperational = isOperational

    Error.captureStackTrace(this, this.constructor)
  }

  static badRequest(
    message = 'Bad Request',
    details?: unknown,
    code: ErrorCode = ERROR_CODES.BAD_REQUEST
  ) {
    return new AppError(400, code, message, details)
  }

  static validation(details: unknown, message = 'Request validation failed') {
    return new AppError(400, ERROR_CODES.VALIDATION_ERROR, message, details)
  }

  static unauthorized(message = 'Unauthorized', code: ErrorCode = ERROR_CODES.UNAUTHORIZED) {
    return new AppError(401, code, message)
  }

  static forbidden(message = 'Forbidden access', code: ErrorCode = ERROR_CODES.FORBIDDEN) {
    return new AppError(403, code, message)
  }

  static notFound(message = 'Resource not found', code: ErrorCode = ERROR_CODES.NOT_FOUND) {
    return new AppError(404, code, message)
  }

  static conflict(message = 'Resource conflict', details?: unknown) {
    return new AppError(409, ERROR_CODES.CONFLICT, message, details)
  }

  static unprocessable(message = 'Unprocessable entity', details?: unknown) {
    return new AppError(422, ERROR_CODES.UNPROCESSABLE_ENTITY, message, details)
  }

  static tooManyRequests(message = 'Too many requests, please try again later.') {
    return new AppError(429, ERROR_CODES.RATE_LIMIT_EXCEEDED, message)
  }

  static internal(message = 'Internal server error', details?: unknown) {
    return new AppError(500, ERROR_CODES.INTERNAL_SERVER_ERROR, message, details, false)
  }

  static serviceUnavailable(message = 'Service temporarily unavailable') {
    return new AppError(503, ERROR_CODES.SERVICE_UNAVAILABLE, message)
  }
}
