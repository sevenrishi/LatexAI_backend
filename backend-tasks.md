# Tasks — Node.js & Express Backend API

Scope: Node.js/Express backend API contract, validation, AI generation pipeline, LaTeX compilation wrapper, and database migrations.

After completing each task check the respective boxes like this - [x]

---

## Phase 0 — Foundation

- [x] BE-0.01 - Initialize Express project with TypeScript strict mode, ESM modules, and dev/build scripts
- [x] BE-0.02 - Configure ESLint, Prettier, and husky/lint-staged hooks
- [x] BE-0.03 - Set up directory structure (`src/{config,middleware,routes,services,ai/prompts,latex,ats,jobs,db,utils,types}`)
- [x] BE-0.04 - Set up zod-validated environment config loading (`config/env.ts`) with strict startup checks
- [x] BE-0.05 - Implement Express application setup (`app.ts`) and server runner (`server.ts`) with graceful shutdown handling
- [x] BE-0.06 - Implement security middleware stack (`pino-http`, `helmet`, CORS allow-list, compression, json body limits, global rate limiter)
- [x] BE-0.07 - Create central `AppError` class, error-code mapping table, and global error handling middleware
- [x] BE-0.08 - Build request validation middleware (`validate`) and standardized envelope helper (`ok`)
- [x] BE-0.09 - Mount modular routers under `/api/v1` prefix
- [x] BE-0.10 - Implement `/health`, `/health/ready`, and conditional `/config` endpoints (features BE-001)
- [x] BE-0.11 - Configure Supabase service-role client singleton and core DB query helpers (`db/supabase.ts`)
- [x] BE-0.12 - Initialize Supabase migrations directory and local CLI workflow documentation
- [x] BE-0.13 - Set up Vitest and Supertest testing framework with JWT test helpers and mock factories
- [x] BE-0.14 - Create multi-stage production Dockerfile and Docker Compose setup for API and compiler services
- [x] BE-0.15 - Configure GitHub Actions CI pipeline for linting, typechecking, and automated testing

## Phase A — Auth & Onboarding

- [x] BE-1.01 - Configure Supabase Auth settings (email confirmation required, password rules, OAuth providers, callback URLs)
- [x] BE-1.02 - Create migration for `profiles` table with row-level security (RLS) policies and user-creation trigger seeding default templates
- [x] BE-1.03 - Implement `requireAuth` middleware using local JWT verification (`jose`) and email verification checks
- [x] BE-1.04 - Implement `GET /auth/me` returning user identity, onboarding status, and profile completeness metrics
- [x] BE-1.05 - Implement `POST /auth/onboarding/complete` for persistent onboarding state updates
- [x] BE-1.06 - Apply stricter rate-limiting rules on authentication routes
- [x] BE-1.07 - Implement `DELETE /auth/account` endpoint with cascade deletion of user storage files and records for store compliance
- [x] BE-1.08 - Add optional thin proxy routes for signup/login if needed by clients (`POST /auth/signup`, `POST /auth/login`)
- [x] BE-1.09 - Create local test/demo user seed script guarded by environment settings
- [x] BE-1.10 - Write integration test suite covering token validation, email verification checks, and account deletion flows

## Phase B — Profile CRUD + Resume Import

- [x] BE-2.01 - Create database migrations for `profile_experience`, `profile_education`, `profile_skills`, `profile_certifications`, and `profile_projects` with proper constraints and RLS rules
- [x] BE-2.02 - Define Zod request validation schemas and strict field length boundaries for profile fields
- [x] BE-2.03 - Implement `GET /profile` returning aggregated profile data, contact details, summary, and completeness breakdown
- [x] BE-2.04 - Implement `PATCH /profile` for partial updates to contact info, links, and summary
- [x] BE-2.05 - Build generic section CRUD route factories for experience, education, skills, certifications, and projects
- [x] BE-2.06 - Implement server-side UUID assignment for structured bullet points to ensure stable tracking references
- [x] BE-2.07 - Implement `POST /profile/skills/bulk` for case-insensitive bulk skill additions
- [x] BE-2.08 - Implement `PATCH /profile/:section/reorder` to persist user-defined sorting sequences
- [x] BE-2.09 - Build completeness percentage calculator service for profile metrics
- [x] BE-2.10 - Write comprehensive profile CRUD unit and cross-user isolation integration tests
- [x] BE-2.11 - Configure private Supabase Storage `uploads` bucket for temporary document parsing
- [x] BE-2.12 - Implement `POST /profile/import-resume` multipart upload with strict file-type checks (MIME and magic bytes verification)
- [x] BE-2.13 - Build raw text extraction utilities using `pdf-parse` and `mammoth`, adding guards against scanned PDFs and zip bombs
- [x] BE-2.14 - Implement resume import extraction prompt (`import.v1`) using structured JSON outputs via Groq
- [x] BE-2.15 - Persist parsed resume import data into a temporary `resume_imports` drafts table with a 24-hour expiration rule
- [x] BE-2.16 - Implement `POST /profile/import-resume/:importId/confirm` transactionally applying merge or replace strategies
- [x] BE-2.17 - Implement `DELETE /profile/import-resume/:importId` to discard stale import drafts
- [x] BE-2.18 - Write resume parser tests covering valid text PDFs, DOCX documents, scanned images, and corrupt files

