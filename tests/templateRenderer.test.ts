/**
 * LaTeX Template Rendering & Section Renderers Tests (BE-3.15 - BE-3.18).
 */

import { describe, it, expect } from 'vitest'
import {
  renderLinksBlock,
  renderExperienceBlock,
  renderEducationBlock,
  renderSkillsBlock,
  renderProjectsBlock,
  renderCertificationsBlock,
  renderSummaryBlock,
} from '../src/latex/renderers.js'
import { adaptProfileForRendering, SAMPLE_PROFILE } from '../src/latex/dataAdapter.js'
import { renderTemplate } from '../src/latex/templateRenderer.js'
import { DEFAULT_SWE_LATEX_CODE } from '../src/latex/templates/defaultSwe.js'
import { MINIMAL_TECH_LATEX_CODE } from '../src/latex/templates/minimalTech.js'
import { extractPlaceholders } from '../src/latex/placeholders.js'

describe('Template Rendering & Data Adapter (BE-3.15 - BE-3.18)', () => {
  describe('Pure Section Renderers (BE-3.15)', () => {
    it('renderLinksBlock formats email, phone, and web links with safe LaTeX commands', () => {
      const output = renderLinksBlock({
        email: 'dev@example.com',
        phone: '+1-555-0199',
        location: 'Seattle, WA',
        website: 'https://johndoe.dev',
        linkedin: 'johndoe',
        github: 'johndoe',
      })

      expect(output).toContain('\\href{mailto:dev@example.com}{dev@example.com}')
      expect(output).toContain('\\href{tel:+15550199}{+1-555-0199}')
      expect(output).toContain('Seattle, WA')
      expect(output).toContain('\\href{https://johndoe.dev}{johndoe.dev}')
      expect(output).toContain('\\href{https://linkedin.com/in/johndoe}{LinkedIn}')
      expect(output).toContain('\\href{https://github.com/johndoe}{GitHub}')
    })

    it('renderExperienceBlock renders jobs and escaped bullet points', () => {
      const output = renderExperienceBlock([
        {
          id: 'exp1',
          company: 'Acme & Co.',
          title: 'Senior Engineer',
          location: 'Remote',
          startDate: '2021',
          endDate: '2023',
          current: false,
          bullets: [{ id: 'b1', text: 'Improved throughput by 40% using Redis & Go.' }],
        },
      ])

      expect(output).toContain('\\section{Experience}')
      expect(output).toContain('Acme \\& Co.')
      expect(output).toContain('Senior Engineer')
      expect(output).toContain('Improved throughput by 40\\% using Redis \\& Go.')
    })

    it('renderEducationBlock renders universities, degrees, and GPA', () => {
      const output = renderEducationBlock([
        {
          id: 'edu1',
          institution: 'MIT',
          degree: 'B.S.',
          fieldOfStudy: 'Computer Science',
          startDate: '2016',
          endDate: '2020',
          gpa: '3.9',
        },
      ])

      expect(output).toContain('\\section{Education}')
      expect(output).toContain('MIT')
      expect(output).toContain('B.S. in Computer Science')
      expect(output).toContain('GPA: 3.9')
    })

    it('renderSkillsBlock categorizes skills properly', () => {
      const output = renderSkillsBlock([
        { id: 's1', name: 'TypeScript', category: 'Languages' },
        { id: 's2', name: 'Go', category: 'Languages' },
        { id: 's3', name: 'PostgreSQL', category: 'Databases' },
      ])

      expect(output).toContain('\\section{Technical Skills}')
      expect(output).toContain('\\textbf{Languages}{: TypeScript, Go}')
      expect(output).toContain('\\textbf{Databases}{: PostgreSQL}')
    })

    it('renderProjectsBlock formats project headings and links', () => {
      const output = renderProjectsBlock([
        {
          id: 'p1',
          title: 'LaTeX Engine',
          techStack: ['Node.js', 'TeX Live'],
          liveUrl: 'https://latexai.test',
          description: 'High performance typesetting backend.',
        },
      ])

      expect(output).toContain('\\section{Projects}')
      expect(output).toContain('LaTeX Engine')
      expect(output).toContain('Node.js, TeX Live')
      expect(output).toContain('High performance typesetting backend.')
    })

    it('renderCertificationsBlock formats certificates', () => {
      const output = renderCertificationsBlock([
        {
          id: 'c1',
          name: 'CKA: Certified Kubernetes Administrator',
          issuer: 'Linux Foundation',
          issueDate: '2023',
        },
      ])

      expect(output).toContain('\\section{Certifications}')
      expect(output).toContain('CKA: Certified Kubernetes Administrator')
      expect(output).toContain('Linux Foundation')
    })

    it('renderSummaryBlock formats summary with section header', () => {
      const output = renderSummaryBlock('Dedicated staff engineer with 10 years experience.')
      expect(output).toContain('\\section{Summary}')
      expect(output).toContain('Dedicated staff engineer with 10 years experience.')
    })
  })

  describe('Data Adapter & Full Rendering (BE-3.16, BE-3.17, BE-3.18)', () => {
    it('adaptProfileForRendering provides safe defaults for null or empty profile', () => {
      const adapted = adaptProfileForRendering(null)
      expect(adapted.fullName).toBe(SAMPLE_PROFILE.fullName)
      expect(adapted.experience.length).toBeGreaterThan(0)
    })

    it('renders default SWE template cleanly with zero remaining placeholders', () => {
      const rendered = renderTemplate(DEFAULT_SWE_LATEX_CODE, SAMPLE_PROFILE)
      expect(rendered).toContain(SAMPLE_PROFILE.fullName)
      expect(rendered).toContain('\\documentclass')
      expect(rendered).toContain('\\begin{document}')
      expect(rendered).toContain('\\end{document}')

      // Verify no unresolved {{...}} placeholders remain in output
      const remainingPlaceholders = extractPlaceholders(rendered)
      expect(remainingPlaceholders).toEqual([])
    })

    it('renders minimal tech template cleanly with zero remaining placeholders', () => {
      const rendered = renderTemplate(MINIMAL_TECH_LATEX_CODE, SAMPLE_PROFILE)
      expect(rendered).toContain(SAMPLE_PROFILE.fullName)
      expect(rendered).toContain('\\documentclass')

      const remainingPlaceholders = extractPlaceholders(rendered)
      expect(remainingPlaceholders).toEqual([])
    })
  })
})
