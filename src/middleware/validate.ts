import type { Request, Response, NextFunction } from 'express'
import { type ZodSchema, ZodError } from 'zod'
import { AppError } from '../utils/errors.js'

export interface RequestValidationSchemas {
  body?: ZodSchema
  query?: ZodSchema
  params?: ZodSchema
  headers?: ZodSchema
}

export function validate(schemas: RequestValidationSchemas) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (schemas.params) {
        req.params = await schemas.params.parseAsync(req.params)
      }
      if (schemas.query) {
        req.query = await schemas.query.parseAsync(req.query)
      }
      if (schemas.body) {
        req.body = await schemas.body.parseAsync(req.body)
      }
      if (schemas.headers) {
        // Only validate specified headers
        await schemas.headers.parseAsync(req.headers)
      }
      next()
    } catch (err) {
      if (err instanceof ZodError) {
        const formattedErrors = err.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
          code: issue.code,
        }))
        return next(
          AppError.validation(
            formattedErrors,
            `Validation failed: ${formattedErrors.map((e) => `${e.field} (${e.message})`).join(', ')}`
          )
        )
      }
      next(err)
    }
  }
}
