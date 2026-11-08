/**
 * ATS Text Normalization, Keyword Alias Mapping & Boundary-Aware Matching
 * Complies with tasks BE-5.01 and BE-5.02.
 */

/**
 * Normalizes text for ATS analysis:
 * - Unicode NFKC normalization
 * - Unifies smart quotes, dashes, non-breaking spaces
 * - Collapses repeated whitespace
 */
export function normalizeText(text: string): string {
  if (!text) return ''

  return text
    .normalize('NFKC')
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, '-')
    .replace(/[\u00A0\u2007\u202F]/g, ' ')
    .replace(/\r\n|\r|\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Strips punctuation around tokens while preserving special tech chars (+, #, ., /, -)
 */
export function cleanKeywordString(keyword: string): string {
  if (!keyword) return ''
  return keyword
    .trim()
    .toLowerCase()
    .replace(/^[^\w+#./-]+|[^\w+#./-]+$/g, '')
}

/**
 * Core keyword synonym mapping table.
 * Maps canonical tech terms to common variations, abbreviations, and acronyms.
 */
export const KEYWORD_SYNONYMS: Record<string, string[]> = {
  // Languages
  javascript: ['js', 'ecmascript', 'es6', 'es2015', 'esnext'],
  typescript: ['ts'],
  python: ['py', 'python3', 'python 3'],
  golang: ['go', 'go-lang', 'go lang'],
  'c++': ['cpp', 'c plus plus'],
  'c#': ['csharp', 'c-sharp', 'c sharp'],
  '.net': ['dotnet', 'dot net', '.net core', 'asp.net'],
  java: ['java 17', 'java 11', 'java 8', 'java 21', 'jdk', 'jvm'],
  rust: ['rustlang', 'rust-lang'],
  ruby: ['ruby on rails', 'rails'],
  php: ['php8', 'php7'],
  sql: ['relational database', 'rdbms', 'structured query language'],
  nosql: ['non-relational database', 'document database'],

  // Frontend
  react: ['reactjs', 'react.js', 'react native'],
  vue: ['vuejs', 'vue.js', 'vue 3'],
  angular: ['angularjs', 'angular.js', 'angular 2+'],
  nextjs: ['next.js', 'next js'],
  nuxtjs: ['nuxt.js', 'nuxt js'],
  svelte: ['sveltekit', 'svelte.js'],
  redux: ['redux toolkit', 'rtk'],
  tailwind: ['tailwindcss', 'tailwind css'],
  html: ['html5'],
  css: ['css3'],
  sass: ['scss'],

  // Backend & Runtime
  nodejs: ['node.js', 'node', 'node js'],
  express: ['expressjs', 'express.js', 'express js'],
  nestjs: ['nest.js', 'nest js'],
  fastapi: ['fast-api'],
  django: ['django rest framework', 'drf'],
  flask: ['flask web framework'],
  springboot: ['spring boot', 'spring framework', 'spring'],
  graphql: ['gql', 'apollo graphql'],
  rest: ['restful', 'rest api', 'rest apis', 'restful api', 'restful apis'],

  // Databases & Caches
  postgresql: ['postgres', 'pgsql', 'psql'],
  mongodb: ['mongo', 'mongoose'],
  redis: ['redis cache'],
  elasticsearch: ['elastic search', 'elastic'],
  dynamodb: ['dynamo db'],
  cassandra: ['apache cassandra'],
  mysql: ['mariadb'],

  // Cloud & DevOps
  aws: ['amazon web services'],
  gcp: ['google cloud platform', 'google cloud'],
  azure: ['microsoft azure'],
  docker: ['containerization', 'containers', 'docker container'],
  kubernetes: ['k8s'],
  terraform: ['tf', 'hashicorp terraform', 'iac', 'infrastructure as code'],
  cicd: ['ci/cd', 'continuous integration', 'continuous deployment', 'ci cd'],
  github: ['git', 'gitlab', 'version control', 'vcs'],
  kafka: ['apache kafka'],
  rabbitmq: ['rabbit mq'],
  linux: ['unix', 'ubuntu', 'centos', 'debian', 'rhel'],

  // Architecture & Methodologies
  microservices: ['microservice', 'micro service', 'micro services'],
  serverless: ['aws lambda', 'cloud functions'],
  agile: ['scrum', 'kanban', 'sprint planning'],
  testing: ['unit testing', 'integration testing', 'e2e testing', 'tdd', 'test driven development'],
  jest: ['vitest', 'unit test runner'],

  // AI & Data
  'machine learning': ['ml'],
  'artificial intelligence': ['ai', 'generative ai', 'genai'],
  'deep learning': ['dl', 'neural networks'],
  nlp: ['natural language processing'],
  llm: ['large language model', 'large language models', 'llms'],
  pytorch: ['torch'],
  tensorflow: ['tf'],
}

// Build inverted alias dictionary for fast O(1) canonical resolution
const ALIAS_TO_CANONICAL = new Map<string, string>()

for (const [canonical, aliases] of Object.entries(KEYWORD_SYNONYMS)) {
  const normCanonical = cleanKeywordString(canonical)
  ALIAS_TO_CANONICAL.set(normCanonical, normCanonical)
  for (const alias of aliases) {
    ALIAS_TO_CANONICAL.set(cleanKeywordString(alias), normCanonical)
  }
}

/**
 * Resolves any keyword or alias to its canonical representation.
 */
export function canonicalizeKeyword(term: string): string {
  const cleaned = cleanKeywordString(term)
  if (!cleaned) return ''
  return ALIAS_TO_CANONICAL.get(cleaned) || cleaned
}

/**
 * Retrieves all recognized synonyms and aliases for a term.
 */
export function getSynonymVariants(term: string): string[] {
  const canonical = canonicalizeKeyword(term)
  const variants = new Set<string>()

  variants.add(cleanKeywordString(term))
  variants.add(canonical)

  const directSynonyms = KEYWORD_SYNONYMS[canonical]
  if (directSynonyms) {
    for (const syn of directSynonyms) {
      variants.add(cleanKeywordString(syn))
    }
  }

  // Also search if canonical is an alias in the map
  for (const [canonKey, aliases] of Object.entries(KEYWORD_SYNONYMS)) {
    if (canonKey === canonical || aliases.map(cleanKeywordString).includes(canonical)) {
      variants.add(canonKey)
      aliases.forEach((a) => variants.add(cleanKeywordString(a)))
    }
  }

  return Array.from(variants).filter((v) => v.length > 0)
}

/**
 * Escapes regex special characters except those commonly in tech names.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Constructs a boundary-aware RegExp pattern for a given term.
 * Handles symbol-terminating terms like C++, C#, .NET, CI/CD, Node.js without false positives.
 */
export function buildBoundaryRegex(term: string): RegExp {
  const escaped = escapeRegex(term)

  // Use boundary checks that treat identifier characters (letters, numbers, underscores, +, #)
  // as words, and whitespace/punctuation/brackets/string ends as boundaries.
  // Lookbehind for non-identifier character or start of string
  // Lookahead for non-identifier character or end of string
  const prefix = '(?<=^|[^a-zA-Z0-9+#_])'
  const suffix = '(?=$|[^a-zA-Z0-9+#_])'

  return new RegExp(`${prefix}${escaped}${suffix}`, 'gi')
}

export interface TermMatchResult {
  matched: boolean
  count: number
  matchedAs?: string
  variantsChecked: string[]
}

/**
 * Boundary-aware term matching algorithm against text (BE-5.02).
 * Checks the base term and its synonym aliases.
 */
export function matchTermInText(
  text: string,
  term: string,
  customSynonyms?: string[]
): TermMatchResult {
  if (!text || !term) {
    return {
      matched: false,
      count: 0,
      variantsChecked: term ? [term] : [],
    }
  }

  const normalizedText = normalizeText(text)
  const variants = customSynonyms && customSynonyms.length > 0
    ? Array.from(new Set([cleanKeywordString(term), ...customSynonyms.map(cleanKeywordString)]))
    : getSynonymVariants(term)

  let totalCount = 0
  let matchedAs: string | undefined

  for (const variant of variants) {
    if (!variant) continue
    const regex = buildBoundaryRegex(variant)
    const matches = normalizedText.match(regex)
    if (matches && matches.length > 0) {
      totalCount += matches.length
      if (!matchedAs) {
        matchedAs = variant
      }
    }
  }

  return {
    matched: totalCount > 0,
    count: totalCount,
    matchedAs,
    variantsChecked: variants,
  }
}
