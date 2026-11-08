-- Migration: Create Profile Subsections and Resume Imports Tables
-- Created: 2026-01-03

-- 1. Experience
CREATE TABLE IF NOT EXISTS public.profile_experience (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company text NOT NULL,
  title text NOT NULL,
  location text,
  start_date text NOT NULL,
  end_date text,
  current boolean NOT NULL DEFAULT false,
  bullets jsonb NOT NULL DEFAULT '[]'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profile_experience_user ON public.profile_experience(user_id, sort_order);

ALTER TABLE public.profile_experience ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own experience"
  ON public.profile_experience
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT ALL ON public.profile_experience TO authenticated, service_role;

-- 2. Education
CREATE TABLE IF NOT EXISTS public.profile_education (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  institution text NOT NULL,
  degree text NOT NULL,
  field_of_study text,
  location text,
  start_date text NOT NULL,
  end_date text,
  current boolean NOT NULL DEFAULT false,
  gpa text,
  honors text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profile_education_user ON public.profile_education(user_id, sort_order);

ALTER TABLE public.profile_education ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own education"
  ON public.profile_education
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT ALL ON public.profile_education TO authenticated, service_role;

-- 3. Skills
CREATE TABLE IF NOT EXISTS public.profile_skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'Other',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_profile_skills_user_name UNIQUE (user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_profile_skills_user ON public.profile_skills(user_id, sort_order);

ALTER TABLE public.profile_skills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own skills"
  ON public.profile_skills
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT ALL ON public.profile_skills TO authenticated, service_role;

-- 4. Certifications
CREATE TABLE IF NOT EXISTS public.profile_certifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  issuer text NOT NULL,
  issue_date text NOT NULL,
  expiry_date text,
  does_not_expire boolean NOT NULL DEFAULT false,
  credential_id text,
  credential_url text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profile_certifications_user ON public.profile_certifications(user_id, sort_order);

ALTER TABLE public.profile_certifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own certifications"
  ON public.profile_certifications
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT ALL ON public.profile_certifications TO authenticated, service_role;

-- 5. Projects
CREATE TABLE IF NOT EXISTS public.profile_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  role text,
  description text NOT NULL,
  tech_stack jsonb NOT NULL DEFAULT '[]'::jsonb,
  live_url text,
  repo_url text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profile_projects_user ON public.profile_projects(user_id, sort_order);

ALTER TABLE public.profile_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own projects"
  ON public.profile_projects
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT ALL ON public.profile_projects TO authenticated, service_role;

-- 6. Temporary Resume Imports drafts table (24-hour expiration rule)
CREATE TABLE IF NOT EXISTS public.resume_imports (
  id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_size integer NOT NULL,
  storage_path text,
  parsed_data jsonb NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_resume_imports_user ON public.resume_imports(user_id);
CREATE INDEX IF NOT EXISTS idx_resume_imports_expires_at ON public.resume_imports(expires_at);

ALTER TABLE public.resume_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own resume imports"
  ON public.resume_imports
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT ALL ON public.resume_imports TO authenticated, service_role;

-- 7. Configure private Supabase Storage 'uploads' bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'uploads',
  'uploads',
  false,
  5242880, -- 5MB
  ARRAY['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword'];

-- Storage RLS policies for uploads bucket
DROP POLICY IF EXISTS "Authenticated users can upload to their own folder" ON storage.objects;
CREATE POLICY "Authenticated users can upload to their own folder"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'uploads'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Authenticated users can read their own uploads" ON storage.objects;
CREATE POLICY "Authenticated users can read their own uploads"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'uploads'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Authenticated users can delete their own uploads" ON storage.objects;
CREATE POLICY "Authenticated users can delete their own uploads"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'uploads'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
