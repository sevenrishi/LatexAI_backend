import { v4 as uuidv4 } from 'uuid'

export function createMockUser(overrides: Record<string, unknown> = {}) {
  const id = (overrides.id as string) || uuidv4()
  return {
    id,
    email: overrides.email || `user_${id.slice(0, 6)}@example.com`,
    role: 'authenticated',
    app_metadata: { provider: 'email' },
    user_metadata: { full_name: 'Jane Doe' },
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

export function createMockProfile(overrides: Record<string, unknown> = {}) {
  const id = (overrides.id as string) || uuidv4()
  return {
    id,
    user_id: (overrides.user_id as string) || uuidv4(),
    full_name: 'Jane Doe',
    email: 'jane.doe@example.com',
    headline: 'Senior Full Stack Engineer',
    phone: '+1 555-0199',
    location: 'San Francisco, CA',
    summary: 'Experienced software engineer specializing in distributed systems and AI platforms.',
    links: [
      { id: uuidv4(), label: 'GitHub', url: 'https://github.com/janedoe' },
      { id: uuidv4(), label: 'LinkedIn', url: 'https://linkedin.com/in/janedoe' },
    ],
    onboarding_completed: true,
    active_template_id: 'tpl_default_swe',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

export function createMockTemplate(overrides: Record<string, unknown> = {}) {
  const id = (overrides.id as string) || `tpl_${uuidv4().slice(0, 8)}`
  return {
    id,
    user_id: overrides.user_id || null, // null means global default
    name: 'Standard ATS Modern',
    description: 'Clean single-column ATS compliant resume template',
    latex_source: `\\documentclass[letterpaper,10pt]{article}\n\\begin{document}\n{{NAME}}\n\\end{document}`,
    category: 'swe',
    is_active: true,
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

export function createMockGeneration(overrides: Record<string, unknown> = {}) {
  const id = (overrides.id as string) || uuidv4()
  return {
    id,
    user_id: (overrides.user_id as string) || uuidv4(),
    job_title: 'Staff AI Engineer',
    company_name: 'Tech Corp',
    job_description: 'Looking for a Staff AI Engineer with strong TypeScript and LLM experience...',
    status: 'completed',
    pdf_url: 'https://storage.latexai.local/generated/resume.pdf',
    tex_url: 'https://storage.latexai.local/generated/resume.tex',
    ats_score: 92,
    created_at: new Date().toISOString(),
    ...overrides,
  }
}
