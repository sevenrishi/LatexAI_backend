/**
 * Default ATS-Friendly Software Engineer LaTeX Template (Jake's Resume variant).
 * Complies with task BE-3.03.
 */

export const DEFAULT_SWE_TEMPLATE_ID = 'tpl_default_swe'
export const DEFAULT_SWE_TEMPLATE_NAME = 'Standard ATS Single Column'
export const DEFAULT_SWE_TEMPLATE_DESCRIPTION =
  'Clean, classic single-column layout engineered specifically for ATS parser legibility and top software engineering roles.'

export const DEFAULT_SWE_LATEX_CODE = `\\documentclass[letterpaper,10.8pt]{article}

\\usepackage{latexsym}
\\usepackage[empty]{fullpage}
\\usepackage{titlesec}
\\usepackage{marvosym}
\\usepackage[usenames,dvipsnames]{color}
\\usepackage{verbatim}
\\usepackage{enumitem}
\\usepackage[hidelinks]{hyperref}
\\usepackage{fancyhdr}
\\usepackage[english]{babel}
\\usepackage{tabularx}
\\usepackage{geometry}

\\geometry{left=0.5in,top=0.45in,right=0.5in,bottom=0.45in}

\\pagestyle{fancy}
\\fancyhf{}
\\fancyfoot{}
\\renewcommand{\\headrulewidth}{0pt}
\\renewcommand{\\footrulewidth}{0pt}

\\urlstyle{same}

\\raggedbottom
\\raggedright
\\setlength{\\tabcolsep}{0in}

% Sections formatting
\\titleformat{\\section}{
  \\vspace{-4pt}\\scshape\\raggedright\\large
}{}{0em}{}[\\color{black}\\titlerule \\vspace{-5pt}]

% Custom commands
\\newcommand{\\resumeItem}[1]{
  \\item\\small{
    {#1 \\vspace{-2pt}}
  }
}

\\newcommand{\\resumeSubheading}[4]{
  \\vspace{-2pt}\\item
    \\begin{tabular*}{0.98\\textwidth}[t]{l@{\\extracolsep{\\fill}}r}
      \\textbf{#1} & #2 \\\\
      \\textit{\\small#3} & \\textit{\\small #4} \\\\
    \\end{tabular*}\\vspace{-7pt}
}

\\newcommand{\\resumeProjectHeading}[2]{
  \\item
  \\begin{tabular*}{0.98\\textwidth}{l@{\\extracolsep{\\fill}}r}
    \\small#1 & #2 \\\\
  \\end{tabular*}\\vspace{-7pt}
}

\\newcommand{\\resumeSubHeadingListStart}{\\begin{itemize}[leftmargin=0.15in, label={}]}
\\newcommand{\\resumeSubHeadingListEnd}{\\end{itemize}}
\\newcommand{\\resumeItemListStart}{\\begin{itemize}[leftmargin=0.15in]}
\\newcommand{\\resumeItemListEnd}{\\end{itemize}\\vspace{-5pt}}

\\begin{document}

%----------HEADING----------
\\begin{center}
    \\textbf{\\Huge \\scshape {{FULL_NAME}}} \\\\ \\vspace{2pt}
    \\small {{HEADLINE}} \\\\ \\vspace{2pt}
    \\small {{LINKS_BLOCK}}
\\end{center}

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

\\end{document}
`
