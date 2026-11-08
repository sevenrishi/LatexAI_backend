-- Initial Migration: Enable Core PostgreSQL Extensions
-- Author: LatexAI Team
-- Created: 2026-01-01

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions;

-- Grant execution permissions
GRANT USAGE ON SCHEMA extensions TO postgres, anon, authenticated, service_role;
