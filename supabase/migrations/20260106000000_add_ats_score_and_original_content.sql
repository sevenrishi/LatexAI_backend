-- Migration: Add ATS Score and Original Tailored Content to Generations
-- Complies with Phase E/F (BE-5.07, BE-5.09, BE-5.11)

ALTER TABLE public.generations
  ADD COLUMN IF NOT EXISTS ats_score jsonb,
  ADD COLUMN IF NOT EXISTS original_tailored_content jsonb;

COMMENT ON COLUMN public.generations.ats_score IS 'Computed ATS score, breakdown, matched/missing keywords, and format analysis';
COMMENT ON COLUMN public.generations.original_tailored_content IS 'Original AI-generated resume content prior to manual user edits';
