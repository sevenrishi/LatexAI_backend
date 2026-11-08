# Supabase Local Development & Migration Workflow

This directory manages the Supabase database migrations, configuration, and local emulation for the LatexAI backend API.

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop) installed and running
- [Supabase CLI](https://supabase.com/docs/guides/cli) installed:
  ```bash
  # Windows via Scoop or npm
  scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
  scoop install supabase
  # Or via npm
  npm install -g supabase
  ```

## Local Development Lifecycle

### 1. Start Local Supabase Stack
```bash
# Inside /backend directory
npx supabase start
```
This boots up:
- PostgreSQL database: `postgresql://postgres:postgres@localhost:54322/postgres`
- Supabase Studio Web UI: `http://localhost:54323`
- Kong API Gateway: `http://localhost:54321`
- Inbucket local email preview: `http://localhost:54324`

### 2. Creating New Migrations
Create a migration whenever you add or modify database tables, RLS policies, or triggers:
```bash
# Generate a new timestamped migration file
npx supabase migration new <migration_name>

# Example:
npx supabase migration new create_profiles_table
```
This generates a file in `supabase/migrations/<timestamp>_<migration_name>.sql`.

### 3. Applying Migrations
Apply unapplied migrations to your local database:
```bash
npx supabase db reset
```
> **Note:** `db reset` runs all migrations from scratch and executes `supabase/seed.sql` if present.

### 4. Diffing Local Schema Changes
If you make changes via Supabase Studio UI, generate SQL diffs automatically:
```bash
npx supabase db diff -f <migration_name>
```

### 5. Stopping Local Services
```bash
npx supabase stop
```

## Environment Configuration

Configure your local `.env` with the output from `npx supabase status`:
```env
SUPABASE_URL=http://localhost:54321
SUPABASE_SERVICE_ROLE_KEY=<service_role_key_from_status>
SUPABASE_JWT_SECRET=<jwt_secret_from_status>
```
