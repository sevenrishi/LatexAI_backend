import Groq from 'groq-sdk'
import { env } from '../config/env.js'
import { AppError } from '../utils/errors.js'
import { logger } from '../utils/logger.js'

export const DEFAULT_GROQ_MODEL = 'openai/gpt-oss-120b'
export const DEFAULT_GROQ_TIMEOUT_MS = 30000
export const MAX_GROQ_RETRIES = 3

let groqInstance: Groq | null = null

export function getGroqClient(): Groq {
  if (groqInstance) return groqInstance

  if (!env.GROQ_API_KEY) {
    throw AppError.internal('GROQ_API_KEY is not configured on the server.')
  }

  groqInstance = new Groq({
    apiKey: env.GROQ_API_KEY,
  })

  return groqInstance
}

/**
 * Checks if a real Groq API key is present and active (not a placeholder or test environment).
 */
export function isGroqConfigured(): boolean {
  return Boolean(
    env.GROQ_API_KEY && !env.GROQ_API_KEY.includes('placeholder') && env.NODE_ENV !== 'test'
  )
}

/**
 * Allows injecting a custom Groq client or mock for testing.
 */
export function setGroqClient(client: Groq | null): void {
  groqInstance = client
}

export interface GroqChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface GroqCallOptions {
  messages: GroqChatMessage[]
  model?: string
  temperature?: number
  responseFormat?: { type: 'json_object' | 'text' }
  maxRetries?: number
  timeoutMs?: number
}

export interface GroqCallResult {
  content: string
  usage: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
  latencyMs: number
  model: string
}

/**
 * Executes a chat completion against Groq with exponential backoff on 429 and 5xx errors.
 */
export async function callGroqChat(options: GroqCallOptions): Promise<GroqCallResult> {
  const client = getGroqClient()
  const model = options.model || DEFAULT_GROQ_MODEL
  const temperature = options.temperature ?? 0.1
  const responseFormat = options.responseFormat
  const maxRetries = options.maxRetries ?? MAX_GROQ_RETRIES
  const timeoutMs = options.timeoutMs ?? DEFAULT_GROQ_TIMEOUT_MS

  let attempt = 0
  let delayMs = 1000

  while (attempt <= maxRetries) {
    const startTime = Date.now()
    try {
      const response = await client.chat.completions.create(
        {
          model,
          messages: options.messages,
          temperature,
          ...(responseFormat ? { response_format: responseFormat } : {}),
        },
        {
          timeout: timeoutMs,
        }
      )

      const latencyMs = Date.now() - startTime
      const choice = response.choices?.[0]
      const content = choice?.message?.content || ''

      return {
        content,
        usage: {
          promptTokens: response.usage?.prompt_tokens ?? 0,
          completionTokens: response.usage?.completion_tokens ?? 0,
          totalTokens: response.usage?.total_tokens ?? 0,
        },
        latencyMs,
        model,
      }
    } catch (err: unknown) {
      attempt++
      const latencyMs = Date.now() - startTime
      const errorObj = err as Record<string, unknown>
      const status = typeof errorObj.status === 'number' ? errorObj.status : 500
      const isRetryable = status === 429 || (status >= 500 && status <= 599)

      logger.warn(
        { attempt, maxRetries, status, latencyMs, err: (err as Error).message },
        'Groq API call failed'
      )

      if (attempt > maxRetries || !isRetryable) {
        throw AppError.internal(`Groq API request failed (${status}): ${(err as Error).message}`, {
          status,
          originalError: (err as Error).message,
        })
      }

      // Exponential backoff with jitter
      const jitter = Math.floor(Math.random() * 300)
      await new Promise((resolve) => setTimeout(resolve, delayMs + jitter))
      delayMs *= 2
    }
  }

  throw AppError.internal('Groq call retries exhausted')
}
