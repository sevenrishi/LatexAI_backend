import type { Request, Response, NextFunction } from 'express'
import { AppError } from '../utils/errors.js'

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(AppError.notFound(`Endpoint ${req.method} ${req.originalUrl} not found`, 'ROUTE_NOT_FOUND'))
}
