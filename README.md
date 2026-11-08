# LatexAI Backend API

A robust, type-safe REST API and background worker service powering the **LatexAI** platform — an AI-assisted LaTeX resume generation, ATS scoring, and document compilation system.

---

## 🚀 Overview & Capabilities

- **Authentication & Authorization**: Supabase Auth integration with local JWT validation (`jose`), role checks, and Row Level Security (RLS).
- **Profile Management & Ingestion**: Full structured CRUD for experience, education, skills, certifications, and projects with automated completeness scoring.
- **Resume Import & Document Parsing**: Extracts raw text from uploaded PDF and DOCX files (`pdf-parse`, `mammoth`), with anti-malware and file-signature verification.
- **AI Tailoring Pipeline**: Powered by Groq AI (`groq-sdk`) to parse raw resumes into structured schema, rewrite bullet points with STAR metrics, and evaluate ATS keyword match scores against job descriptions.
- **LaTeX Compilation Microservice**: Isolated LaTeX compilation engine (Dockerized TeX Live container) producing high-fidelity PDFs from dynamic templates.
- **Security & Reliability**: `helmet` HTTP headers, CORS whitelisting, rate limiting (`express-rate-limit`), input validation via `zod`, and structured JSON logging (`pino`).

---

## 🛠 Tech Stack

- **Runtime**: Node.js >= 20.x, TypeScript (ESM)
- **Framework**: Express.js
- **Database & Auth**: Supabase (PostgreSQL with RLS), Supabase Storage
- **AI Engine**: Groq SDK (`groq-sdk`)
- **Compilation Engine**: Dockerized TeX Live / pdflatex compiler service
- **Validation & Serialization**: Zod
- **Testing**: Vitest, Supertest
- **Logging**: Pino & Pino-HTTP

---

## 📁 Project Architecture

```
backend/
├── compiler/              # LaTeX compiler microservice & TeX configs
│   ├── src/
│   ├── Dockerfile
│   └── texmf.cnf
├── docs/                  # API contracts and specifications
├── src/
│   ├── ai/                # AI generation engines, prompt templates & parsers
│   ├── ats/               # ATS scoring and keyword extraction logic
│   ├── config/            # Strict Zod-validated environment config
│   ├── db/                # Supabase client singleton and query helpers
│   ├── jobs/              # Asynchronous background job processing
│   ├── latex/             # LaTeX template engines and compiler client
│   ├── middleware/        # Auth, error handling, rate limiting & logging
│   ├── routes/            # REST endpoint routers (/auth, /profile, /generate, etc.)
│   ├── scripts/           # DB seed scripts and utilities
│   ├── services/          # Core business services
│   ├── types/             # Shared TypeScript types and database interfaces
│   ├── utils/             # Helper utilities (crypto, parsing, formatting)
│   ├── app.ts             # Express application configuration
│   └── server.ts          # Server entrypoint and graceful shutdown handler
├── supabase/              # Database migrations and seed files
├── tests/                 # Integration and unit tests
├── Dockerfile             # Multi-stage production container
└── docker-compose.yml     # Local orchestration (API + Compiler)
```

---

## ⚙️ Environment Variables

Copy `.env.example` to `.env` in the `backend/` directory:

```bash
cp .env.example .env
```

| Key | Description | Example |
| :--- | :--- | :--- |
| `PORT` | Port for the backend API | `4000` |
| `NODE_ENV` | Application environment (`development` / `production`) | `development` |
| `API_PREFIX` | Base prefix for all endpoints | `/api/v1` |
| `CORS_ORIGIN` | Allowed CORS origins (comma-separated) | `http://localhost:5173,http://localhost:3000` |
| `LOG_LEVEL` | Logging level (`debug`, `info`, `warn`, `error`) | `info` |
| `SUPABASE_URL` | Supabase project URL | `https://your-project.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role secret | `your-service-role-key` |
| `SUPABASE_JWT_SECRET` | Supabase JWT secret for local token validation | `your-jwt-secret` |
| `COMPILER_SERVICE_URL` | Endpoint of the LaTeX compiler service | `http://localhost:5050` |
| `GROQ_API_KEY` | Groq AI API key for fast inference | `gsk_...` |

---

## 🏃 Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Local Development Server
Starts the Express API with hot-reloading via `tsx`:
```bash
npm run dev
```

### 3. Docker Compose (API + Compiler)
Run both the API and the isolated LaTeX compiler container locally:
```bash
docker compose up --build
```

---

## 🧪 Testing & Code Quality

```bash
# Run unit and integration tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate test coverage report
npm run test:coverage

# Run TypeScript type check
npm run typecheck

# Lint and auto-fix code style
npm run lint
npm run lint:fix

# Format files with Prettier
npm run format
```

---

## 📦 Production Build

```bash
# Compile TypeScript to dist/
npm run build

# Start production server
npm start
```

