-- Initial Migration: Enable Core PostgreSQL Extensions
-- Author: LatexAI Team
-- Created: 2026-01-01

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions;

-- Grant execution permissions
GRANT USAGE ON SCHEMA extensions TO postgres, anon, authenticated, service_role;
-- Migration: Create Profiles Table with RLS and Auth Trigger
-- Created: 2026-01-02

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text,
  headline text,
  phone text,
  location text,
  summary text,
  links jsonb NOT NULL DEFAULT '[]'::jsonb,
  onboarding_completed boolean NOT NULL DEFAULT false,
  active_template_id text NOT NULL DEFAULT 'tpl_default_swe',
  target_role text,
  industry text,
  experience_level text,
  tone_preference text DEFAULT 'balanced',
  bullet_density text DEFAULT 'standard',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Ensure all columns exist on pre-existing tables
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS target_role text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS industry text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS experience_level text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS tone_preference text DEFAULT 'balanced';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bullet_density text DEFAULT 'standard';

-- Index on email for fast lookups
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile"
  ON public.profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can delete their own profile" ON public.profiles;
CREATE POLICY "Users can delete their own profile"
  ON public.profiles
  FOR DELETE
  USING (auth.uid() = id);

-- Grant access to authenticated and service_role
GRANT ALL ON public.profiles TO authenticated, service_role;

