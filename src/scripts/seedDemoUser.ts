import { env } from '../config/env.js'
import { supabaseAdmin } from '../db/supabase.js'
import { logger } from '../utils/logger.js'

async function seedDemoUser() {
  if (env.NODE_ENV === 'production') {
    throw new Error('FATAL: seedDemoUser script cannot be run in production environment!')
  }

  logger.info('Starting local demo user seed...')

  const demoEmail = 'demo@latexai.dev'
  const demoPassword = 'DemoPassword123!'
  const demoFullName = 'Alex Rivera'

  // If using placeholder Supabase credentials in local mock mode
  if (
    env.SUPABASE_URL.includes('placeholder') ||
    env.SUPABASE_SERVICE_ROLE_KEY.includes('placeholder')
  ) {
    logger.info(
      { demoEmail, demoPassword },
      'Local mock Supabase detected. Demo credentials documented.'
    )
    return
  }

  try {
    // 1. Check if user already exists
    const { data: usersData, error: listError } = await supabaseAdmin.auth.admin.listUsers()
    if (listError) {
      logger.warn({ listError }, 'Could not query Supabase auth users list')
    }

    let userId: string | null = null
    const existing = usersData?.users.find((u) => u.email === demoEmail)

    if (existing) {
      userId = existing.id
      logger.info({ userId }, 'Existing demo user found.')
    } else {
      // 2. Create demo user
      const { data: createData, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: demoEmail,
        password: demoPassword,
        email_confirm: true,
        user_metadata: {
          full_name: demoFullName,
          email_verified: true,
        },
      })

      if (createError) {
        throw createError
      }

      userId = createData.user.id
      logger.info({ userId }, 'Successfully created demo auth user.')
    }

    // 3. Upsert demo profile
    const { error: profileError } = await supabaseAdmin.from('profiles').upsert({
      id: userId,
      email: demoEmail,
      full_name: demoFullName,
      headline: 'Senior Full Stack & AI Systems Engineer',
      phone: '+1 555-0149',
      location: 'San Francisco, CA',
      summary:
        'Senior Engineer with 8+ years building enterprise SaaS, LaTeX typesetting pipelines, and large language model systems.',
      links: [
        { id: 'lnk_1', label: 'GitHub', url: 'https://github.com/alexrivera' },
        { id: 'lnk_2', label: 'LinkedIn', url: 'https://linkedin.com/in/alexrivera' },
      ],
      onboarding_completed: true,
      active_template_id: 'tpl_default_swe',
      target_role: 'Senior Full Stack Engineer',
      industry: 'Technology / AI',
      experience_level: 'Senior',
      updated_at: new Date().toISOString(),
    })

    if (profileError) {
      logger.warn({ profileError }, 'Profile upsert warning')
    } else {
      logger.info('Demo profile successfully seeded in profiles table.')
    }

    logger.info(
      {
        email: demoEmail,
        password: demoPassword,
        userId,
      },
      'Demo user seed process finished successfully.'
    )
  } catch (err) {
    logger.error({ err }, 'Error during demo user seed execution')
  }
}

seedDemoUser()
  .then(() => {
    console.info('Seed completed successfully.')
    process.exit(0)
  })
  .catch((err) => {
    console.error('Seed failed:', err)
    process.exit(1)
  })
