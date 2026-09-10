/**
 * Streaming completions.
 *
 * Asking for a stream makes the vendor reply with server-sent events: one JSON
 * object per `data:` line, ending with `data: [DONE]`. Each object carries a
 * fragment of the answer rather than the whole thing.
 *
 * Text and reasoning arrive on the same delta fields as a non-streaming
 * response, so the same extractor reads both and the two stay consistent.
 */

import { messageFromBody } from '../errors'
import type { ChatStopReason, ChatStreamEvent, ChatUsage, FetchLike } from '../types'
import { CHAT_COMPLETIONS_PATH, joinUrl } from './endpoints'
import { extractContent } from './reasoning'

export type { ChatStreamEvent } from '../types'

export interface StreamChatRequest {
  model: string
  messages: readonly { role: 'system' | 'user' | 'assistant'; content: string }[]
  maxTokens?: number
  reasoningEffort?: string
  sessionId?: string
  signal?: AbortSignal
}

export interface StreamingClient {
  stream(request: StreamChatRequest): AsyncGenerator<ChatStreamEvent>
}

export interface StreamChatOptions {
  baseUrl: string
  apiKey: string
  fetchImpl?: FetchLike
}

/** Values meaning "send no reasoning parameter", in either vocabulary. */
const OMITTED_EFFORTS = new Set(['default', 'off'])

function toStopReason(finishReason: unknown): ChatStopReason {
  if (finishReason === 'length' || finishReason === 'max_tokens') return 'length'
  return 'stop'
}

/** Read one `data:` payload, or null when the line carries nothing to parse. */
function parseDataLine(line: string): unknown | null {
  const trimmed = line.trim()
  if (trimmed === '' || !trimmed.startsWith('data:')) return null
  const payload = trimmed.slice('data:'.length).trim()
  if (payload === '' || payload === '[DONE]') return null
  try {
    return JSON.parse(payload)
  } catch {
    // A malformed frame is skipped rather than killing the stream: the next
    // frame usually carries the rest of the answer.
    return null
  }
}

interface Chunk {
  text: string
  thinking: string
  finishReason: unknown
  usage: unknown
  error: string | null
}

/** Pull the delta, finish reason, and usage out of one decoded chunk. */
function readChunk(body: unknown): Chunk {
  const empty: Chunk = { text: '', thinking: '', finishReason: undefined, usage: undefined, error: null }

  if (typeof body !== 'object' || body === null) return empty
  const candidate = body as Record<string, unknown>

  if (candidate['error'] !== undefined && candidate['error'] !== null) {
    return { ...empty, error: messageFromBody(body, 'Provider stream error') }
  }

  const choices = candidate['choices']
  if (!Array.isArray(choices) || choices.length === 0) {
    // A final chunk may carry usage with no choices when the request asked for it.
    return { ...empty, usage: candidate['usage'] }
  }

  const first = choices[0] as { delta?: unknown; finish_reason?: unknown }
  const delta = first.delta
  const extracted = extractContent(delta)

  return {
    text: extracted.text,
    thinking: extracted.thinking,
    finishReason: first.finish_reason,
    usage: candidate['usage'],
    error: null,
  }
}

function readUsage(value: unknown): ChatUsage {
  if (typeof value !== 'object' || value === null) return { input: 0, output: 0, total: 0 }
  const record = value as Record<string, unknown>
  const input = typeof record['prompt_tokens'] === 'number' ? record['prompt_tokens'] : 0
  const output = typeof record['completion_tokens'] === 'number' ? record['completion_tokens'] : 0
  const total = typeof record['total_tokens'] === 'number' ? record['total_tokens'] : input + output
  return { input, output, total }
}

function buildBody(request: StreamChatRequest): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: request.model,
    messages: request.messages.map((message) => ({ role: message.role, content: message.content })),
    stream: true,
    // Without this the final chunk carries no usage, so a streamed turn would
    // report zero tokens.
    stream_options: { include_usage: true },
  }
  if (request.maxTokens !== undefined) body['max_tokens'] = request.maxTokens
  if (request.reasoningEffort !== undefined && !OMITTED_EFFORTS.has(request.reasoningEffort)) {
    body['reasoning_effort'] = request.reasoningEffort
  }
  return body
}

export function createStreamingClient(options: StreamChatOptions): StreamingClient {
  const doFetch = options.fetchImpl ?? fetch

  return {
    async *stream(request: StreamChatRequest): AsyncGenerator<ChatStreamEvent> {
      let response: Response
      try {
        response = await doFetch(joinUrl(options.baseUrl, CHAT_COMPLETIONS_PATH), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
            Authorization: 'Bearer ' + options.apiKey,
            ...(request.sessionId !== undefined ? { 'x-opencode-session': request.sessionId } : {}),
          },
          body: JSON.stringify(buildBody(request)),
          ...(request.signal !== undefined ? { signal: request.signal } : {}),
        })
      } catch (error) {
        if (request.signal?.aborted === true) {
          yield { type: 'done', stopReason: 'aborted', usage: { input: 0, output: 0, total: 0 } }
          return
        }
        yield { type: 'error', message: error instanceof Error ? error.message : String(error) }
        return
      }

      if (!response.ok) {
        let parsed: unknown
        try {
          parsed = await response.json()
        } catch {
          parsed = undefined
        }
        yield {
          type: 'error',
          message: messageFromBody(parsed, 'Streaming request failed with status ' + response.status),
        }
        return
      }

      if (response.body === null) {
        yield { type: 'error', message: 'Streaming response had no body' }
        return
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let finishReason: unknown
      let usage: unknown

      try {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })

          let newline = buffer.indexOf('\n')
          while (newline !== -1) {
            const line = buffer.slice(0, newline)
            buffer = buffer.slice(newline + 1)
            newline = buffer.indexOf('\n')

            const parsed = parseDataLine(line)
            if (parsed === null) continue

            const chunk = readChunk(parsed)
            if (chunk.error !== null) {
              yield { type: 'error', message: chunk.error }
              return
            }
            if (chunk.text !== '') yield { type: 'text', text: chunk.text }
            if (chunk.thinking !== '') yield { type: 'thinking', text: chunk.thinking }
            if (chunk.finishReason !== undefined) finishReason = chunk.finishReason
            if (chunk.usage !== undefined) usage = chunk.usage
          }
        }

        // A final line without a trailing newline still counts.
        const tail = parseDataLine(buffer)
        if (tail !== null) {
          const chunk = readChunk(tail)
          if (chunk.error !== null) {
            yield { type: 'error', message: chunk.error }
            return
          }
          if (chunk.text !== '') yield { type: 'text', text: chunk.text }
          if (chunk.thinking !== '') yield { type: 'thinking', text: chunk.thinking }
          if (chunk.finishReason !== undefined) finishReason = chunk.finishReason
          if (chunk.usage !== undefined) usage = chunk.usage
        }
      } catch (error) {
        yield { type: 'error', message: error instanceof Error ? error.message : String(error) }
        return
      } finally {
        reader.releaseLock()
      }

      yield { type: 'done', stopReason: toStopReason(finishReason), usage: readUsage(usage) }
    },
  }
}