-- Function: Automatically create a profile upon user registration
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    headline,
    active_template_id,
    onboarding_completed,
    created_at,
    updated_at
  ) VALUES (
    new.id,
    new.email,
    COALESCE(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'fullName',
      split_part(new.email, '@', 1)
    ),
    COALESCE(new.raw_user_meta_data->>'headline', ''),
    COALESCE(new.raw_user_meta_data->>'active_template_id', 'tpl_default_swe'),
    COALESCE((new.raw_user_meta_data->>'onboarding_completed')::boolean, false),
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    onboarding_completed = EXCLUDED.onboarding_completed OR public.profiles.onboarding_completed;
  RETURN new;
END;
$$;

-- Trigger: Bind user creation to profile seeding
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill existing auth.users into public.profiles
INSERT INTO public.profiles (
  id,
  email,
  full_name,
  headline,
  active_template_id,
  onboarding_completed,
  created_at,
  updated_at
)
SELECT 
  u.id,
  u.email,
  COALESCE(
    u.raw_user_meta_data->>'full_name',
    u.raw_user_meta_data->>'fullName',
    u.raw_user_meta_data->>'name',
    initcap(replace(split_part(u.email, '@', 1), '.', ' '))
  ),
  COALESCE(u.raw_user_meta_data->>'headline', ''),
  'tpl_default_swe',
  false,
  now(),
  now()
FROM auth.users u
ON CONFLICT (id) DO UPDATE SET
  full_name = CASE 
    WHEN public.profiles.full_name IS NULL OR public.profiles.full_name = '' OR public.profiles.full_name = 'User'
    THEN EXCLUDED.full_name 
    ELSE public.profiles.full_name 
  END;

-- Trigger for auto-updating updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  new.updated_at = now();
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS set_profiles_updated_at ON public.profiles;
CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
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
-- Migration: Create Templates Table and Generated Storage Bucket
-- Created: 2026-01-04
-- Complies with BE-3.01, BE-3.03, BE-3.26

-- 1. Create Templates Table
CREATE TABLE IF NOT EXISTS public.templates (
  id text PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'general',
  latex_code text NOT NULL,
  is_system boolean NOT NULL DEFAULT false,
  thumbnail_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_templates_user_id ON public.templates(user_id);
CREATE INDEX IF NOT EXISTS idx_templates_is_system ON public.templates(is_system);

-- Enable RLS
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Public can view system templates or owned templates" ON public.templates;
CREATE POLICY "Public can view system templates or owned templates"
  ON public.templates
  FOR SELECT
  USING (is_system = true OR auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create their own custom templates" ON public.templates;
CREATE POLICY "Users can create their own custom templates"
  ON public.templates
  FOR INSERT
  WITH CHECK (auth.uid() = user_id AND is_system = false);

DROP POLICY IF EXISTS "Users can update their own custom templates" ON public.templates;
CREATE POLICY "Users can update their own custom templates"
  ON public.templates
  FOR UPDATE
  USING (auth.uid() = user_id AND is_system = false)
  WITH CHECK (auth.uid() = user_id AND is_system = false);

DROP POLICY IF EXISTS "Users can delete their own custom templates" ON public.templates;
CREATE POLICY "Users can delete their own custom templates"
  ON public.templates
  FOR DELETE
  USING (auth.uid() = user_id AND is_system = false);

-- Grants
GRANT ALL ON public.templates TO authenticated, service_role;
GRANT SELECT ON public.templates TO anon;

-- Auto-update updated_at trigger
DROP TRIGGER IF EXISTS set_templates_updated_at ON public.templates;
CREATE TRIGGER set_templates_updated_at
  BEFORE UPDATE ON public.templates
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 2. Seed Default Global System Templates (BE-3.01, BE-3.03)
INSERT INTO public.templates (id, user_id, name, description, category, latex_code, is_system)
VALUES 
(
  'tpl_default_swe',
  NULL,
  'Standard ATS Single Column',
  'Clean, classic single-column layout engineered specifically for ATS parser legibility and top software engineering roles.',
  'engineering',
  $swe$
\documentclass[letterpaper,10.8pt]{article}

\usepackage{latexsym}
\usepackage[empty]{fullpage}
\usepackage{titlesec}
\usepackage{marvosym}
\usepackage[usenames,dvipsnames]{color}
\usepackage{verbatim}
\usepackage{enumitem}
\usepackage[hidelinks]{hyperref}
\usepackage{fancyhdr}
\usepackage[english]{babel}
\usepackage{tabularx}
\usepackage{geometry}

\geometry{left=0.5in,top=0.45in,right=0.5in,bottom=0.45in}

\pagestyle{fancy}
\fancyhf{}
\fancyfoot{}
\renewcommand{\headrulewidth}{0pt}
\renewcommand{\footrulewidth}{0pt}

\urlstyle{same}

\raggedbottom
\raggedright
\setlength{\tabcolsep}{0in}

% Sections formatting
\titleformat{\section}{
  \vspace{-4pt}\scshape\raggedright\large
}{}{0em}{}[\color{black}\titlerule \vspace{-5pt}]

% Custom commands
\newcommand{\resumeItem}[1]{
  \item\small{
    {#1 \vspace{-2pt}}
  }
}

\newcommand{\resumeSubheading}[4]{
  \vspace{-2pt}\item
    \begin{tabular*}{0.98\textwidth}[t]{l@{\extracolsep{\fill}}r}
      \textbf{#1} & #2 \\
      \textit{\small#3} & \textit{\small #4} \\
    \end{tabular*}\vspace{-7pt}
}

\newcommand{\resumeProjectHeading}[2]{
  \item
  \begin{tabular*}{0.98\textwidth}{l@{\extracolsep{\fill}}r}
    \small#1 & #2 \\
  \end{tabular*}\vspace{-7pt}
}

\newcommand{\resumeSubHeadingListStart}{\begin{itemize}[leftmargin=0.15in, label={}]}
\newcommand{\resumeSubHeadingListEnd}{\end{itemize}}
\newcommand{\resumeItemListStart}{\begin{itemize}[leftmargin=0.15in]}
\newcommand{\resumeItemListEnd}{\end{itemize}\vspace{-5pt}}

\begin{document}

%----------HEADING----------
\begin{center}
    \textbf{\Huge \scshape {{FULL_NAME}}} \\ \vspace{2pt}
    \small {{HEADLINE}} \\ \vspace{2pt}
    \small {{LINKS_BLOCK}}
\end{center}

%----------SUMMARY----------
{{SUMMARY_BLOCK}}

%----------EXPERIENCE----------
{{EXPERIENCE_BLOCK}}

%----------PROJECTS----------
{{PROJECTS_BLOCK}}

%----------EDUCATION----------
{{EDUCATION_BLOCK}}

%----------SKILLS----------
{{SKILLS_BLOCK}}

%----------CERTIFICATIONS----------
{{CERTIFICATIONS_BLOCK}}

\end{document}
$swe$,
  true
),
(
  'tpl_minimal_tech',
  NULL,
  'Minimalist Tech Modern',
  'High-density, contemporary monospace-accented layout designed for senior engineers and DevOps professionals.',
  'engineering',
  $tech$
\documentclass[letterpaper,10pt]{article}

\usepackage[utf8]{inputenc}
\usepackage{geometry}
\usepackage{titlesec}
\usepackage{enumitem}
\usepackage[hidelinks]{hyperref}
\usepackage{xcolor}

\geometry{margin=0.55in}

\pagestyle{empty}
\urlstyle{same}

% Custom section formatting
\titleformat{\section}{\large\bfseries\uppercase}{}{0em}{}[\titlerule]
\titlespacing*{\section}{0pt}{10pt}{6pt}

\newcommand{\resumeItem}[1]{\item \small{#1}}

\newcommand{\resumeSubheading}[4]{
  \item
    \begin{tabular*}{\textwidth}[t]{l@{\extracolsep{\fill}}r}
      \textbf{#1} & #2 \\
      \textit{\small#3} & \textit{\small #4} \\
    \end{tabular*}\vspace{-5pt}
}

\newcommand{\resumeProjectHeading}[2]{
  \item
  \begin{tabular*}{\textwidth}{l@{\extracolsep{\fill}}r}
    \small#1 & #2 \\
  \end{tabular*}\vspace{-5pt}
}

\newcommand{\resumeSubHeadingListStart}{\begin{itemize}[leftmargin=*, label={}]}
\newcommand{\resumeSubHeadingListEnd}{\end{itemize}}
\newcommand{\resumeItemListStart}{\begin{itemize}[leftmargin=0.2in]}
\newcommand{\resumeItemListEnd}{\end{itemize}\vspace{-4pt}}

\begin{document}

%----------HEADER----------
\begin{flushleft}
  {\LARGE \bfseries {{FULL_NAME}}} \\ \vspace{2pt}
  {\normalsize \color{darkgray} {{HEADLINE}}} \\ \vspace{3pt}
  \small {{LINKS_BLOCK}}
\end{flushleft}

{{SUMMARY_BLOCK}}

{{EXPERIENCE_BLOCK}}

{{PROJECTS_BLOCK}}

{{EDUCATION_BLOCK}}

{{SKILLS_BLOCK}}

{{CERTIFICATIONS_BLOCK}}

\end{document}
$tech$,
  true
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  latex_code = EXCLUDED.latex_code,
  is_system = EXCLUDED.is_system;

-- 3. Configure Generated Supabase Storage Bucket (BE-3.26)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'generated',
  'generated',
  false,
  10485760, -- 10MB limit
  ARRAY['application/pdf', 'application/x-tex', 'text/plain', 'text/x-tex']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['application/pdf', 'application/x-tex', 'text/plain', 'text/x-tex'];

-- Storage RLS policies for generated bucket
DROP POLICY IF EXISTS "Authenticated users can upload to their own generated folder" ON storage.objects;
CREATE POLICY "Authenticated users can upload to their own generated folder"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'generated'
    AND (
      auth.role() = 'service_role'
      OR (
        auth.role() = 'authenticated'
        AND (storage.foldername(name))[1] = auth.uid()::text
      )
    )
  );

DROP POLICY IF EXISTS "Authenticated users can read their own generated files" ON storage.objects;
CREATE POLICY "Authenticated users can read their own generated files"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'generated'
    AND (
      auth.role() = 'service_role'
      OR (
        auth.role() = 'authenticated'
        AND (storage.foldername(name))[1] = auth.uid()::text
      )
    )
  );

DROP POLICY IF EXISTS "Authenticated users can delete their own generated files" ON storage.objects;
CREATE POLICY "Authenticated users can delete their own generated files"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'generated'
    AND (
      auth.role() = 'service_role'
      OR (
        auth.role() = 'authenticated'
        AND (storage.foldername(name))[1] = auth.uid()::text
      )
    )
  );
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
-- Migration: Add ATS Score and Original Tailored Content to Generations
-- Complies with Phase E/F (BE-5.07, BE-5.09, BE-5.11)

ALTER TABLE public.generations
  ADD COLUMN IF NOT EXISTS ats_score jsonb,
  ADD COLUMN IF NOT EXISTS original_tailored_content jsonb;

COMMENT ON COLUMN public.generations.ats_score IS 'Computed ATS score, breakdown, matched/missing keywords, and format analysis';
COMMENT ON COLUMN public.generations.original_tailored_content IS 'Original AI-generated resume content prior to manual user edits';
