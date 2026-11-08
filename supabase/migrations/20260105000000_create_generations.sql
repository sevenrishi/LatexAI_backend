-- Migration: Create Generations, Compile Attempts, and AI Usage Tables
-- Created: 2026-01-05
-- Complies with BE-4.01

-- 1. Generations Table
CREATE TABLE IF NOT EXISTS public.generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  template_id text REFERENCES public.templates(id) ON DELETE SET NULL,
  source_generation_id uuid REFERENCES public.generations(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'queued',
  progress integer NOT NULL DEFAULT 0,
  current_stage text NOT NULL DEFAULT 'queued',
  job_title text,
  company_name text,
  job_description_raw text NOT NULL,
  job_url text,
  extracted_keywords jsonb DEFAULT '{}'::jsonb,
  tailored_content jsonb DEFAULT '{}'::jsonb,
  change_summary jsonb DEFAULT '{}'::jsonb,
  latex_code text,
  pdf_path text,
  tex_path text,
  page_count integer,
  target_page_count integer NOT NULL DEFAULT 1,
  error_message text,
  error_code text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_generations_user_created ON public.generations(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_generations_status ON public.generations(status);

ALTER TABLE public.generations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own generations"
  ON public.generations
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT ALL ON public.generations TO authenticated, service_role;

DROP TRIGGER IF EXISTS set_generations_updated_at ON public.generations;
CREATE TRIGGER set_generations_updated_at
  BEFORE UPDATE ON public.generations
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 2. Compile Attempts Table
CREATE TABLE IF NOT EXISTS public.compile_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_id uuid NOT NULL REFERENCES public.generations(id) ON DELETE CASCADE,
  attempt_number integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'failed',
  latex_code text NOT NULL,
  page_count integer,
  errors jsonb DEFAULT '[]'::jsonb,
  log_excerpt text,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_compile_attempts_generation ON public.compile_attempts(generation_id);

ALTER TABLE public.compile_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view compile attempts for their generations"
  ON public.compile_attempts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.generations
      WHERE generations.id = compile_attempts.generation_id
        AND generations.user_id = auth.uid()
    )
  );

GRANT ALL ON public.compile_attempts TO authenticated, service_role;

-- 3. AI Usage Table
CREATE TABLE IF NOT EXISTS public.ai_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  generation_id uuid REFERENCES public.generations(id) ON DELETE SET NULL,
  call_type text NOT NULL,
  model text NOT NULL,
  prompt_tokens integer NOT NULL DEFAULT 0,
  completion_tokens integer NOT NULL DEFAULT 0,
  total_tokens integer NOT NULL DEFAULT 0,
  latency_ms integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_user_created ON public.ai_usage(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_generation ON public.ai_usage(generation_id);

ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own AI usage"
  ON public.ai_usage
  FOR SELECT
  USING (auth.uid() = user_id);

GRANT ALL ON public.ai_usage TO authenticated, service_role;
