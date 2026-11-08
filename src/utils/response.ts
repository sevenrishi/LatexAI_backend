import type { Response } from 'express'
import type { ApiResponseEnvelope } from '../types/index.js'

export function ok<T>(res: Response, data: T, statusCode = 200): Response {
  const payload: ApiResponseEnvelope<T> = {
    success: true,
    data,
  }
  return res.status(statusCode).json(payload)
}

export function errorResponse(
  res: Response,
  code: string,
  message: string,
  statusCode = 400,
  details?: unknown
): Response {
  const payload: ApiResponseEnvelope<never> = {
    success: false,
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
    },
  }
  return res.status(statusCode).json(payload)
}