## Phase C — Templates, LaTeX Rendering, Compiler Service

- [x] BE-3.01 - Create migration for `templates` table with global default seeding and user customization support
- [x] BE-3.02 - Define placeholder mapping contracts (`{{SUMMARY}}`, `{{EXPERIENCE_BLOCK}}`, etc.)
- [x] BE-3.03 - Author and seed the default ATS-friendly single-column LaTeX resume template
- [x] BE-3.04 - Implement template linter (`lintTemplate`) verifying allowed placeholders and blocking dangerous primitives (`\write18`, shell escapes, arbitrary file reads)
- [x] BE-3.05 - Implement `GET /templates` and `GET /templates/:id` endpoints
- [x] BE-3.06 - Implement `POST /templates` accepting JSON or uploaded `.tex` files with pre-save validation
- [x] BE-3.07 - Implement `PUT /templates/:id` and `DELETE /templates/:id` with fallback activation rules
- [x] BE-3.08 - Implement `POST /templates/:id/duplicate` for custom template creation workflows
- [x] BE-3.09 - Implement `POST /templates/:id/activate` to set active user templates
- [x] BE-3.10 - Implement `POST /templates/:id/preview` to render sample or profile data into temporary PDFs
- [x] BE-3.11 - Implement `GET /templates/:id/placeholders` for template editor integration
- [x] BE-3.12 - Implement robust single-pass `escapeLatex()` utility handling special characters and Unicode normalizations
- [x] BE-3.13 - Implement `escapeLatexUrl()` for secure link injections
- [x] BE-3.14 - Build unit tests and fuzz tests for LaTeX escape functions
- [x] BE-3.15 - Build pure section renderers mapping profile structures into LaTeX blocks
- [x] BE-3.16 - Build single-pass template renderer (`renderTemplate`) using whitelist replacers
- [x] BE-3.17 - Implement profile-to-content data adapters securing core entity attributes from model mutations
- [x] BE-3.18 - Write template rendering snapshot tests
- [x] BE-3.19 - Scaffold compiler microservice (`backend/compiler`) supporting `POST /compile` and `/health` endpoints
- [x] BE-3.20 - Create compiler Docker container image bundling TeX Live distributions and required package sets
- [x] BE-3.21 - Implement secure sandboxed compilation runner executing `pdflatex` with process timeouts and isolated temp directories
- [x] BE-3.22 - Configure paranoid `texmf.cnf` rules disabling shell-escapes and restricting file access paths
- [x] BE-3.23 - Implement compiler concurrency limits, wait queues, and `503` busy responses
- [x] BE-3.24 - Parse compiler log outputs into structured line-error responses for user-facing messaging
- [x] BE-3.25 - Implement API-side compiler client wrapper with retries and timeout error mappings
- [x] BE-3.26 - Configure private Supabase Storage `generated` bucket for secure PDF and `.tex` archival with signed URLs
- [x] BE-3.27 - Write security penetration tests verifying safe handling of malicious LaTeX injections (`\input`, infinite loops)
- [x] BE-3.28 - Execute baseline M3 milestone tests verifying template compilation paths without AI involvement

## Phase D — Job Input + AI Pipeline

