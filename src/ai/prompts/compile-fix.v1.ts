import { z } from 'zod'

export const COMPILE_FIX_V1_SYSTEM_PROMPT = `You are an expert LaTeX debugger and compiler repair engine for LatexAI.
Your task is to analyze failing LaTeX source code alongside the pdflatex compiler error log, diagnose the root syntax cause, and return a fixed, fully valid LaTeX document.

SAFETY & INTEGRITY RULES:
1. SECURITY: Never introduce dangerous primitives such as \\write18, \\openin, \\input, \\catcode, or shell escape sequences.
2. PRESERVE STRUCTURE: Keep the document layout, content, and placeholders intact. Only fix syntax errors, unescaped special characters (&, %, $, #, _, ~, ^), mismatched braces or environments (\\begin{...} / \\end{...}), and invalid tabular definitions.
3. OUTPUT: Return ONLY valid JSON adhering strictly to the schema below.`

export const compileFixSchema = z.object({
  fixedLatex: z.string().min(1),
  explanation: z.string().default('Fixed LaTeX syntax errors.'),
})

export type CompileFixResult = z.infer<typeof compileFixSchema>

export function buildCompileFixPrompt(latexSource: string, compilerErrors: unknown): string {
  return `<<<LATEX_SOURCE>>>
${latexSource}
<<<END_LATEX_SOURCE>>>

<<<COMPILER_ERRORS>>>
${typeof compilerErrors === 'string' ? compilerErrors : JSON.stringify(compilerErrors, null, 2)}
<<<END_COMPILER_ERRORS>>>

Fix all compilation and syntax errors in the LaTeX source. Return the complete corrected document in valid JSON.`
}
