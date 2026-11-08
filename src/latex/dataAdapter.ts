/**
 * Profile-to-Content Data Adapter.
 * Secures core entity attributes from model mutations and provides standardized
 * sample fixtures for template previews. Complies with task BE-3.17.
 */

import type { FullProfile } from '../services/profile.service.js'

/**
 * Standard sample profile fixture used for template previews (BE-3.10)
 */
export const SAMPLE_PROFILE: FullProfile = {
  id: 'usr_sample_fixture',
  email: 'alex.morgan@example.com',
  fullName: 'Alex Morgan',
  headline: 'Senior Full Stack Software Engineer',
  phone: '+1 (555) 019-2834',
  location: 'San Francisco, CA',
  summary:
    'Results-driven software engineer with 6+ years of experience designing, building, and scaling distributed web applications, cloud infrastructure, and microservices.',
  website: 'https://alexmorgan.dev',
  github: 'alexmorgan',
  linkedin: 'alexmorgan-dev',
  customLinks: [],
  completeness: {
    percentage: 100,
    tier: 'strong',
    sections: {
      contact: true,
      summary: true,
      experience: true,
      education: true,
      skills: true,
      projects: true,
      certifications: true,
    },
    missingSections: [],
  },
  experience: [
    {
      id: 'exp_1',
      title: 'Senior Software Engineer',
      company: 'Veloce Cloud Systems',
      location: 'San Francisco, CA',
      startDate: 'Jan 2022',
      endDate: null,
      current: true,
      bullets: [
        {
          id: 'b1',
          text: 'Architected and deployed a multi-tenant event processing pipeline in Go and Kafka handling over 50M events per day with p99 latency < 45ms.',
        },
        {
          id: 'b2',
          text: 'Spearheaded migration from legacy monolithic backend to modular Dockerized microservices, reducing AWS compute expenditure by 28%.',
        },
        {
          id: 'b3',
          text: 'Mentored 6 junior and mid-level engineers, established automated CI/CD security quality gates, and raised test coverage to 92%.',
        },
      ],
    },
    {
      id: 'exp_2',
      title: 'Software Engineer',
      company: 'Aperture Data Labs',
      location: 'New York, NY',
      startDate: 'Jun 2019',
      endDate: 'Dec 2021',
      current: false,
      bullets: [
        {
          id: 'b4',
          text: 'Designed and implemented real-time analytics dashboards using TypeScript, React, and GraphQL serving 100k+ monthly active users.',
        },
        {
          id: 'b5',
          text: 'Optimized PostgreSQL queries and normalized relational schema, reducing database lock contention and query execution times by 40%.',
        },
      ],
    },
  ],
  education: [
    {
      id: 'edu_1',
      institution: 'University of California, Berkeley',
      degree: 'Bachelor of Science',
      fieldOfStudy: 'Computer Science',
      location: 'Berkeley, CA',
      startDate: 'Aug 2015',
      endDate: 'May 2019',
      current: false,
      gpa: '3.85',
      honors: 'Dean’s Honors List',
    },
  ],
  skills: [
    { id: 'sk_1', name: 'TypeScript', category: 'Languages' },
    { id: 'sk_2', name: 'Python', category: 'Languages' },
    { id: 'sk_3', name: 'Go', category: 'Languages' },
    { id: 'sk_4', name: 'React', category: 'Frameworks' },
    { id: 'sk_5', name: 'Node.js', category: 'Frameworks' },
    { id: 'sk_6', name: 'Express', category: 'Frameworks' },
    { id: 'sk_7', name: 'PostgreSQL', category: 'Database & Cloud' },
    { id: 'sk_8', name: 'Redis', category: 'Database & Cloud' },
    { id: 'sk_9', name: 'Docker', category: 'Database & Cloud' },
    { id: 'sk_10', name: 'Kubernetes', category: 'Database & Cloud' },
  ],
  certifications: [
    {
      id: 'cert_1',
      name: 'AWS Certified Solutions Architect -- Associate',
      issuer: 'Amazon Web Services',
      issueDate: '2023',
      credentialId: 'AWS-89234812',
    },
  ],
  projects: [
    {
      id: 'proj_1',
      title: 'Distributed Rate Limiter Service',
      role: 'Creator & Maintainer',
      techStack: ['Go', 'Redis', 'gRPC'],
      description:
        'Engineered a high-throughput token-bucket rate limiter with sliding window logs benchmarked at 120,000 req/sec.',
      repoUrl: 'https://github.com/alexmorgan/rate-limiter',
    },
  ],
}

/**
 * Merges partial user profile data with default fallback values, ensuring all fields
 * are safely defined and strictly typed.
 */
export function adaptProfileForRendering(profile?: Partial<FullProfile> | null): FullProfile {
  if (!profile) {
    return SAMPLE_PROFILE
  }

  return {
    id: profile.id || SAMPLE_PROFILE.id,
    email: profile.email || SAMPLE_PROFILE.email,
    fullName: profile.fullName || SAMPLE_PROFILE.fullName,
    headline: profile.headline || '',
    phone: profile.phone || '',
    location: profile.location || '',
    summary: profile.summary || '',
    website: profile.website || '',
    github: profile.github || '',
    linkedin: profile.linkedin || '',
    customLinks: profile.customLinks || [],
    completeness: profile.completeness || SAMPLE_PROFILE.completeness,
    experience: profile.experience || [],
    education: profile.education || [],
    skills: profile.skills || [],
    certifications: profile.certifications || [],
    projects: profile.projects || [],
    onboardingCompleted: profile.onboardingCompleted ?? true,
    updatedAt: profile.updatedAt,
  }
}
