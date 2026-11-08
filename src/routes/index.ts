import { Router } from 'express'
import { healthRouter } from './health.routes.js'
import { authRouter } from './auth.routes.js'
import { profileRouter } from './profile.routes.js'
import { templatesRouter } from './templates.routes.js'
import { jobsRouter } from './jobs.routes.js'
import { generateRouter } from './generate.routes.js'
import { resumesRouter } from './resumes.routes.js'
import { pdfRouter } from './pdf.routes.js'
import { dashboardRouter } from './dashboard.routes.js'
import { docsRouter } from './docs.routes.js'

export const apiRouter = Router()

// Health and Config endpoints mounted under /api/v1
apiRouter.use(healthRouter)

// Domain specific sub-routers
apiRouter.use('/auth', authRouter)
apiRouter.use('/profile', profileRouter)
apiRouter.use('/templates', templatesRouter)
apiRouter.use('/jobs', jobsRouter)
apiRouter.use('/generate', generateRouter)
apiRouter.use('/resumes', resumesRouter)
apiRouter.use('/pdf', pdfRouter)
apiRouter.use('/dashboard', dashboardRouter)
apiRouter.use('/docs', docsRouter)

