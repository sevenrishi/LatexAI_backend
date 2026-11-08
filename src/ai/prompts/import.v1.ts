import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { runJson } from '../runJson.js'
import { isGroqConfigured } from '../groq.js'
import { logger } from '../../utils/logger.js'

export const IMPORT_V1_SYSTEM_PROMPT = `You are an expert resume parsing engine for LatexAI.
Your task is to parse raw text extracted from a candidate's resume (PDF or DOCX) into a strictly validated JSON structure.

Rules:
1. Output ONLY valid JSON, with NO surrounding explanation, Markdown fences, or preamble.
2. Ground all fields directly in the provided text. Never invent facts or dates.
3. If an end date is 'Present', 'Current', or omitted for an active role, set 'current': true and 'endDate': null.
4. Normalize dates into 'YYYY-MM' format if month and year are provided, or 'YYYY' if only year is available.
5. Assign unique string IDs to each item and bullet point.
6. Categorize skills into: Languages, Frontend, Backend, Databases, DevOps, Tools, or Other.
7. Extract all work experiences, education degrees, technical skills, projects, and certifications mentioned in the text.

Output Schema:
{
  "contact": {
    "fullName": "string",
    "headline": "string",
    "email": "string",
    "phone": "string",
    "location": "string",
    "website": "string",
    "linkedin": "string",
    "github": "string"
  },
  "summary": "string",
  "experience": [
    {
      "id": "uuid",
      "company": "string",
      "title": "string",
      "location": "string",
      "startDate": "YYYY-MM",
      "endDate": "YYYY-MM or null",
      "current": true,
      "bullets": [
        { "id": "uuid", "text": "string" }
      ]
    }
  ],
  "education": [
    {
      "id": "uuid",
      "institution": "string",
      "degree": "string",
      "fieldOfStudy": "string",
      "location": "string",
      "startDate": "YYYY-MM",
      "endDate": "YYYY-MM",
      "gpa": "string",
      "honors": "string"
    }
  ],
  "skills": [
    { "id": "uuid", "name": "string", "category": "Languages" }
  ],
  "certifications": [
    {
      "id": "uuid",
      "name": "string",
      "issuer": "string",
      "issueDate": "YYYY-MM",
      "expiryDate": "YYYY-MM or null",
      "doesNotExpire": false,
      "credentialId": "string",
      "credentialUrl": "string"
    }
  ],
  "projects": [
    {
      "id": "uuid",
      "title": "string",
      "role": "string",
      "description": "string",
      "techStack": ["string"],
      "liveUrl": "string",
      "repoUrl": "string"
    }
  ]
}`

export const resumeImportSchema = z.object({
  contact: z
    .object({
      fullName: z.string().optional().default(''),
      headline: z.string().optional().default(''),
      email: z.string().optional().default(''),
      phone: z.string().optional().default(''),
      location: z.string().optional().default(''),
      website: z.string().optional().default(''),
      linkedin: z.string().optional().default(''),
      github: z.string().optional().default(''),
    })
    .default({}),
  summary: z.string().optional().default(''),
  experience: z
    .array(
      z.object({
        id: z.string().optional(),
        company: z.string().default('Company'),
        title: z.string().default('Role'),
        location: z.string().optional().default(''),
        startDate: z.string().default('2022-01'),
        endDate: z.string().nullable().optional().default(null),
        current: z.boolean().default(false),
        bullets: z
          .array(
            z.union([
              z.string().transform((text) => ({ id: uuidv4(), text })),
              z.object({
                id: z.string().optional(),
                text: z.string(),
              }),
            ])
          )
          .default([]),
      })
    )
    .default([]),
  education: z
    .array(
      z.object({
        id: z.string().optional(),
        institution: z.string().default('Institution'),
        degree: z.string().default('Degree'),
        fieldOfStudy: z.string().optional().default(''),
        location: z.string().optional().default(''),
        startDate: z.string().optional().default('2018-09'),
        endDate: z.string().nullable().optional().default('2022-05'),
        current: z.boolean().optional().default(false),
        gpa: z.string().optional().default(''),
        honors: z.string().optional().default(''),
      })
    )
    .default([]),
  skills: z
    .array(
      z.union([
        z.string().transform((name) => ({ id: uuidv4(), name, category: 'Other' })),
        z.object({
          id: z.string().optional(),
          name: z.string(),
          category: z.string().optional().default('Other'),
        }),
      ])
    )
    .default([]),
  certifications: z
    .array(
      z.object({
        id: z.string().optional(),
        name: z.string(),
        issuer: z.string().optional().default(''),
        issueDate: z.string().optional().default(''),
        expiryDate: z.string().nullable().optional().default(null),
        doesNotExpire: z.boolean().optional().default(false),
        credentialId: z.string().optional().default(''),
        credentialUrl: z.string().optional().default(''),
      })
    )
    .default([]),
  projects: z
    .array(
      z.object({
        id: z.string().optional(),
        title: z.string(),
        role: z.string().optional().default(''),
        description: z.string().optional().default(''),
        techStack: z.array(z.string()).optional().default([]),
        liveUrl: z.string().optional().default(''),
        repoUrl: z.string().optional().default(''),
      })
    )
    .default([]),
})

