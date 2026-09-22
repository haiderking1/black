import { describeError, messageFromBody, providerErrorIdentifier, readErrorBody } from '../errors'
import type { ChatRequest, ChatStopReason, ChatStreamEvent, ChatUsage, FetchLike, ToolCall } from '../types'
import { accountIdFromAccessToken } from './oauth/jwt'
import { buildRequestBody } from './body'
import { compressRequestBodyZstd } from './compress'
import { clampPromptCacheKey, resolveCodexUrl } from './endpoints'
import { usageLimitMessage } from './errors'
import { buildCodexHeaders } from './headers'

export interface StreamChatOptions {
  baseUrl: string
  apiKey: string
  fetchImpl?: FetchLike
}

export interface StreamingClient {
  stream(request: ChatRequest): AsyncGenerator<ChatStreamEvent>
}

function toStopReason(status: unknown, incompleteReason: unknown, hasToolCalls: boolean): ChatStopReason {
  if (status === 'incomplete' && incompleteReason === 'max_output_tokens') return 'length'
  if (status === 'incomplete' || status === 'failed' || status === 'cancelled') return 'error'
  if (hasToolCalls) return 'stop'
  return 'stop'
}

function parseSseJson(payload: string): Record<string, unknown> | null {
  const data = payload.trim()
  if (data === '' || data === '[DONE]') return null
  try {
    const parsed: unknown = JSON.parse(data)
    if (typeof parsed !== 'object' || parsed === null) return null
    return parsed as Record<string, unknown>
  } catch {
    return null
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  return value as Record<string, unknown>
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

function readUsage(response: Record<string, unknown> | undefined): ChatUsage {
  const usage = asRecord(response?.['usage'])
  if (usage === undefined) return { input: 0, output: 0, total: 0 }
  const input = typeof usage['input_tokens'] === 'number' ? usage['input_tokens'] : 0
  const output = typeof usage['output_tokens'] === 'number' ? usage['output_tokens'] : 0
  const total = typeof usage['total_tokens'] === 'number' ? usage['total_tokens'] : input + output
  const details = asRecord(usage['input_tokens_details'])
  const cached = typeof details?.['cached_tokens'] === 'number' ? details['cached_tokens'] : 0
  const cacheWrite = typeof details?.['cache_write_tokens'] === 'number' ? details['cache_write_tokens'] : 0
  return {
    input: Math.max(0, input - cached - cacheWrite),
    output,
    total,
  }
}

interface PartialTool {
  callId: string
  itemId: string
  name: string
  arguments: string
}

class ToolAccumulator {
  private readonly byIndex = new Map<number, PartialTool>()

  open(index: number, item: Record<string, unknown>): void {
    this.byIndex.set(index, {
      callId: asString(item['call_id']) ?? '',
      itemId: asString(item['id']) ?? '',
      name: asString(item['name']) ?? '',
      arguments: asString(item['arguments']) ?? '',
    })
  }

  append(index: number, delta: string): void {
    const existing = this.byIndex.get(index)
    if (existing === undefined) return
    existing.arguments += delta
  }

  finish(index: number, item: Record<string, unknown>): void {
    const existing = this.byIndex.get(index) ?? {
      callId: '',
      itemId: '',
      name: '',
      arguments: '',
    }
    existing.callId = asString(item['call_id']) ?? existing.callId
    existing.itemId = asString(item['id']) ?? existing.itemId
    existing.name = asString(item['name']) ?? existing.name
    existing.arguments = asString(item['arguments']) ?? existing.arguments
    this.byIndex.set(index, existing)
  }

  calls(): ToolCall[] {
    const indexes = [...this.byIndex.keys()].sort((left, right) => left - right)
    const calls: ToolCall[] = []
    for (const index of indexes) {
      const partial = this.byIndex.get(index)
      if (partial === undefined || partial.name === '') continue
      const id =
        partial.itemId !== '' ? partial.callId + '|' + partial.itemId : partial.callId || 'call_' + String(index)
      calls.push({ id, name: partial.name, arguments: partial.arguments })
    }
    return calls
  }
}

function eventType(event: Record<string, unknown>): string {
  return typeof event['type'] === 'string' ? event['type'] : ''
}

function errorFromEvent(event: Record<string, unknown>): string | undefined {
  const type = eventType(event)
  if (type === 'error') return messageFromBody(event, 'Codex stream returned an error without details.')
  if (type === 'response.failed') {
    const response = asRecord(event['response'])
    return messageFromBody(response?.['error'], 'Codex response failed without error details.')
  }
  return undefined
}

function isTerminal(type: string): boolean {
  return type === 'response.completed' || type === 'response.incomplete' || type === 'response.done'
}

export function createStreamingClient(options: StreamChatOptions): StreamingClient {
  const doFetch = options.fetchImpl ?? fetch

  return {
    async *stream(request: ChatRequest): AsyncGenerator<ChatStreamEvent> {
      let accountId: string
      try {
        accountId = accountIdFromAccessToken(options.apiKey)
      } catch (error) {
        yield { type: 'error', message: describeError(error), errorCode: 'auth' }
        return
      }

      const sessionId = clampPromptCacheKey(request.sessionId)
      const headers = buildCodexHeaders({
        accessToken: options.apiKey,
        accountId,
        ...(sessionId !== undefined ? { sessionId } : {}),
      })
      const bodyJson = JSON.stringify(buildRequestBody(request))
      const compressed = compressRequestBodyZstd(bodyJson)
      if (compressed !== null) headers.set('content-encoding', 'zstd')
      const body: BodyInit = compressed !== null ? Buffer.from(compressed) : bodyJson

      let response: Response
      try {
        response = await doFetch(resolveCodexUrl(options.baseUrl), {
          method: 'POST',
          headers,
          body,
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
          message: usageLimitMessage(parsed, messageFromBody(parsed, 'Streaming request failed with status ' + String(response.status))),
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
      const tools = new ToolAccumulator()
      let buffer = ''
      let sawTerminal = false
      let finishStatus: unknown
      let incompleteReason: unknown
      let usageRecord: Record<string, unknown> | undefined
      let thinking = ''

      const onAbort = () => {
        void reader.cancel().catch(() => {})
      }
      request.signal?.addEventListener('abort', onAbort, { once: true })

      try {
        for (;;) {
          if (request.signal?.aborted === true) {
            yield { type: 'done', stopReason: 'aborted', usage: readUsage(usageRecord) }
            return
          }
          const { done, value } = await reader.read()
          buffer += done ? decoder.decode() : decoder.decode(value, { stream: true })
          buffer = buffer.replaceAll('\r\n', '\n')
          if (done && buffer.trim() !== '') buffer += '\n\n'

          let idx = buffer.indexOf('\n\n')
          while (idx !== -1) {
            const chunk = buffer.slice(0, idx)
            buffer = buffer.slice(idx + 2)

            const dataLines = chunk
              .split('\n')
              .filter((line) => line.startsWith('data:'))
              .map((line) => line.slice('data:'.length).trim())
            if (dataLines.length === 0) {
              idx = buffer.indexOf('\n\n')
              continue
            }
            const event = parseSseJson(dataLines.join('\n'))
            if (event === null) {
              idx = buffer.indexOf('\n\n')
              continue
            }

            const type = eventType(event)
            const streamError = errorFromEvent(event)
            if (streamError !== undefined) {
              yield { type: 'error', message: streamError, errorCode: asString(event['code']) }
              return
            }

            if (type === 'response.output_item.added') {
              const item = asRecord(event['item'])
              const outputIndex = typeof event['output_index'] === 'number' ? event['output_index'] : 0
              if (item?.['type'] === 'function_call') tools.open(outputIndex, item)
            } else if (type === 'response.reasoning_summary_text.delta' || type === 'response.reasoning_text.delta') {
              const delta = asString(event['delta'])
              if (delta !== undefined) {
                thinking += delta
                yield { type: 'thinking', text: delta }
              }
            } else if (type === 'response.reasoning_summary_part.done') {
              thinking += '\n\n'
              yield { type: 'thinking', text: '\n\n' }
            } else if (type === 'response.output_text.delta' || type === 'response.refusal.delta') {
              const delta = asString(event['delta'])
              if (delta !== undefined) yield { type: 'text', text: delta }
            } else if (type === 'response.function_call_arguments.delta') {
              const delta = asString(event['delta'])
              const outputIndex = typeof event['output_index'] === 'number' ? event['output_index'] : 0
              if (delta !== undefined) tools.append(outputIndex, delta)
            } else if (type === 'response.output_item.done') {
              const item = asRecord(event['item'])
              const outputIndex = typeof event['output_index'] === 'number' ? event['output_index'] : 0
              if (item?.['type'] === 'reasoning') {
                const thinkingSignature = JSON.stringify(item)
                const summary = Array.isArray(item['summary'])
                  ? item['summary']
                      .map((part) => asRecord(part)?.['text'])
                      .filter((text): text is string => typeof text === 'string')
                      .join('\n\n')
                  : ''
                if (summary !== '' && thinking === '') {
                  thinking = summary
                  yield { type: 'thinking', text: summary, thinkingSignature }
                } else {
                  yield { type: 'thinking', text: '', thinkingSignature }
                }
              } else if (item?.['type'] === 'function_call') {
                tools.finish(outputIndex, item)
              }
            } else if (isTerminal(type)) {
              sawTerminal = true
              const responseBody = asRecord(event['response'])
              finishStatus = responseBody?.['status']
              const incomplete = asRecord(responseBody?.['incomplete_details'])
              incompleteReason = incomplete?.['reason']
              usageRecord = responseBody
            }

            idx = buffer.indexOf('\n\n')
          }

          if (done) break
        }
      } catch (error) {
        if (request.signal?.aborted === true) {
          yield { type: 'done', stopReason: 'aborted', usage: readUsage(usageRecord) }
          return
        }
        yield { type: 'error', message: describeError(error) }
        return
      } finally {
        request.signal?.removeEventListener('abort', onAbort)
        try {
          await reader.cancel()
        } catch {
          // Already released.
        }
        try {
          reader.releaseLock()
        } catch {
          // Already released.
        }
      }

      if (!sawTerminal) {
        yield { type: 'error', message: 'Provider connection ended before the reply finished.' }
        return
      }

      const calls = tools.calls()
      if (calls.length > 0) yield { type: 'tool_calls', toolCalls: calls }

      yield {
        type: 'done',
        stopReason: toStopReason(finishStatus, incompleteReason, calls.length > 0),
        usage: readUsage(usageRecord),
      }
    },
  }
}
