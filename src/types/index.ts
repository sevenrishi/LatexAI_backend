import type { Request, Response, NextFunction } from 'express'

export interface ApiResponseEnvelope<T = unknown> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
    details?: unknown
  }
}

export type AsyncHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<unknown> | unknown

export interface AuthenticatedUser {
  id: string
  email: string
  role?: string
  appMetadata?: Record<string, unknown>
  userMetadata?: Record<string, unknown>
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      id?: string
      user?: AuthenticatedUser
    }
  }
}
