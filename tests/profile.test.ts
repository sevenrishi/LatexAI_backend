import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { app } from '../src/app.js'
import { generateTestToken } from './helpers/jwt.js'

describe('Profile CRUD & Completeness (Phase B)', () => {
  it('GET /api/v1/profile returns aggregated profile and completeness metrics (BE-2.03)', async () => {
    const token = await generateTestToken({ sub: 'usr_prof_101', email: 'prof101@example.com' })
    const res = await request(app).get('/api/v1/profile').set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toHaveProperty('id', 'usr_prof_101')
    expect(res.body.data).toHaveProperty('fullName')
    expect(res.body.data).toHaveProperty('experience')
    expect(res.body.data).toHaveProperty('education')
    expect(res.body.data).toHaveProperty('skills')
    expect(res.body.data).toHaveProperty('completeness')
    expect(res.body.data.completeness).toHaveProperty('tier')
    expect(res.body.data.completeness).toHaveProperty('missingSections')
  })

  it('PATCH /api/v1/profile updates contact info and summary (BE-2.04)', async () => {
    const token = await generateTestToken({ sub: 'usr_prof_101' })
    const res = await request(app)
      .patch('/api/v1/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({
        fullName: 'Jordan Taylor',
        headline: 'Staff Infrastructure Architect',
        summary:
          'Specializing in cloud resilience, LaTeX engines, and distributed caching systems.',
      })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.fullName).toBe('Jordan Taylor')
    expect(res.body.data.headline).toBe('Staff Infrastructure Architect')
  })

  describe('Generic Section CRUD & Bullet UUID Assignment (BE-2.05, BE-2.06)', () => {
    let createdExperienceId = ''

    it('POST /api/v1/profile/experience creates item with server-assigned bullet UUIDs', async () => {
      const token = await generateTestToken({ sub: 'usr_prof_101' })
      const res = await request(app)
        .post('/api/v1/profile/experience')
        .set('Authorization', `Bearer ${token}`)
        .send({
          company: 'Acme AI Systems',
          title: 'Senior Distributed Engineer',
          startDate: '2023-01',
          current: true,
          bullets: [
            'Spearheaded LLM microservice pipeline serving 10M requests daily.',
            { text: 'Optimized Docker container cold start times by 65%.' },
          ],
        })

      expect(res.status).toBe(201)
      expect(res.body.success).toBe(true)
      expect(res.body.data).toHaveProperty('id')
      createdExperienceId = res.body.data.id

      // Check bullets have stable IDs assigned
      expect(Array.isArray(res.body.data.bullets)).toBe(true)
      expect(res.body.data.bullets.length).toBe(2)
      expect(res.body.data.bullets[0]).toHaveProperty('id')
      expect(typeof res.body.data.bullets[0].id).toBe('string')
      expect(res.body.data.bullets[1]).toHaveProperty('id')
    })

    it('PUT /api/v1/profile/experience/:id updates the existing item', async () => {
      const token = await generateTestToken({ sub: 'usr_prof_101' })
      const res = await request(app)
        .put(`/api/v1/profile/experience/${createdExperienceId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          company: 'Acme AI Systems Corp',
          title: 'Lead Distributed Engineer',
          startDate: '2023-01',
          current: true,
          bullets: [{ text: 'Updated bullet description.' }],
        })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.company).toBe('Acme AI Systems Corp')
      expect(res.body.data.title).toBe('Lead Distributed Engineer')
    })

    it('DELETE /api/v1/profile/experience/:id removes the item', async () => {
      const token = await generateTestToken({ sub: 'usr_prof_101' })
      const res = await request(app)
        .delete(`/api/v1/profile/experience/${createdExperienceId}`)
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data).toHaveProperty('deleted', true)
    })
  })

  describe('Bulk Skills & Case-Insensitive Deduplication (BE-2.07)', () => {
    it('POST /profile/skills/bulk adds multiple skills avoiding duplicates case-insensitively', async () => {
      const token = await generateTestToken({ sub: 'usr_skills_user' })
      const res = await request(app)
        .post('/api/v1/profile/skills/bulk')
        .set('Authorization', `Bearer ${token}`)
        .send({
          skills: [
            { name: 'Rust', category: 'Languages' },
            { name: 'rust', category: 'Languages' }, // duplicate casing
            { name: 'GraphQL', category: 'Backend' },
          ],
        })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      const names = res.body.data.map((s: { name: string }) => s.name.toLowerCase())
      expect(names.filter((n: string) => n === 'rust').length).toBe(1)
    })
  })

  describe('Section Reordering (BE-2.08)', () => {
    it('PATCH /profile/:section/reorder persists user-defined order', async () => {
      const token = await generateTestToken({ sub: 'usr_reorder_user' })
      // First, get current profile to obtain skill IDs
      const getRes = await request(app)
        .get('/api/v1/profile')
        .set('Authorization', `Bearer ${token}`)
      const skills = getRes.body.data.skills
      if (skills.length >= 2) {
        const reversedIds = [skills[1].id, skills[0].id]
        const reorderRes = await request(app)
          .patch('/api/v1/profile/skills/reorder')
          .set('Authorization', `Bearer ${token}`)
          .send({ orderedIds: reversedIds })

        expect(reorderRes.status).toBe(200)
        expect(reorderRes.body.success).toBe(true)
        expect(reorderRes.body.data.skills[0].id).toBe(reversedIds[0])
      }
    })
  })

  describe('Resume Import Confirmation (BE-2.16)', () => {
    it('applies all imported sections and overrides without reverting to dummy data', async () => {
      const token = await generateTestToken({ sub: 'usr_import_real_999', email: 'real999@example.com' })
      const importPayload = {
        strategy: 'replace' as const,
        overrides: {
          contact: {
            fullName: 'Jane Doe',
            headline: 'Senior Full Stack Engineer',
            email: 'real999@example.com',
            phone: '+1 555 987 6543',
            location: 'San Francisco, CA',
            website: 'https://janedoe.dev',
            linkedin: 'https://linkedin.com/in/janedoe',
            github: 'https://github.com/janedoe',
          },
          summary: 'Experienced engineer with expertise in distributed systems.',
          experience: [
            {
              company: 'Cloud Corp',
              title: 'Principal Engineer',
              location: 'San Francisco, CA',
              startDate: '2022-01',
              endDate: null,
              current: true,
              bullets: ['Architected core infrastructure.', 'Led a team of 10 engineers.'],
            },
          ],
          education: [
            {
              institution: 'UC Berkeley',
              degree: 'Bachelor of Science',
              fieldOfStudy: 'Computer Science',
              startDate: '2016-09',
              endDate: '2020-05',
              current: false,
              grade: '3.9 GPA',
            },
          ],
          skills: [
            { name: 'TypeScript', category: 'Languages' },
            { name: 'Node.js', category: 'Backend' },
          ],
          certifications: [
            {
              name: 'AWS Solutions Architect',
              issuer: 'Amazon Web Services',
              issueDate: '2023-05',
              url: 'https://aws.cert/12345',
            },
          ],
          projects: [
            {
              title: 'Open Source Engine',
              role: 'Creator & Maintainer',
              url: 'https://github.com/janedoe/engine',
              startDate: '2021-01',
              endDate: '2022-01',
              bullets: ['Reached 5,000 GitHub stars.'],
            },
          ],
        },
      }

      const res = await request(app)
        .post('/api/v1/profile/import-resume/imp_real_test/confirm')
        .set('Authorization', `Bearer ${token}`)
        .send(importPayload)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      const data = res.body.data

      // Ensure profile matches Jane Doe, NOT dummy Alex Morgan
      expect(data.fullName).toBe('Jane Doe')
      expect(data.headline).toBe('Senior Full Stack Engineer')
      expect(data.email).toBe('real999@example.com')
      expect(data.phone).toBe('+1 555 987 6543')
      expect(data.location).toBe('San Francisco, CA')
      expect(data.website).toBe('https://janedoe.dev')
      expect(data.linkedin).toBe('https://linkedin.com/in/janedoe')
      expect(data.github).toBe('https://github.com/janedoe')
      expect(data.summary).toBe('Experienced engineer with expertise in distributed systems.')

      // Check experience
      expect(data.experience.length).toBe(1)
      expect(data.experience[0].company).toBe('Cloud Corp')
      expect(data.experience[0].title).toBe('Principal Engineer')
      expect(data.experience[0].bullets.length).toBe(2)
      expect(data.experience[0].bullets[0].text).toBe('Architected core infrastructure.')

      // Check education
      expect(data.education.length).toBe(1)
      expect(data.education[0].institution).toBe('UC Berkeley')
      expect(data.education[0].degree).toBe('Bachelor of Science')

      // Check skills
      expect(data.skills.length).toBe(2)
      const skillNames = data.skills.map((s: { name: string }) => s.name)
      expect(skillNames).toContain('TypeScript')
      expect(skillNames).toContain('Node.js')

      // Check certifications
      expect(data.certifications.length).toBe(1)
      expect(data.certifications[0].name).toBe('AWS Solutions Architect')

      // Check projects
      expect(data.projects.length).toBe(1)
      expect(data.projects[0].title).toBe('Open Source Engine')
    })
  })

  describe('Cross-User Isolation & Validation Guards (BE-2.10)', () => {
    it('rejects access to unknown section names with 400 Bad Request', async () => {
      const token = await generateTestToken({ sub: 'usr_prof_101' })
      const res = await request(app)
        .get('/api/v1/profile/invalid-section-name')
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(400)
      expect(res.body.success).toBe(false)
    })
  })
})
