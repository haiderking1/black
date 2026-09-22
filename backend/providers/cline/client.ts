/**
 * Cline chat completions.
 *
 * OpenAI-shaped. No OpenRouter host routing. Reasoning models get
 * `include_reasoning` so thinking tokens come back on the wire.
 */

import { ProviderError, codeFromStatus, describeError, messageFromBody, readErrorBody } from '../errors'
import type { ChatRequest, ChatResult, ChatStopReason, FetchLike } from '../types'
import { extractContent } from '../opencode/reasoning'
import { buildMessage } from '../opencode/message'
import { CHAT_COMPLETIONS_PATH, joinUrl } from './endpoints'
import { clineAuthHeaders } from './headers'

export interface ChatClientOptions {
  providerId: string
  baseUrl: string
  apiKey: string
  fetchImpl?: FetchLike
}

export interface ChatBodyOptions {
  includeReasoning?: boolean
}

interface ParsedCompletion {
  text: string
  thinking: string
  thinkingSignature?: string
  outputTokens: number
  inputTokens: number
  finishReason: string
}

const OMITTED_EFFORTS = new Set(['default', 'off'])

function toStopReason(finishReason: string): ChatStopReason {
  if (finishReason === 'length' || finishReason === 'max_tokens') return 'length'
  return 'stop'
}

function parseCompletion(body: unknown, providerId: string): ParsedCompletion {
  if (typeof body !== 'object' || body === null) {
    throw new ProviderError(providerId, 'malformed_response', 'Response was not an object')
  }

  const candidate = body as {
    error?: unknown
    choices?: unknown
    usage?: { prompt_tokens?: unknown; completion_tokens?: unknown }
  }

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
  const extracted = extractContent(first.message)
  const finishReason = typeof first.finish_reason === 'string' ? first.finish_reason : 'stop'
  const usage = candidate.usage ?? {}
  const inputTokens = typeof usage.prompt_tokens === 'number' ? usage.prompt_tokens : 0
  const outputTokens = typeof usage.completion_tokens === 'number' ? usage.completion_tokens : 0

  return { ...extracted, inputTokens, outputTokens, finishReason }
}

export function buildChatBody(request: ChatRequest, options: ChatBodyOptions = {}): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: request.model,
    messages: request.messages.map(buildMessage),
  }
  if (request.maxTokens !== undefined) body['max_tokens'] = request.maxTokens
  if (request.temperature !== undefined) body['temperature'] = request.temperature
  if (request.tools !== undefined && request.tools.length > 0) body['tools'] = request.tools

  const effort = request.reasoningEffort
  if (effort !== undefined && !OMITTED_EFFORTS.has(effort)) {
    body['reasoning'] = { effort }
  }
  if (options.includeReasoning === true) {
    body['include_reasoning'] = true
  }

  return body
}

export function createChatClient(options: ChatClientOptions) {
  const doFetch = options.fetchImpl ?? fetch

  return {
    async chat(request: ChatRequest, bodyOptions: ChatBodyOptions = {}): Promise<ChatResult> {
      let response: Response
      try {
        response = await doFetch(joinUrl(options.baseUrl, CHAT_COMPLETIONS_PATH), {
          method: 'POST',
          headers: {
            ...clineAuthHeaders(options.apiKey),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(buildChatBody(request, bodyOptions)),
          ...(request.signal !== undefined ? { signal: request.signal } : {}),
        })
      } catch (error) {
        if (request.signal?.aborted === true) {
          return { text: '', thinking: '', usage: { input: 0, output: 0, total: 0 }, stopReason: 'aborted' }
        }
        throw new ProviderError(
          options.providerId,
          'network',
          describeError(error),
        )
      }

      if (!response.ok) {
        const body = await readErrorBody(response)
        throw new ProviderError(
          options.providerId,
          codeFromStatus(response.status),
          messageFromBody(body, 'Request failed with status ' + response.status),
          response.status,
        )
      }

      let parsed: unknown
      try {
        parsed = await response.json()
      } catch {
        parsed = undefined
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
