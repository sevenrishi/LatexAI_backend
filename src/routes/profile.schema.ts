import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'

export const bulletSchema = z
  .union([
    z
      .string()
      .min(1, 'Bullet point cannot be empty')
      .max(500, 'Bullet point exceeds 500 characters'),
    z.object({
      id: z.string().optional(),
      text: z
        .string()
        .min(1, 'Bullet point cannot be empty')
        .max(500, 'Bullet point exceeds 500 characters'),
    }),
  ])
  .transform((val) => {
    if (typeof val === 'string') {
      return { id: uuidv4(), text: val }
    }
    return { id: val.id || uuidv4(), text: val.text }
  })

export const experienceSchema = z.object({
  company: z.string().min(1, 'Company name is required').max(100),
  title: z.string().min(1, 'Job title is required').max(100),
  location: z.string().max(100).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}$/, 'startDate must be in YYYY-MM format'),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}$/, 'endDate must be in YYYY-MM format')
    .nullable()
    .optional(),
  current: z.boolean().default(false),
  bullets: z.array(bulletSchema).default([]),
})

export const educationSchema = z.object({
  institution: z.string().min(1, 'Institution is required').max(150),
  degree: z.string().min(1, 'Degree is required').max(100),
  fieldOfStudy: z.string().max(100).optional(),
  location: z.string().max(100).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}$/, 'startDate must be in YYYY-MM format'),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}$/, 'endDate must be in YYYY-MM format')
    .optional(),
  current: z.boolean().optional(),
  gpa: z.string().max(20).optional(),
  honors: z.string().max(150).optional(),
})

export const skillSchema = z.object({
  name: z.string().min(1, 'Skill name is required').max(50),
  category: z.string().min(1).max(50).default('Other'),
})

export const bulkSkillsSchema = z.object({
  skills: z
    .array(
      z.union([
        z.string().min(1).max(50),
        z.object({
          name: z.string().min(1).max(50),
          category: z.string().max(50).optional(),
        }),
      ])
    )
    .min(1, 'At least one skill must be provided'),
})

export const certificationSchema = z.object({
  name: z.string().min(1, 'Certification name is required').max(150),
  issuer: z.string().min(1, 'Issuer is required').max(100),
  issueDate: z.string().regex(/^\d{4}-\d{2}$/, 'issueDate must be in YYYY-MM format'),
  expiryDate: z
    .string()
    .regex(/^\d{4}-\d{2}$/, 'expiryDate must be in YYYY-MM format')
    .nullable()
    .optional(),
  doesNotExpire: z.boolean().default(false),
  credentialId: z.string().max(100).optional(),
  credentialUrl: z.string().url().max(300).optional().or(z.literal('')),
})

export const projectSchema = z.object({
  title: z.string().min(1, 'Project title is required').max(100),
  role: z.string().max(100).optional(),
  description: z.string().min(5, 'Description is required').max(1000),
  techStack: z.array(z.string().max(50)).default([]),
  liveUrl: z.string().url().max(300).optional().or(z.literal('')),
  repoUrl: z.string().url().max(300).optional().or(z.literal('')),
})

export const updateProfileSchema = z.object({
  fullName: z.string().max(100).optional(),
  headline: z.string().max(200).optional(),
  phone: z.string().max(30).optional(),
  location: z.string().max(100).optional(),
  summary: z.string().max(2000).optional(),
  website: z.string().url().max(200).optional().or(z.literal('')),
  github: z.string().max(200).optional().or(z.literal('')),
  linkedin: z.string().max(200).optional().or(z.literal('')),
  customLinks: z
    .array(
      z.object({
        id: z.string().optional(),
        label: z.string().min(1).max(50),
        url: z.string().url().max(200),
      })
    )
    .optional(),
  experience: z.array(z.any()).optional(),
  education: z.array(z.any()).optional(),
  skills: z.array(z.any()).optional(),
  certifications: z.array(z.any()).optional(),
  projects: z.array(z.any()).optional(),
})

export const reorderSchema = z
  .object({
    orderedIds: z.array(z.string()).optional(),
    order: z.array(z.string()).optional(),
  })
  .transform((val) => ({
    orderedIds: val.orderedIds || val.order || [],
  }))
  .refine((val) => val.orderedIds.length > 0, {
    message: 'orderedIds must contain at least one ID',
    path: ['orderedIds'],
  })

export const confirmImportSchema = z.object({
  strategy: z.enum(['merge', 'replace']).default('merge'),
  sections: z
    .object({
      contact: z.boolean().optional(),
      summary: z.boolean().optional(),
      experience: z.boolean().optional(),
      education: z.boolean().optional(),
      skills: z.boolean().optional(),
      certifications: z.boolean().optional(),
      projects: z.boolean().optional(),
    })
    .optional(),
  selectedData: z.record(z.any()).optional(),
  overrides: z.record(z.any()).optional(),
})
