/**
 * High-fidelity Fallback PDF Generator.
 * Parses rendered LaTeX resume templates and produces fully valid, standard-compliant
 * PDF 1.4 documents with built-in Type 1 fonts (Helvetica, Helvetica-Bold, Helvetica-Oblique)
 * when the LaTeX compiler service is unavailable or encounters environment errors.
 */

function sanitizePdfText(str: string): string {
  return str
    .replace(/[—–]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[•·]/g, '-')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
}

function wordWrap(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let current = ''
  for (const w of words) {
    if (!w) continue
    if ((current + ' ' + w).trim().length <= maxChars) {
      current = (current + ' ' + w).trim()
    } else {
      if (current) lines.push(current)
      current = w
    }
  }
  if (current) lines.push(current)
  return lines
}

interface ParsedSection {
  title: string
  content: string
}

export function generateFallbackPdf(latex: string): {
  pdfBuffer: Buffer
  pageCount: number
} {
  // 1. Extract Candidate Name
  const nameMatch =
    latex.match(/\{\\(?:LARGE|Huge)\s+\\bfseries\s+([^}]+)\}/i) ||
    latex.match(/\\textbf\{\\Huge\s+([^}]+)\}/i) ||
    latex.match(/\\textbf\{\\LARGE\s+([^}]+)\}/i)
  const candidateName = nameMatch && nameMatch[1] ? nameMatch[1].trim() : 'Resume'

  // 2. Extract Headline / Role
  const headlineMatch =
    latex.match(/\{\\normalsize[^}]*\s+([^}]+)\}\s*\\\\/) ||
    latex.match(/\{\\large[^}]*\s+([^}]+)\}\s*\\\\/)
  const headline = headlineMatch && headlineMatch[1]
    ? headlineMatch[1].replace(/\\color\{[^}]+\}/g, '').trim()
    : ''

  // 3. Extract Contact Details
  const emailMatch = latex.match(/mailto:([^}]+)/)
  const phoneMatch = latex.match(/tel:([^}]+)/)
  const locationMatch = latex.match(/\|\s*([A-Za-z\s,]+?)\s*\|/)
  const contactParts: string[] = []
  if (emailMatch && emailMatch[1]) contactParts.push(emailMatch[1].trim())
  if (phoneMatch && phoneMatch[1]) contactParts.push(phoneMatch[1].trim())
  if (locationMatch && locationMatch[1]) contactParts.push(locationMatch[1].trim())

  // Links (LinkedIn, GitHub)
  if (latex.includes('linkedin.com')) contactParts.push('LinkedIn')
  if (latex.includes('github.com')) contactParts.push('GitHub')

  // 4. Extract Sections
  const sections: ParsedSection[] = []
  const sectionRegex = /\\section\{([^}]+)\}([\s\S]*?)(?=\\section\{|\\end\{document\}|$)/gi
  let secMatch: RegExpExecArray | null
  while ((secMatch = sectionRegex.exec(latex)) !== null) {
    if (secMatch[1] && secMatch[2]) {
      sections.push({
        title: secMatch[1].trim(),
        content: secMatch[2].trim(),
      })
    }
  }

  // 5. Layout and Drawing Commands
  const pages: string[] = []
  let commands: string[] = []
  let y = 754
  const margin = 36
  const pageWidth = 612
  const pageHeight = 792
  const bottomLimit = 42

  function startNewPage() {
    if (commands.length > 0) {
      pages.push(commands.join('\n'))
    }
    commands = []
    y = 754
  }

  function checkPageBreak(needed: number) {
    if (y - needed < bottomLimit) {
      startNewPage()
    }
  }

  // Header on Page 1
  commands.push('BT')
  commands.push('/F1 18 Tf')
  commands.push('0 0 0 rg')
  commands.push(`${margin} ${y} Td`)
  commands.push(`(${sanitizePdfText(candidateName)}) Tj`)
  commands.push('ET')
  y -= 20

  if (headline) {
    commands.push('BT')
    commands.push('/F3 10.5 Tf')
    commands.push('0.25 0.25 0.25 rg')
    commands.push(`${margin} ${y} Td`)
    commands.push(`(${sanitizePdfText(headline)}) Tj`)
    commands.push('ET')
    y -= 15
  }

  if (contactParts.length > 0) {
    commands.push('BT')
    commands.push('/F2 8.5 Tf')
    commands.push('0.2 0.2 0.2 rg')
    commands.push(`${margin} ${y} Td`)
    commands.push(`(${sanitizePdfText(contactParts.join('   |   '))}) Tj`)
    commands.push('ET')
    y -= 13
  }

  // Header bottom divider line
  y -= 3
  commands.push(`0.75 w 0.2 0.2 0.2 RG ${margin} ${y} m ${pageWidth - margin} ${y} l S`)
  y -= 14

  // Render each section
  for (const sec of sections) {
    checkPageBreak(45)

    // Section title
    commands.push('BT')
    commands.push('/F1 10.5 Tf')
    commands.push('0.1 0.1 0.1 rg')
    commands.push(`${margin} ${y} Td`)
    commands.push(`(${sanitizePdfText(sec.title.toUpperCase())}) Tj`)
    commands.push('ET')
    y -= 3

    // Section divider rule
    commands.push(`0.5 w 0.5 0.5 0.5 RG ${margin} ${y} m ${pageWidth - margin} ${y} l S`)
    y -= 11

    const lowerTitle = sec.title.toLowerCase()

    if (
      lowerTitle.includes('summary') ||
      lowerTitle.includes('profile') ||
      lowerTitle.includes('about')
    ) {
      const plainText = sec.content
        .replace(/\\begin\{[^}]+\}|\\end\{[^}]+\}/g, ' ')
        .replace(/\\vspace\{[^}]+\}/g, ' ')
        .replace(/\\[a-zA-Z]+/g, ' ')
        .replace(/[{}]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
      const lines = wordWrap(plainText, 94)
      for (const line of lines) {
        checkPageBreak(12)
        commands.push('BT')
        commands.push('/F2 9 Tf')
        commands.push('0.15 0.15 0.15 rg')
        commands.push(`${margin} ${y} Td`)
        commands.push(`(${sanitizePdfText(line)}) Tj`)
        commands.push('ET')
        y -= 11.5
      }
      y -= 6
    } else if (
      lowerTitle.includes('experience') ||
      lowerTitle.includes('employment') ||
      lowerTitle.includes('work')
    ) {
      const subheadings = sec.content.split(/\\resumeSubheading/g).slice(1)
      for (const sh of subheadings) {
        checkPageBreak(36)
        const parts: string[] = []
        const re = /\{([^}]+)\}/g
        let m: RegExpExecArray | null
        while ((m = re.exec(sh)) !== null && parts.length < 4) {
          const part = m[1]
          if (part !== undefined) {
            parts.push(part.trim())
          }
        }
        const role = parts[0] || ''
        const period = parts[1] || ''
        const company = parts[2] || ''
        const loc = parts[3] || ''

        // Role title & Period
        commands.push('BT')
        commands.push('/F1 9.5 Tf')
        commands.push('0 0 0 rg')
        commands.push(`${margin} ${y} Td`)
        commands.push(`(${sanitizePdfText(role)}) Tj`)
        commands.push('ET')

        if (period) {
          commands.push('BT')
          commands.push('/F3 8.5 Tf')
          commands.push('0.2 0.2 0.2 rg')
          commands.push(`${pageWidth - margin - 110} ${y} Td`)
          commands.push(`(${sanitizePdfText(period)}) Tj`)
          commands.push('ET')
        }
        y -= 11

        // Company & Location
        commands.push('BT')
        commands.push('/F3 9 Tf')
        commands.push('0.15 0.15 0.15 rg')
        commands.push(`${margin} ${y} Td`)
        commands.push(`(${sanitizePdfText(company)}) Tj`)
        commands.push('ET')

        if (loc) {
          commands.push('BT')
          commands.push('/F2 8.5 Tf')
          commands.push('0.25 0.25 0.25 rg')
          commands.push(`${pageWidth - margin - 110} ${y} Td`)
          commands.push(`(${sanitizePdfText(loc)}) Tj`)
          commands.push('ET')
        }
        y -= 11

        // Bullets
        const itemRe = /\\resumeItem\{([\s\S]*?)\}/g
        let im: RegExpExecArray | null
        while ((im = itemRe.exec(sh)) !== null) {
          if (!im[1]) continue
          const bulletRaw = im[1]
            .replace(/\\%/g, '%')
            .replace(/\\textbf\{([^}]+)\}/g, '$1')
            .replace(/\\emph\{([^}]+)\}/g, '$1')
            .replace(/\\[a-zA-Z]+/g, ' ')
            .replace(/[{}]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
          const bLines = wordWrap(bulletRaw, 88)
          for (let i = 0; i < bLines.length; i++) {
            const lineText = bLines[i] ?? ''
            checkPageBreak(12)
            commands.push('BT')
            commands.push('/F2 8.5 Tf')
            commands.push('0.15 0.15 0.15 rg')
            if (i === 0) {
              commands.push(`${margin + 8} ${y} Td`)
              commands.push(`(- ${sanitizePdfText(lineText)}) Tj`)
            } else {
              commands.push(`${margin + 16} ${y} Td`)
              commands.push(`(${sanitizePdfText(lineText)}) Tj`)
            }
            commands.push('ET')
            y -= 11
          }
          y -= 1.5
        }
        y -= 4
      }
    } else if (lowerTitle.includes('project')) {
      const projRe = /\\resumeProjectHeading[\s\S]*?\{([\s\S]*?)\}\s*\{([^}]*)\}/g
      let pm: RegExpExecArray | null
      while ((pm = projRe.exec(sec.content)) !== null) {
        if (!pm[1]) continue
        checkPageBreak(25)
        const cleanHeader = pm[1]
          .replace(/\\textbf\{([^}]+)\}/g, '$1')
          .replace(/\\emph\{([^}]+)\}/g, '$1')
          .replace(/\\small/g, '')
          .replace(/\s+/g, ' ')
          .trim()
        commands.push('BT')
        commands.push('/F1 9 Tf')
        commands.push('0 0 0 rg')
        commands.push(`${margin} ${y} Td`)
        commands.push(`(${sanitizePdfText(cleanHeader)}) Tj`)
        commands.push('ET')
        y -= 12
      }

      // Render bullet points in projects
      const itemRe = /\\resumeItem\{([\s\S]*?)\}/g
      let im: RegExpExecArray | null
      while ((im = itemRe.exec(sec.content)) !== null) {
        if (!im[1]) continue
        const bulletRaw = im[1]
          .replace(/\\%/g, '%')
          .replace(/\\textbf\{([^}]+)\}/g, '$1')
          .replace(/\\[a-zA-Z]+/g, ' ')
          .replace(/[{}]/g, '')
          .replace(/\s+/g, ' ')
          .trim()
        const bLines = wordWrap(bulletRaw, 88)
        for (let i = 0; i < bLines.length; i++) {
          const lineText = bLines[i] ?? ''
          checkPageBreak(12)
          commands.push('BT')
          commands.push('/F2 8.5 Tf')
          commands.push('0.15 0.15 0.15 rg')
          if (i === 0) {
            commands.push(`${margin + 8} ${y} Td`)
            commands.push(`(- ${sanitizePdfText(lineText)}) Tj`)
          } else {
            commands.push(`${margin + 16} ${y} Td`)
            commands.push(`(${sanitizePdfText(lineText)}) Tj`)
          }
          commands.push('ET')
          y -= 11
        }
        y -= 1.5
      }
      y -= 4
    } else {
      // Generic section (Skills, Education, etc.)
      const itemRe = /\\resumeItem\{([\s\S]*?)\}/g
      let im: RegExpExecArray | null
      let foundItems = false
      while ((im = itemRe.exec(sec.content)) !== null) {
        if (!im[1]) continue
        foundItems = true
        const text = im[1]
          .replace(/\\textbf\{([^}]+)\}/g, '$1')
          .replace(/\\emph\{([^}]+)\}/g, '$1')
          .replace(/\\[a-zA-Z]+/g, ' ')
          .replace(/[{}]/g, '')
          .replace(/\s+/g, ' ')
          .trim()
        const lines = wordWrap(text, 92)
        for (const line of lines) {
          checkPageBreak(12)
          commands.push('BT')
          commands.push('/F2 8.5 Tf')
          commands.push('0.15 0.15 0.15 rg')
          commands.push(`${margin + 6} ${y} Td`)
          commands.push(`(${sanitizePdfText(line)}) Tj`)
          commands.push('ET')
          y -= 11.5
        }
        y -= 2
      }

      if (!foundItems) {
        const plainText = sec.content
          .replace(/\\begin\{[^}]+\}|\\end\{[^}]+\}/g, ' ')
          .replace(/\\[a-zA-Z]+/g, ' ')
          .replace(/[{}]/g, '')
          .replace(/\s+/g, ' ')
          .trim()
        const lines = wordWrap(plainText, 94)
        for (const line of lines) {
          checkPageBreak(12)
          commands.push('BT')
          commands.push('/F2 8.5 Tf')
          commands.push(`${margin} ${y} Td`)
          commands.push(`(${sanitizePdfText(line)}) Tj`)
          commands.push('ET')
          y -= 11.5
        }
      }
      y -= 6
    }
  }

  // Push final page
  if (commands.length > 0) {
    pages.push(commands.join('\n'))
  }

  // 6. Build PDF 1.4 Binary Document
  const numPages = Math.max(1, pages.length)
  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []

  const pageObjIds: number[] = []
  for (let i = 0; i < numPages; i++) {
    pageObjIds.push(6 + i * 2)
  }

  // 1 0 obj: Catalog
  offsets.push(Buffer.byteLength(pdf, 'utf8'))
  pdf += '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n'

  // 2 0 obj: Pages
  offsets.push(Buffer.byteLength(pdf, 'utf8'))
  const kidsStr = pageObjIds.map((id) => `${id} 0 R`).join(' ')
  pdf += `2 0 obj\n<< /Type /Pages /Kids [${kidsStr}] /Count ${numPages} >>\nendobj\n`

  // 3 0 obj: Font F1 (Helvetica-Bold)
  offsets.push(Buffer.byteLength(pdf, 'utf8'))
  pdf += '3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n'

  // 4 0 obj: Font F2 (Helvetica)
  offsets.push(Buffer.byteLength(pdf, 'utf8'))
  pdf += '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n'

  // 5 0 obj: Font F3 (Helvetica-Oblique)
  offsets.push(Buffer.byteLength(pdf, 'utf8'))
  pdf += '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>\nendobj\n'

  // Page and Content Stream Objects
  for (let i = 0; i < numPages; i++) {
    const pageId = pageObjIds[i] ?? (6 + i * 2)
    const streamId = pageId + 1
    const streamContent = pages[i] || 'BT /F1 12 Tf 50 700 Td (Resume) ET'
    const streamLen = Buffer.byteLength(streamContent, 'utf8')

    // Page object with Font Resources
    offsets.push(Buffer.byteLength(pdf, 'utf8'))
    pdf += `${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ${streamId} 0 R >>\nendobj\n`

    // Stream object
    offsets.push(Buffer.byteLength(pdf, 'utf8'))
    pdf += `${streamId} 0 obj\n<< /Length ${streamLen} >>\nstream\n${streamContent}\nendstream\nendobj\n`
  }

  const totalObjects = 5 + numPages * 2
  const startxref = Buffer.byteLength(pdf, 'utf8')
  pdf += `xref\n0 ${totalObjects + 1}\n0000000000 65535 f \n`
  for (const off of offsets) {
    pdf += String(off).padStart(10, '0') + ' 00000 n \n'
  }
  pdf += `trailer\n<< /Size ${totalObjects + 1} /Root 1 0 R >>\nstartxref\n${startxref}\n%%EOF\n`

  return {
    pdfBuffer: Buffer.from(pdf, 'utf8'),
    pageCount: numPages,
  }
}
