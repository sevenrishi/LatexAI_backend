/**
 * Modern Minimalist Technical LaTeX Template.
 */

export const MINIMAL_TECH_TEMPLATE_ID = 'tpl_minimal_tech'
export const MINIMAL_TECH_TEMPLATE_NAME = 'Minimalist Tech Modern'
export const MINIMAL_TECH_TEMPLATE_DESCRIPTION =
  'High-density, contemporary monospace-accented layout designed for senior engineers and DevOps professionals.'

export const MINIMAL_TECH_LATEX_CODE = `\\documentclass[letterpaper,10pt]{article}

\\usepackage[utf8]{inputenc}
\\usepackage{geometry}
\\usepackage{titlesec}
\\usepackage{enumitem}
\\usepackage[hidelinks]{hyperref}
\\usepackage{xcolor}

\\geometry{margin=0.55in}

\\pagestyle{empty}
\\urlstyle{same}

% Custom section formatting
\\titleformat{\\section}{\\large\\bfseries\\uppercase}{}{0em}{}[\\titlerule]
\\titlespacing*{\\section}{0pt}{10pt}{6pt}

\\newcommand{\\resumeItem}[1]{\\item \\small{#1}}

\\newcommand{\\resumeSubheading}[4]{
  \\item
    \\begin{tabular*}{\\textwidth}[t]{l@{\\extracolsep{\\fill}}r}
      \\textbf{#1} & #2 \\\\
      \\textit{\\small#3} & \\textit{\\small #4} \\\\
    \\end{tabular*}\\vspace{-5pt}
}

\\newcommand{\\resumeProjectHeading}[2]{
  \\item
  \\begin{tabular*}{\\textwidth}{l@{\\extracolsep{\\fill}}r}
    \\small#1 & #2 \\\\
  \\end{tabular*}\\vspace{-5pt}
}

\\newcommand{\\resumeSubHeadingListStart}{\\begin{itemize}[leftmargin=*, label={}]}
\\newcommand{\\resumeSubHeadingListEnd}{\\end{itemize}}
\\newcommand{\\resumeItemListStart}{\\begin{itemize}[leftmargin=0.2in]}
\\newcommand{\\resumeItemListEnd}{\\end{itemize}\\vspace{-4pt}}

\\begin{document}

%----------HEADER----------
\\begin{flushleft}
  {\\LARGE \\bfseries {{FULL_NAME}}} \\\\ \\vspace{2pt}
  {\\normalsize \\color{darkgray} {{HEADLINE}}} \\\\ \\vspace{3pt}
  \\small {{LINKS_BLOCK}}
\\end{flushleft}

{{SUMMARY_BLOCK}}

{{EXPERIENCE_BLOCK}}

{{PROJECTS_BLOCK}}

{{EDUCATION_BLOCK}}

{{SKILLS_BLOCK}}

{{CERTIFICATIONS_BLOCK}}

\\end{document}
`
