import { z } from 'zod'

export const createTemplateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Template name is required')
    .max(100, 'Template name cannot exceed 100 characters'),
  description: z.string().trim().max(500, 'Description cannot exceed 500 characters').optional(),
  category: z
    .string()
    .trim()
    .max(50, 'Category cannot exceed 50 characters')
    .optional()
    .default('general'),
  latexCode: z
    .string()
    .min(10, 'LaTeX code must be at least 10 characters')
    .max(2_000_000, 'LaTeX code exceeds 2MB limit'),
})

export const updateTemplateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().max(500).optional(),
  category: z.string().trim().max(50).optional(),
  latexCode: z.string().min(10).max(2_000_000).optional(),
})

export const duplicateTemplateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
})

export const previewTemplateSchema = z.object({
  profileData: z.record(z.unknown()).optional(),
  latexOverride: z.string().max(2_000_000).optional(),
})
