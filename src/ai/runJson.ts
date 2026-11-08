import { z } from 'zod'
import { callGroqChat, type GroqChatMessage } from './groq.js'
import { AppError } from '../utils/errors.js'
import { logger } from '../utils/logger.js'

export interface RunJsonOptions<T> {
  systemPrompt: string
  userPrompt: string
  schema: z.ZodType<T>
  model?: string
  temperature?: number
  maxValidationRetries?: number
  timeoutMs?: number
}

export interface RunJsonResult<T> {
  data: T
  usage: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
  totalLatencyMs: number
  model: string
  attempts: number
}

/**
 * Runs a structured JSON completion with automatic validation-error retry loops.
 */
export async function runJson<T>(options: RunJsonOptions<T>): Promise<RunJsonResult<T>> {
  const maxRetries = options.maxValidationRetries ?? 2
  const messages: GroqChatMessage[] = [
    { role: 'system', content: options.systemPrompt },
    { role: 'user', content: options.userPrompt },
  ]

  let attempts = 0
  let totalPromptTokens = 0
  let totalCompletionTokens = 0
  let totalTokens = 0
  let totalLatency = 0
  let lastModel = ''

  while (attempts <= maxRetries) {
    attempts++

    const result = await callGroqChat({
      messages,
      model: options.model,
      temperature: options.temperature ?? 0.1,
      responseFormat: { type: 'json_object' },
      timeoutMs: options.timeoutMs,
    })

    totalPromptTokens += result.usage.promptTokens
    totalCompletionTokens += result.usage.completionTokens
    totalTokens += result.usage.totalTokens
    totalLatency += result.latencyMs
    lastModel = result.model

    let rawJson: unknown
    try {
      rawJson = JSON.parse(result.content)
    } catch (parseErr) {
      logger.warn(
        { attempt: attempts, parseError: (parseErr as Error).message },
        'Failed to parse JSON response from LLM'
      )
      if (attempts > maxRetries) {
        throw AppError.unprocessable(
          `Failed to parse valid JSON from AI response after ${attempts} attempts: ${(parseErr as Error).message}`
        )
      }

      messages.push({ role: 'assistant', content: result.content })
      messages.push({
        role: 'user',
        content: `Your previous response was not valid JSON: ${(parseErr as Error).message}. Return ONLY valid JSON with no markdown wrapping.`,
      })
      continue
    }

    const validation = options.schema.safeParse(rawJson)
    if (validation.success) {
      return {
        data: validation.data,
        usage: {
          promptTokens: totalPromptTokens,
          completionTokens: totalCompletionTokens,
          totalTokens,
        },
        totalLatencyMs: totalLatency,
        model: lastModel,
        attempts,
      }
    }

    const errorIssues = validation.error.issues
      .map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`)
      .join('; ')

    logger.warn({ attempt: attempts, errorIssues }, 'AI output failed schema validation')

    if (attempts > maxRetries) {
      throw AppError.unprocessable(
        `AI output failed schema validation after ${attempts} attempts: ${errorIssues}`,
        { issues: validation.error.issues }
      )
    }

    // Add correction turn
    messages.push({ role: 'assistant', content: result.content })
    messages.push({
      role: 'user',
      content: `The JSON response did not match the required schema. Fix the following validation errors:\n${errorIssues}\nReturn the corrected JSON strictly matching the schema.`,
    })
  }

  throw AppError.unprocessable('Validation retries exhausted')
}
