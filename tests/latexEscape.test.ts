/**
 * LaTeX Escape Functions & Fuzz Tests (BE-3.12, BE-3.13, BE-3.14).
 */

import { describe, it, expect } from 'vitest'
import { escapeLatex, escapeLatexUrl } from '../src/latex/escape.js'

describe('LaTeX Escape & URL Sanitization (BE-3.12, BE-3.13, BE-3.14)', () => {
  describe('escapeLatex', () => {
    it('escapes all standard LaTeX special characters', () => {
      expect(escapeLatex('&')).toBe('\\&')
      expect(escapeLatex('%')).toBe('\\%')
      expect(escapeLatex('$')).toBe('\\$')
      expect(escapeLatex('#')).toBe('\\#')
      expect(escapeLatex('_')).toBe('\\_')
      expect(escapeLatex('{')).toBe('\\{')
      expect(escapeLatex('}')).toBe('\\}')
      expect(escapeLatex('~')).toBe('\\textasciitilde{}')
      expect(escapeLatex('^')).toBe('\\textasciicircum{}')
      expect(escapeLatex('\\')).toBe('\\textbackslash{}')
      expect(escapeLatex('<')).toBe('\\textless{}')
      expect(escapeLatex('>')).toBe('\\textgreater{}')
      expect(escapeLatex('|')).toBe('\\textbar{}')
    })

    it('translates typographic Unicode characters and quotes', () => {
      expect(escapeLatex('“Hello World”')).toBe("``Hello World''")
      expect(escapeLatex('‘Single’')).toBe("`Single'")
      expect(escapeLatex('Em—dash and En–dash')).toBe('Em---dash and En--dash')
      expect(escapeLatex('Dots…')).toBe('Dots\\ldots{}')
      expect(escapeLatex('Cost: €100, £50, ¥2000')).toBe(
        'Cost: \\texteuro{}100, \\pounds{}50, \\textyen{}2000'
      )
      expect(escapeLatex('Bullet • Item')).toBe('Bullet \\textbullet{} Item')
      expect(escapeLatex('Angle 90°')).toBe('Angle 90\\textdegree{}')
    })

    it('handles mixed strings with special characters and Unicode in a single pass without double escaping', () => {
      const input = 'C++ & C# Developer with 10% raise on $100k_{base} & "quotes"'
      const output = escapeLatex(input)
      expect(output).toBe(
        'C++ \\& C\\# Developer with 10\\% raise on \\$100k\\_\\{base\\} \\& "quotes"'
      )
      // Double escaping check: no backslashes in front of backslashes
      expect(output).not.toContain('\\textbackslash{}\\&')
    })

    it('handles empty, null, and undefined inputs gracefully', () => {
      expect(escapeLatex('')).toBe('')
      expect(escapeLatex(null as unknown as string)).toBe('')
      expect(escapeLatex(undefined as unknown as string)).toBe('')
    })

    it('fuzz testing with randomized strings', () => {
      const candidates = [
        '\\',
        '{',
        '}',
        '$',
        '&',
        '#',
        '^',
        '_',
        '~',
        '%',
        '<',
        '>',
        '|',
        '“',
        '”',
        '€',
        'a',
        '1',
        ' ',
        '\n',
      ]
      for (let iteration = 0; iteration < 100; iteration++) {
        let randomStr = ''
        const length = Math.floor(Math.random() * 50) + 5
        for (let j = 0; j < length; j++) {
          randomStr += candidates[Math.floor(Math.random() * candidates.length)]
        }
        const escaped = escapeLatex(randomStr)
        expect(typeof escaped).toBe('string')
        // Unescaped dangerous bare characters check:
        // A bare '%' causes a comment in LaTeX; all % should be preceded by backslash
        const barePercentMatches = escaped.match(/(?<!\\)%/)
        expect(barePercentMatches).toBeNull()
      }
    })
  })

  describe('escapeLatexUrl', () => {
    it('allows valid web URLs while escaping special query parameters', () => {
      const url = 'https://example.com/search?q=c++&filter=100%_bonus#section'
      const escaped = escapeLatexUrl(url)
      expect(escaped).toBe('https://example.com/search?q=c++\\&filter=100\\%\\_bonus\\#section')
    })

    it('strips dangerous URI schemes (javascript, data, vbscript, file)', () => {
      expect(escapeLatexUrl('javascript:alert(document.cookie)')).toBe('')
      expect(escapeLatexUrl('JAVASCRIPT:malicious()')).toBe('')
      expect(escapeLatexUrl('data:text/html;base64,...')).toBe('')
      expect(escapeLatexUrl('file:///etc/passwd')).toBe('')
      expect(escapeLatexUrl('vbscript:msgbox()')).toBe('')
    })

    it('handles empty and null inputs', () => {
      expect(escapeLatexUrl('')).toBe('')
      expect(escapeLatexUrl(null)).toBe('')
      expect(escapeLatexUrl(undefined)).toBe('')
    })
  })
})