- [x] BE-4.01 - Create database migrations for `generations`, `compile_attempts`, and `ai_usage` tables
- [x] BE-4.02 - Implement JD text normalization and sizing validation guards
- [x] BE-4.03 - Implement SSRF-safe URL fetcher (`jobs/safeFetch.ts`) blocking private IPs, local networks, metadata endpoints, and DNS-rebinding attacks
- [x] BE-4.04 - Build Cheerio-based static HTML parser extracting job posting content and JSON-LD data structures
- [x] BE-4.05 - Implement bot-wall and blocking detection throwing clear user-facing fallback notices (`URL_BLOCKED`, `URL_FETCH_FAILED`)
- [x] BE-4.06 - Implement `POST /jobs/fetch` endpoint for remote job text extraction previews
- [x] BE-4.07 - Implement `POST /jobs/extract` standalone requirement extraction endpoint
- [x] BE-4.08 - Build Groq client wrapper (`ai/groq.ts`) handling JSON mode, request timeouts, and exponential backoff retry logic on rate limits
- [x] BE-4.09 - Build structured JSON runner (`ai/runJson.ts`) with automatic validation-error retry loops
- [x] BE-4.10 - Author versioned prompt files (`extract.v1`, `tailor.v1`, `compile-fix.v1`, `import.v1`) with strict data delimiter rules
- [x] BE-4.11 - Implement AI call #1 for requirement extraction with data post-processing and schema validation
- [x] BE-4.12 - Build prompt injection test suites verifying robustness against adversarial job descriptions
- [x] BE-4.13 - Build sanitized profile model builder omitting sensitive contact details while including entity identifiers
- [x] BE-4.14 - Implement AI call #2 for content tailoring grounded strictly in verified profile entries
- [x] BE-4.15 - Build traceability verification checker (`ai/verifyTailored.ts`) ensuring all generated bullets map back to source IDs without fabricated facts
- [x] BE-4.16 - Implement automated remediation policies falling back to original source text on traceability failures
- [x] BE-4.17 - Build change-summary builder capturing detailed diffs, stats, and flags
- [x] BE-4.18 - Implement automated page-limit adjustment loops checking rendered page counts against template targets
- [x] BE-4.19 - Implement `runGeneration(id)` async orchestrator updating job stages, progress tracking, and error handling states
- [x] BE-4.20 - Implement `POST /generate` accepting job inputs or source generation IDs, returning `202 Accepted` status with profile completeness guards
- [x] BE-4.21 - Implement in-process generation queue (`p-queue`) with concurrent worker limits and server-restart crash recovery tasks
- [x] BE-4.22 - Implement `GET /generate/:id/status` and `GET /generate/:id` polling and detail retrieval endpoints
- [x] BE-4.23 - Implement generation lifecycle actions: cancel, retry, and compile-error auto-fixing loops
- [x] BE-4.24 - Implement usage quota tracking (`GENERATION_DAILY_LIMIT`) and route rate limiting
- [x] BE-4.25 - Write end-to-end pipeline test suites using mocked AI fixtures covering full success and recovery flows

## Phase E/F — ATS Scoring & Review Enhancements

- [x] BE-5.01 - Build text normalization utilities and keyword synonym alias mapping files (`ats/normalize.ts`)
- [x] BE-5.02 - Implement boundary-aware term matching algorithms against generated resume texts
- [x] BE-5.03 - Implement weighted ATS scoring formula combining keyword coverage and format checks into a 0-100 scale
- [x] BE-5.04 - Handle empty keyword sets gracefully without runtime crashes
- [x] BE-5.05 - Implement LaTeX template structure checks flagging ATS-unfriendly layout constructs (tables, columns, icons)
- [x] BE-5.06 - Implement compiled PDF text inspection checks using `pdf-parse`
- [x] BE-5.07 - Implement `GET /generate/:id/ats-score` score retrieval endpoint
- [x] BE-5.08 - Implement standalone `POST /pdf/inspect` PDF audit endpoint (features BE-008)
- [x] BE-5.09 - Implement `PATCH /generate/:id/content` for manual user edits to tailored resume sections
- [x] BE-5.10 - Implement `POST /generate/:id/rerender` for non-AI document compilation updates
- [x] BE-5.11 - Implement `POST /generate/:id/content/reset` restoring original AI-generated states

## Phase J — History, Downloads, Dashboard, & Hardening

- [x] BE-6.01 - Implement `GET /resumes` cursor-paginated history list with search and filtering parameters
- [x] BE-6.02 - Implement `GET /resumes/:id` generation detail retrieval
- [x] BE-6.03 - Implement `DELETE /resumes/:id` cleaning up storage files and associated records cascade
- [x] BE-6.04 - Implement `GET /resumes/:id/download` providing short-lived signed URLs with sanitized filenames for PDF and `.tex` formats
- [x] BE-6.05 - Implement `POST /resumes/:id/reuse` creating new generation requests from historical job descriptions
- [x] BE-6.06 - Implement `GET /dashboard/summary` aggregate metrics endpoint for frontend dashboards
- [x] BE-6.07 - Implement `GET /auth/export` data export endpoint for user profile archives
- [x] BE-6.08 - Implement retention background jobs purging stale temporary data and orphaned storage files
- [x] BE-7.01 - Configure comprehensive production rate limits across all route groups
- [x] BE-7.02 - Complete security review checklist (RLS verification, input size caps, log redaction, dependency audits)
- [x] BE-7.03 - Execute abuse and penetration testing suites (SSRF, zip bombs, malicious LaTeX injections, prompt injections)
- [x] BE-7.04 - Configure structured JSON logging (`pino`) and monitoring alerts for error rates and queue depths
- [x] BE-7.05 - Generate OpenAPI 3.1 documentation specs and export client SDK bindings
- [x] BE-7.06 - Deploy API and compiler microservices to production platforms (Railway/Fly.io) with Supabase database integrations
- [x] BE-7.07 - Set up backup schedules, point-in-time recovery configurations, and operational runbooks