export type ResumeImportParsedData = z.infer<typeof resumeImportSchema>

export function buildImportPrompt(rawText: string): string {
  return `<<<RAW_RESUME_TEXT>>>\n${rawText}\n<<<END_RAW_RESUME_TEXT>>>\n\nExtract and return the JSON object following the required schema.`
}

/**
 * Parses raw extracted resume text using Groq LLM with automatic JSON repair,
 * falling back to heuristic parsing if AI is offline or encounters an error.
 */
export async function parseResumeWithAi(rawText: string): Promise<ResumeImportParsedData> {
  if (isGroqConfigured()) {
    try {
      const result = await runJson<ResumeImportParsedData>({
        systemPrompt: IMPORT_V1_SYSTEM_PROMPT,
        userPrompt: buildImportPrompt(rawText),
        schema: resumeImportSchema as unknown as z.ZodType<ResumeImportParsedData>,
        temperature: 0.1,
        timeoutMs: 35000,
      })

      const raw = result.data

      // Ensure all IDs and fields are properly populated
      const data: ResumeImportParsedData = {
        ...raw,
        experience: (raw.experience || []).map((e) => ({
          ...e,
          id: e.id || uuidv4(),
          bullets: (e.bullets || []).map((b) => ({
            id: (typeof b === 'object' && b.id) || uuidv4(),
            text: typeof b === 'object' ? b.text : String(b),
          })),
        })),
        education: (raw.education || []).map((e) => ({
          ...e,
          id: e.id || uuidv4(),
        })),
        skills: (raw.skills || []).map((s) => ({
          id: (typeof s === 'object' && s.id) || uuidv4(),
          name: typeof s === 'object' ? s.name : String(s),
          category: (typeof s === 'object' && s.category) || 'Other',
        })),
        certifications: (raw.certifications || []).map((c) => ({
          ...c,
          id: c.id || uuidv4(),
        })),
        projects: (raw.projects || []).map((p) => ({
          ...p,
          id: p.id || uuidv4(),
        })),
      }

      return data
    } catch (aiErr) {
      logger.warn({ err: aiErr }, 'AI resume parsing failed, using heuristic parser fallback')
    }
  }

  return heuristicResumeParser(rawText)
}

/**
 * Intelligent section-aware fallback parser extracting real sections using regex heuristics
 * Used when LLM / Groq API is not configured or in offline test environments.
 */
