# LatexAI — Operational Runbooks & Infrastructure Guides

Complies with tasks **BE-7.06** and **BE-7.07**.

---

## Runbook 1: Supabase Database Backups & Point-in-Time Recovery (PITR)

### 1. Backup Architecture
- **Automated Physical Backups**: Managed via Supabase WAL archiving enabled for 7-day retention.
- **Daily Logical Backups**: Scheduled daily snapshot dump of PostgreSQL schemas:
  - Tables: `profiles`, `profile_sections`, `templates`, `generations`, `compile_attempts`, `ai_usage`.
  - Cron schedule: Every day at `02:00 UTC`.

### 2. Point-in-Time Recovery (PITR) Procedure
If data corruption or accidental deletion occurs:
1. Open Supabase Dashboard -> **Database** -> **Backups** -> **Point in Time**.
2. Select target recovery timestamp (e.g., `T - 15 minutes` prior to the incident).
3. Clone database to a new recovery instance.
4. Verify table integrity using verification query:
   ```sql
   SELECT count(*) FROM public.generations WHERE status = 'completed';
   ```
5. Update backend environment variable `SUPABASE_URL` to point to the restored instance.

### 3. Manual Disaster Recovery Dump
To trigger a manual snapshot before schema migrations:
```bash
pg_dump --host=db.your-supabase-project.supabase.co \
        --port=5432 \
        --username=postgres \
        --dbname=postgres \
        --format=custom \
        --file=backup_$(date +%Y%m%d_%H%M%S).dump
```

---

## Runbook 2: Data Retention & Orphan Cleanup (BE-6.08)

### 1. Automation Details
- Background job runs automatically on server boot via `RetentionService.startRetentionScheduler()`.
- Default schedule: Every 24 hours.

### 2. Policies
- **Stale Generations**: Failed or cancelled generations older than 30 days are purged along with their storage artifacts.
- **Temporary Uploads**: Unconfirmed resume import drafts older than 24 hours are removed.
- **Orphaned Storage Files**: Files in `generated` or `uploads` bucket that have no matching DB record are cleaned up.

### 3. Manual Execution
To force a manual cleanup pass in Node.js REPL or CLI script:
```ts
import { RetentionService } from './services/retention.service.js'
const result = await RetentionService.runRetentionCleanup({ staleDays: 30, tempHours: 24 })
console.log('Cleanup results:', result)
```

---

## Runbook 3: Compiler Microservice Failure & Auto-Restart

### 1. Symptoms
- `/generate/:id/status` reports compile failures or timeouts.
- `/health/ready` indicates compilation latency spikes.

### 2. Triage & Health Check
Verify compiler service status directly:
```bash
curl -f http://localhost:5050/health
```
If unresponsive:
```bash
docker restart latexai-compiler-service
# Or on Railway/Fly:
fly apps restart latexai-compiler
```

### 3. Queue Recovery
When compiler service recovers, running `GenerationService.recoverCrashedGenerations()` re-enqueues interrupted jobs without user intervention.

---

## Runbook 4: AI Provider (Groq) Rate-Limiting & Outages

### 1. Built-in Resilience
- **Backoff & Retries**: `ai/groq.ts` automatically executes exponential backoff with jitter on `429 Too Many Requests`.
- **Heuristic Fallback**: If Groq API key is missing or calls exhaust retries, `heuristicJobExtractor` and `heuristicTailorer` safely generate grounded resumes without crashing the pipeline.

### 2. Quota Monitoring
- Check `/api/v1/dashboard/summary` for quota metrics.
- Check Pino error logs for `AI_RATE_LIMIT_EXCEEDED` warnings.

---

## Runbook 5: Security Review & Audit Checklist (BE-7.02)

| Security Control | Implementation | Verification |
| :--- | :--- | :--- |
| **Row Level Security (RLS)** | Enabled on all Postgres tables (`profiles`, `profile_sections`, `templates`, `generations`, `compile_attempts`, `ai_usage`) | Verify `auth.uid() = user_id` policies |
| **Input Size Limits** | Express body limited to `2mb`; Multer file upload limited to `5mb` | Reject oversized payloads with `413` |
| **Log Redaction** | Pino redacted paths: `authorization`, `password`, `cookie`, `tokens` | Inspect stdout logs for `[REDACTED]` |
| **SSRF Defense** | `safeFetch.ts` blocks private IPs, metadata IP (`169.254.169.254`), loopbacks | Covered by pen testing test suite |
| **LaTeX Sandbox** | Compiler runs in chroot/isolated non-root sandbox blocking `\write18`, `\input` escapes | Verified via security unit tests |
| **Rate Limiting** | Stricter tiered limits for auth, generation, downloads, and exports | Configured via `express-rate-limit` |
