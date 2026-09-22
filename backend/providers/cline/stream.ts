/**
 * Cline streaming completions.
 *
 * Same SSE shape as OpenRouter. The body is Cline's, so host routing is never
 * sent.
 */

import { describeError, messageFromBody, providerErrorIdentifier, readErrorBody } from '../errors'
import type { ChatRequest, ChatStopReason, ChatStreamEvent, ChatUsage, FetchLike } from '../types'
import { extractStreamParts } from '../opencode/reasoning'
import { ToolCallAccumulator } from '../opencode/toolCalls'
import { CHAT_COMPLETIONS_PATH, joinUrl } from './endpoints'
import { clineAuthHeaders } from './headers'
import { buildChatBody, type ChatBodyOptions } from './client'

export interface StreamChatOptions {
  baseUrl: string
  apiKey: string
  fetchImpl?: FetchLike
}

export interface StreamingClient {
  stream(request: ChatRequest, bodyOptions?: ChatBodyOptions): AsyncGenerator<ChatStreamEvent>
}

function toStopReason(finishReason: unknown): ChatStopReason {
  if (finishReason === 'length' || finishReason === 'max_tokens') return 'length'
  return 'stop'
}

function parseDataLine(line: string): unknown | null {
  const trimmed = line.trim()
  if (trimmed === '' || !trimmed.startsWith('data:')) return null
  const payload = trimmed.slice('data:'.length).trim()
  if (payload === '' || payload === '[DONE]') return null
  try {
    return JSON.parse(payload)
  } catch {
    return null
  }
}

interface StreamError {
  message: string
  errorStatus?: number
  errorCode?: string
}

interface Chunk {
  parts: ReturnType<typeof extractStreamParts>
  finishReason: unknown
  usage: unknown
  toolCallsDelta: unknown
  error: StreamError | null
}

function streamErrorFrom(body: unknown): StreamError {
  const identifier = providerErrorIdentifier(body)
  const record = typeof body === 'object' && body !== null ? body as { error?: unknown } : undefined
  const inner = typeof record?.error === 'object' && record.error !== null
    ? record.error as { code?: unknown }
    : undefined
  const code = typeof inner?.code === 'number' && Number.isFinite(inner.code) ? inner.code : undefined
  return {
    message: messageFromBody(body, 'Provider stream error'),
    ...(code === undefined ? {} : { errorStatus: code }),
    ...(identifier === '' ? {} : { errorCode: identifier }),
  }
}

function readChunk(body: unknown): Chunk {
  const empty: Chunk = {
    parts: [],
    finishReason: undefined,
    usage: undefined,
    toolCallsDelta: undefined,
    error: null,
  }

  if (typeof body !== 'object' || body === null) return empty
  const candidate = body as Record<string, unknown>

  if (candidate['error'] !== undefined && candidate['error'] !== null) {
    return { ...empty, error: streamErrorFrom(body) }
  }

  const choices = candidate['choices']
  if (!Array.isArray(choices) || choices.length === 0) {
    return { ...empty, usage: candidate['usage'] }
  }

  const first = choices[0] as { delta?: unknown; finish_reason?: unknown }
  const delta = first.delta
  const deltaRecord = typeof delta === 'object' && delta !== null ? (delta as Record<string, unknown>) : undefined

  return {
    parts: extractStreamParts(delta),
    finishReason: first.finish_reason,
    usage: candidate['usage'],
    toolCallsDelta: deltaRecord?.['tool_calls'],
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

function errorEvent(error: StreamError): ChatStreamEvent {
  return {
    type: 'error',
    message: error.message,
    ...(error.errorStatus === undefined ? {} : { errorStatus: error.errorStatus }),
    ...(error.errorCode === undefined ? {} : { errorCode: error.errorCode }),
  }
}

export function createStreamingClient(options: StreamChatOptions): StreamingClient {
  const doFetch = options.fetchImpl ?? fetch

  return {
    async *stream(request: ChatRequest, bodyOptions: ChatBodyOptions = {}): AsyncGenerator<ChatStreamEvent> {
      let response: Response
      try {
        response = await doFetch(joinUrl(options.baseUrl, CHAT_COMPLETIONS_PATH), {
          method: 'POST',
          headers: {
            ...clineAuthHeaders(options.apiKey),
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
          },
          body: JSON.stringify({
            ...buildChatBody(request, bodyOptions),
            stream: true,
            stream_options: { include_usage: true },
          }),
          ...(request.signal !== undefined ? { signal: request.signal } : {}),
        })
      } catch (error) {
        if (request.signal?.aborted === true) {
          yield { type: 'done', stopReason: 'aborted', usage: { input: 0, output: 0, total: 0 } }
          return
        }
        yield { type: 'error', message: describeError(error) }
        return
      }

      if (!response.ok) {
        const parsed = await readErrorBody(response)
        yield {
          type: 'error',
          message: messageFromBody(parsed, 'Streaming request failed with status ' + response.status),
          errorStatus: response.status,
          errorCode: providerErrorIdentifier(parsed),
        }
        return
      }

      if (response.body === null) {
        yield { type: 'error', message: 'Streaming response had no body' }
        return
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      const accumulator = new ToolCallAccumulator()
      let buffer = ''
      let sawDone = false
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

            if (line.trim() === 'data: [DONE]') sawDone = true
            const parsed = parseDataLine(line)
            if (parsed === null) continue

            const chunk = readChunk(parsed)
            if (chunk.error !== null) {
              yield errorEvent(chunk.error)
              return
            }
            yield* chunk.parts
            accumulator.add(chunk.toolCallsDelta)
            if (chunk.finishReason != null) finishReason = chunk.finishReason
            if (chunk.usage !== undefined) usage = chunk.usage
          }
        }

        if (buffer.trim() === 'data: [DONE]') sawDone = true
        const tail = parseDataLine(buffer)
        if (tail !== null) {
          const chunk = readChunk(tail)
          if (chunk.error !== null) {
            yield errorEvent(chunk.error)
            return
          }
          yield* chunk.parts
          accumulator.add(chunk.toolCallsDelta)
          if (chunk.finishReason != null) finishReason = chunk.finishReason
          if (chunk.usage !== undefined) usage = chunk.usage
        }
      } catch (error) {
        if (request.signal?.aborted === true) {
          yield { type: 'done', stopReason: 'aborted', usage: readUsage(usage) }
          return
        }
        yield { type: 'error', message: describeError(error) }
        return
      } finally {
        reader.releaseLock()
      }

      if (!sawDone && finishReason == null) {
        yield { type: 'error', message: 'Provider connection ended before the reply finished.' }
        return
      }

      const calls = accumulator.calls()
      if (calls.length > 0) {
        yield { type: 'tool_calls', toolCalls: calls }
      }

      yield { type: 'done', stopReason: toStopReason(finishReason), usage: readUsage(usage) }
    },
  }
}
