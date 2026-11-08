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
