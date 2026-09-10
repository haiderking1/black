/**
 * Inference calls.
 *
 * Zen and Go speak the OpenAI chat-completions shape, so one client serves both
 * and the base URL decides which. Failures are mapped onto ProviderError codes
 * rather than surfaced as raw HTTP, so a caller can retry a rate limit and fail
 * fast on an auth error.
 */

import { randomUUID } from 'node:crypto'

import { ProviderError, codeFromStatus, messageFromBody } from '../errors'
import type { ChatRequest, ChatResult, ChatStopReason, FetchLike } from '../types'
import { CHAT_COMPLETIONS_PATH, joinUrl } from './endpoints'
import { extractContent } from './reasoning'

export interface ChatClientOptions {
  providerId: string
  baseUrl: string
  apiKey: string
  fetchImpl?: FetchLike
}

interface ParsedCompletion {
  text: string
  thinking: string
  thinkingSignature?: string
  outputTokens: number
  inputTokens: number
  finishReason: string
}

/** Map the vendor's finish reason onto the stop reason black stores. */
function toStopReason(finishReason: string): ChatStopReason {
  if (finishReason === 'length' || finishReason === 'max_tokens') return 'length'
  return 'stop'
}

/** Read the first choice, tolerating a response without one. */
function parseCompletion(body: unknown, providerId: string): ParsedCompletion {
  if (typeof body !== 'object' || body === null) {
    throw new ProviderError(providerId, 'malformed_response', 'Response was not an object')
  }

  const candidate = body as {
    error?: unknown
    choices?: unknown
    usage?: { prompt_tokens?: unknown; completion_tokens?: unknown }
  }

  // A gateway can answer 200 with an error envelope, so it is checked here too.
  if (candidate.error !== undefined && candidate.error !== null) {
    throw new ProviderError(
      providerId,
      'server',
      messageFromBody(body, 'Provider returned an error'),
    )
  }

  const choices = candidate.choices
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new ProviderError(providerId, 'malformed_response', 'Response contained no choices')
  }

  const first = choices[0] as { message?: unknown; finish_reason?: unknown }
  // Reasoning models bury thinking in different places, so extraction is shared
  // rather than assumed to be a plain string.
  const extracted = extractContent(first.message)
  const finishReason = typeof first.finish_reason === 'string' ? first.finish_reason : 'stop'

  const usage = candidate.usage ?? {}
  const inputTokens = typeof usage.prompt_tokens === 'number' ? usage.prompt_tokens : 0
  const outputTokens = typeof usage.completion_tokens === 'number' ? usage.completion_tokens : 0

  return {
    ...extracted,
    inputTokens,
    outputTokens,
    finishReason,
  }
}

/** Header OpenCode Go requires to route a request. */
export const SESSION_HEADER = 'x-opencode-session'

export function createChatClient(options: ChatClientOptions) {
  const doFetch = options.fetchImpl ?? fetch
  // Used when a caller does not supply a conversation id. Stable for the life
  // of this client so related turns still land on one upstream.
  const fallbackSessionId = randomUUID()

  return {
    async chat(request: ChatRequest): Promise<ChatResult> {
      const body: Record<string, unknown> = {
        model: request.model,
        messages: request.messages.map((message) => {
          const wire: Record<string, unknown> = { role: message.role, content: message.content }
          // Hand an earlier turn's reasoning back, or the model re-derives
          // context it already produced and paid for.
          if (message.role === 'assistant' && message.thinkingSignature !== undefined) {
            try {
              wire['reasoning_details'] = JSON.parse(message.thinkingSignature)
            } catch {
              // An unreadable signature is dropped rather than sent as garbage.
            }
          }
          return wire
        }),
      }
      if (request.maxTokens !== undefined) body['max_tokens'] = request.maxTokens
      if (request.temperature !== undefined) body['temperature'] = request.temperature
      // 'default' means send nothing at all, leaving the model to decide.
      // 'off' is accepted too, for settings saved before it was renamed, and is
      // treated the same way rather than being sent as an unknown value.
      const effort = request.reasoningEffort
      if (effort !== undefined && effort !== 'default' && effort !== 'off') {
        body['reasoning_effort'] = effort
      }

      let response: Response
      try {
        response = await doFetch(joinUrl(options.baseUrl, CHAT_COMPLETIONS_PATH), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + options.apiKey,
            // Go rejects a request without this header outright, so it is always
            // sent rather than only when a caller thought to provide one.
            [SESSION_HEADER]: request.sessionId ?? fallbackSessionId,
          },
          body: JSON.stringify(body),
          ...(request.signal !== undefined ? { signal: request.signal } : {}),
        })
      } catch (error) {
        // An abort is a cancellation, not a failure to report as an error.
        if (request.signal?.aborted === true) {
          return { text: '', thinking: '', usage: { input: 0, output: 0, total: 0 }, stopReason: 'aborted' }
        }
        throw new ProviderError(
          options.providerId,
          'network',
          error instanceof Error ? error.message : String(error),
        )
      }

      let parsed: unknown
      try {
        parsed = await response.json()
      } catch {
        parsed = undefined
      }

      if (!response.ok) {
        throw new ProviderError(
          options.providerId,
          codeFromStatus(response.status),
          messageFromBody(parsed, 'Request failed with status ' + response.status),
          response.status,
        )
      }

      const completion = parseCompletion(parsed, options.providerId)
      return {
        text: completion.text,
        thinking: completion.thinking,
        ...(completion.thinkingSignature !== undefined
          ? { thinkingSignature: completion.thinkingSignature }
          : {}),
        usage: {
          input: completion.inputTokens,
          output: completion.outputTokens,
          total: completion.inputTokens + completion.outputTokens,
        },
        stopReason: toStopReason(completion.finishReason),
      }
    },
  }
}