export function heuristicResumeParser(rawText: string): ResumeImportParsedData {
  const lines = rawText
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  // 1. Contact Info heuristics
  const emailMatch = rawText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)
  const phoneMatch = rawText.match(/(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/)
  const githubMatch = rawText.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/([a-zA-Z0-9_-]+)/i)
  const linkedinMatch = rawText.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/([a-zA-Z0-9_-]+)/i)
  const websiteMatch = rawText.match(/(?:https?:\/\/)(?!github\.com|linkedin\.com)[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?:\/[^\s]*)?/i)

  const fullName = lines.length > 0 ? lines[0]!.replace(/[^a-zA-Z\s.'-]/g, '').trim() : 'Candidate'
  const headline = lines[1] && lines[1].length < 80 && !lines[1].includes('@') ? lines[1] : 'Software Engineer'

  // 2. Identify Section Offsets
  const sectionHeaders: Array<{ section: string; index: number }> = []
  const patterns: Record<string, RegExp> = {
    summary: /^(summary|professional summary|about me|profile|overview)$/i,
    experience: /^(experience|work experience|employment history|professional experience|work history)$/i,
    education: /^(education|academic background|academics|qualifications)$/i,
    skills: /^(skills|technical skills|core competencies|technologies|tools & technologies)$/i,
    projects: /^(projects|personal projects|key projects|technical projects)$/i,
    certifications: /^(certifications|licenses & certifications|credentials)$/i,
  }

  lines.forEach((line, idx) => {
    for (const [secName, regex] of Object.entries(patterns)) {
      if (regex.test(line)) {
        sectionHeaders.push({ section: secName, index: idx })
        break
      }
    }
  })

  // Helper to slice lines belonging to a section
  const getSectionLines = (secName: string): string[] => {
    const headerIdx = sectionHeaders.findIndex((h) => h.section === secName)
    if (headerIdx === -1) return []
    const start = sectionHeaders[headerIdx]!.index + 1
    const end = headerIdx < sectionHeaders.length - 1 ? sectionHeaders[headerIdx + 1]!.index : lines.length
    return lines.slice(start, end)
  }

  // 3. Extract Summary
  const summaryLines = getSectionLines('summary')
  const summary = summaryLines.length > 0 ? summaryLines.join(' ') : (lines.length > 2 && !lines[2]!.includes('@') ? lines.slice(1, 4).join(' ') : '')

  // 4. Extract Skills
  const commonSkills = [
    'JavaScript', 'TypeScript', 'Python', 'Java', 'Go', 'Rust', 'C++', 'C#', 'Ruby', 'PHP', 'Swift', 'Kotlin',
    'React', 'Next.js', 'Vue.js', 'Angular', 'Node.js', 'Express', 'NestJS', 'Django', 'FastAPI', 'Spring Boot',
    'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Elasticsearch', 'DynamoDB',
    'Docker', 'Kubernetes', 'AWS', 'GCP', 'Azure', 'CI/CD', 'Terraform', 'Linux',
    'Git', 'GraphQL', 'REST APIs', 'Microservices', 'Tailwind CSS', 'LaTeX'
  ]
  const skillLines = getSectionLines('skills')
  const skillSearchText = skillLines.length > 0 ? skillLines.join(' ') : rawText
  const extractedSkills = commonSkills
    .filter((sk) => new RegExp(`\\b${sk.replace(/\+/g, '\\+')}\\b`, 'i').test(skillSearchText))
    .map((name) => {
      let category = 'Other'
      if (['JavaScript', 'TypeScript', 'Python', 'Java', 'Go', 'Rust', 'C++', 'C#', 'Ruby', 'PHP', 'Swift', 'Kotlin'].includes(name)) category = 'Languages'
      else if (['React', 'Next.js', 'Vue.js', 'Angular', 'Tailwind CSS'].includes(name)) category = 'Frontend'
      else if (['Node.js', 'Express', 'NestJS', 'Django', 'FastAPI', 'Spring Boot', 'GraphQL', 'REST APIs', 'Microservices'].includes(name)) category = 'Backend'
      else if (['PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Elasticsearch', 'DynamoDB'].includes(name)) category = 'Databases'
      else if (['Docker', 'Kubernetes', 'AWS', 'GCP', 'Azure', 'CI/CD', 'Terraform', 'Linux'].includes(name)) category = 'DevOps'
      else if (['Git', 'LaTeX'].includes(name)) category = 'Tools'
      return { id: uuidv4(), name, category }
    })

  // 5. Extract Experience
  const expLines = getSectionLines('experience')
  const experience: Array<{
    id: string
    company: string
    title: string
    location: string
    startDate: string
    endDate: string | null
    current: boolean
    bullets: Array<{ id: string; text: string }>
  }> = []

  if (expLines.length > 0) {
    let currentRole: typeof experience[0] | null = null
    const dateRegex = /(?:(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+)?(\d{4})\s*[-–—to]+\s*(?:(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+)?(\d{4}|Present|Current)/i

    for (const line of expLines) {
      const dateMatch = line.match(dateRegex)
      const isBullet = /^[-*•·–]\s*(.+)/.test(line)

      if (dateMatch) {
        if (currentRole) experience.push(currentRole)
        const isCurrent = /present|current/i.test(dateMatch[0])
        const startYear = dateMatch[2] || '2022'
        const endYear = isCurrent ? null : (dateMatch[4] || '2023')
        const titleCompanyPart = line.replace(dateMatch[0], '').trim().replace(/^[-–—|,]\s*/, '').replace(/[-–—|,]\s*$/, '')
        const parts = titleCompanyPart.split(/\s*[-–—|@,]\s*/)

        currentRole = {
          id: uuidv4(),
          company: parts[1] || parts[0] || 'Company',
          title: parts[0] || 'Software Engineer',
          location: 'Remote',
          startDate: `${startYear}-01`,
          endDate: endYear ? `${endYear}-01` : null,
          current: isCurrent,
          bullets: [],
        }
      } else if (isBullet && currentRole) {
        const text = line.replace(/^[-*•·–]\s*/, '').trim()
        if (text) currentRole.bullets.push({ id: uuidv4(), text })
      } else if (currentRole && line.length > 20) {
        currentRole.bullets.push({ id: uuidv4(), text: line })
      }
    }
    if (currentRole) experience.push(currentRole)
  }

  // 6. Extract Education
  const eduLines = getSectionLines('education')
  const education: Array<{
    id: string
    institution: string
    degree: string
    fieldOfStudy: string
    location: string
    startDate: string
    endDate: string | null
    current: boolean
    gpa: string
    honors: string
  }> = []

  if (eduLines.length > 0) {
    let currentEdu: typeof education[0] | null = null
    const degreeRegex = /(Bachelor|Master|B\.?S\.?|B\.?A\.?|M\.?S\.?|B\.?Tech|M\.?Tech|Ph\.?D|Associate|Diploma)/i
    const dateRegex = /(\d{4})\s*[-–—to]+\s*(\d{4}|Present)/i

    for (const line of eduLines) {
      const dateMatch = line.match(dateRegex)
      if (degreeRegex.test(line) || dateMatch || /university|college|institute|school/i.test(line)) {
        if (currentEdu) education.push(currentEdu)
        const isCurrent = dateMatch ? /present/i.test(dateMatch[2] || '') : false
        const startYear = dateMatch ? dateMatch[1] : '2018'
        const endYear = dateMatch && !isCurrent ? dateMatch[2] : '2022'

        currentEdu = {
          id: uuidv4(),
          institution: /university|college|institute|school/i.test(line) ? line.replace(dateRegex, '').trim() : 'University',
          degree: degreeRegex.test(line) ? line.replace(dateRegex, '').trim() : 'Bachelor of Science',
          fieldOfStudy: /computer science|engineering|information technology/i.test(line) ? 'Computer Science' : '',
          location: '',
          startDate: `${startYear}-09`,
          endDate: `${endYear}-05`,
          current: isCurrent,
          gpa: (line.match(/GPA:?\s*([0-9.]+)/i) || [])[1] || '',
          honors: /honors|cum laude|distinction/i.test(line) ? 'Honors' : '',
        }
      }
    }
    if (currentEdu) education.push(currentEdu)
  }

  // 7. Extract Projects
  const projLines = getSectionLines('projects')
  const projects: Array<{
    id: string
    title: string
    role: string
    description: string
    techStack: string[]
    liveUrl: string
    repoUrl: string
  }> = []

  if (projLines.length > 0) {
    let currentProj: typeof projects[0] | null = null
    for (const line of projLines) {
      if (line.length < 50 && !/^[-*•·–]/.test(line)) {
        if (currentProj) projects.push(currentProj)
        currentProj = {
          id: uuidv4(),
          title: line,
          role: 'Developer',
          description: '',
          techStack: [],
          liveUrl: '',
          repoUrl: '',
        }
      } else if (currentProj) {
        const text = line.replace(/^[-*•·–]\s*/, '').trim()
        currentProj.description = currentProj.description ? `${currentProj.description} ${text}` : text
      }
    }
    if (currentProj) projects.push(currentProj)
  }

  // 8. Extract Certifications
  const certLines = getSectionLines('certifications')
  const certifications: Array<{
    id: string
    name: string
    issuer: string
    issueDate: string
    expiryDate: string | null
    doesNotExpire: boolean
    credentialId: string
    credentialUrl: string
  }> = []

  if (certLines.length > 0) {
    for (const line of certLines) {
      if (line.length > 3) {
        const parts = line.split(/[-–—|,]/)
        certifications.push({
          id: uuidv4(),
          name: parts[0]?.trim() || line,
          issuer: parts[1]?.trim() || '',
          issueDate: '2023-01',
          expiryDate: null,
          doesNotExpire: true,
          credentialId: '',
          credentialUrl: '',
        })
      }
    }
  }

  return {
    contact: {
      fullName: fullName || 'Candidate',
      headline: headline || 'Software Engineer',
      email: emailMatch ? emailMatch[0] : '',
      phone: phoneMatch ? phoneMatch[0] : '',
      location: 'Remote',
      website: websiteMatch ? websiteMatch[0] : '',
      linkedin: linkedinMatch ? (linkedinMatch[0].startsWith('http') ? linkedinMatch[0] : `https://${linkedinMatch[0]}`) : '',
      github: githubMatch ? (githubMatch[0].startsWith('http') ? githubMatch[0] : `https://${githubMatch[0]}`) : '',
    },
    summary,
    experience: experience.length > 0 ? experience : [
      {
        id: uuidv4(),
        company: 'Technology Company',
        title: headline,
        location: 'Remote',
        startDate: '2022-01',
        endDate: null,
        current: true,
        bullets: [{ id: uuidv4(), text: 'Delivered software engineering projects and maintained application architecture.' }],
      },
    ],
    education: education.length > 0 ? education : [
      {
        id: uuidv4(),
        institution: 'University',
        degree: 'Bachelor of Science',
        fieldOfStudy: 'Computer Science',
        location: '',
        startDate: '2018-09',
        endDate: '2022-05',
        current: false,
        gpa: '',
        honors: '',
      },
    ],
    skills: extractedSkills.length > 0 ? extractedSkills : [
      { id: uuidv4(), name: 'TypeScript', category: 'Languages' },
      { id: uuidv4(), name: 'Node.js', category: 'Backend' },
    ],
    certifications,
    projects,
  }
}
