import { describeError, messageFromBody, providerErrorIdentifier, readErrorBody } from '../errors'
import type { ChatRequest, ChatStopReason, ChatStreamEvent, ChatUsage, FetchLike } from '../types'
import { experientialInput, experientialTools } from './messages'
import { ExperientialToolCalls } from './toolCalls'
import { EXPERIENTIAL_RESPONSES_PATH, joinExperientialUrl } from './endpoints'
const OMITTED_EFFORTS = new Set(['default', 'off'])

export interface ExperientialResponsesOptions {
  baseUrl: string
  apiKey: string
  fetchImpl?: FetchLike
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

function eventPayload(frame: string): Record<string, unknown> | undefined {
  const data = frame.split('\n').filter(line => line.startsWith('data:'))
    .map(line => line.slice('data:'.length).trim()).join('\n')
  if (data === '' || data === '[DONE]') return undefined
  try { return record(JSON.parse(data)) } catch { return undefined }
}

function usageFromResponse(response: Record<string, unknown> | undefined): ChatUsage {
  const usage = record(response?.usage)
  if (usage === undefined) return { input: 0, output: 0, total: 0 }
  const input = typeof usage.input_tokens === 'number' ? usage.input_tokens : 0
  const output = typeof usage.output_tokens === 'number' ? usage.output_tokens : 0
  const total = typeof usage.total_tokens === 'number' ? usage.total_tokens : input + output
  return { input, output, total }
}

function buildBody(request: ChatRequest): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: request.model,
    input: experientialInput(request.messages),
    store: false,
    stream: true,
    include: ['reasoning.encrypted_content'],
    // The gateway may return a readable reasoning summary on Responses. Raw
    // reasoning stays encrypted and is only kept for secure replay.
    reasoning: { summary: 'auto' },
  }
  if (request.reasoningEffort !== undefined && !OMITTED_EFFORTS.has(request.reasoningEffort)) {
    (body.reasoning as Record<string, unknown>).effort = request.reasoningEffort
  }
  if (request.maxTokens !== undefined) body.max_output_tokens = request.maxTokens
  if (request.temperature !== undefined) body.temperature = request.temperature
  if (request.tools !== undefined && request.tools.length > 0) body.tools = experientialTools(request.tools)
  return body
}

function outputIndex(event: Record<string, unknown>): number {
  const value = event.output_index
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0
}

function readToolItem(accumulator: ExperientialToolCalls, index: number, value: unknown, finished: boolean): void {
  const item = record(value)
  if (item?.type !== 'function_call') return
  if (finished) accumulator.finished(index, item)
  else accumulator.opened(index, item)
}

function terminalReason(type: string, response: Record<string, unknown> | undefined): ChatStopReason {
  if (type === 'response.incomplete') {
    const details = record(response?.incomplete_details)
    return details?.reason === 'max_output_tokens' ? 'length' : 'error'
  }
  return 'stop'
}

export function createExperientialResponsesClient(options: ExperientialResponsesOptions) {
  const doFetch = options.fetchImpl ?? fetch
  const url = joinExperientialUrl(options.baseUrl, EXPERIENTIAL_RESPONSES_PATH)

  return {
    async *stream(request: ChatRequest): AsyncGenerator<ChatStreamEvent> {
      let response: Response
      try {
        response = await doFetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
            Authorization: 'Bearer ' + options.apiKey,
          },
          body: JSON.stringify(buildBody(request)),
          ...(request.signal === undefined ? {} : { signal: request.signal }),
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
        const body = await readErrorBody(response)
        yield {
          type: 'error',
          message: messageFromBody(body, 'Experiential request failed with status ' + response.status),
          errorStatus: response.status,
          errorCode: providerErrorIdentifier(body),
        }
        return
      }
      if (response.body === null) {
        yield { type: 'error', message: 'Experiential streaming response had no body' }
        return
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      const tools = new ExperientialToolCalls()
      let buffer = ''
      let sawTerminal = false
      let emittedSummary = false
      let finishReason: ChatStopReason = 'stop'
      let usage: ChatUsage = { input: 0, output: 0, total: 0 }
      let aborting = false
      const onAbort = () => {
        aborting = true
        void reader.cancel().catch(() => {})
      }
      request.signal?.addEventListener('abort', onAbort, { once: true })
      if (request.signal?.aborted === true) onAbort()

      const processFrame = function* (frame: string): Generator<ChatStreamEvent> {
        const event = eventPayload(frame)
        if (event === undefined) return
        const type = stringValue(event.type) ?? ''

        if (type === 'error' || type === 'response.failed') {
          const failedResponse = record(event.response)
          const error = event.error ?? failedResponse?.error
          yield { type: 'error', message: messageFromBody(error ?? event, 'Experiential response failed.') }
          sawTerminal = true
          finishReason = 'error'
          return
        }

        if (type === 'response.output_text.delta') {
          const delta = stringValue(event.delta)
          if (delta !== undefined) yield { type: 'text', text: delta }
          return
        }

        if (type === 'response.reasoning_summary_text.delta') {
          const delta = stringValue(event.delta)
          if (delta !== undefined) {
            emittedSummary = true
            yield { type: 'thinking', text: delta }
          }
          return
        }

        if (type === 'response.reasoning_summary_text.done') {
          const summary = stringValue(event.text)
          if (!emittedSummary && summary !== undefined) {
            emittedSummary = true
            yield { type: 'thinking', text: summary }
          }
          return
        }

        if (type === 'response.output_item.added') {
          readToolItem(tools, outputIndex(event), event.item, false)
          return
        }

        if (type === 'response.function_call_arguments.delta') {
          const delta = stringValue(event.delta)
          if (delta !== undefined) tools.appendArguments(outputIndex(event), delta)
          return
        }

        if (type === 'response.output_item.done') {
          const item = record(event.item)
          if (item?.type === 'function_call') readToolItem(tools, outputIndex(event), item, true)
          if (item?.type === 'reasoning') {
            if (!emittedSummary && Array.isArray(item.summary)) {
              const summary = item.summary.map(part => stringValue(record(part)?.text)).filter((text): text is string => text !== undefined).join('\n\n')
              if (summary !== '') {
                emittedSummary = true
                yield { type: 'thinking', text: summary }
              }
            }
            // The payload is opaque encrypted replay data, never display it as thinking text.
            yield { type: 'thinking', text: '', thinkingSignature: JSON.stringify(item) }
          }
          return
        }

        if (type === 'response.completed' || type === 'response.incomplete' || type === 'response.done') {
          const final = record(event.response)
          sawTerminal = true
          finishReason = terminalReason(type, final)
          usage = usageFromResponse(final)
        }
      }

      try {
        for (;;) {
          const { done, value } = await reader.read()
          buffer += done ? decoder.decode() : decoder.decode(value, { stream: true })
          buffer = buffer.replaceAll('\r\n', '\n')
          if (done && buffer.trim() !== '') buffer += '\n\n'
          let boundary = buffer.indexOf('\n\n')
          while (boundary !== -1) {
            const frame = buffer.slice(0, boundary)
            buffer = buffer.slice(boundary + 2)
            for (const event of processFrame(frame)) yield event
            boundary = buffer.indexOf('\n\n')
          }
          if (done) break
        }
      } catch (error) {
        if (request.signal?.aborted === true || aborting) {
          yield { type: 'done', stopReason: 'aborted', usage }
          return
        }
        yield { type: 'error', message: describeError(error) }
        return
      } finally {
        request.signal?.removeEventListener('abort', onAbort)
        try { await reader.cancel() } catch { /* The provider already closed the stream. */ }
        try { reader.releaseLock() } catch { /* The reader may already be unlocked. */ }
      }

      if (aborting || (request.signal?.aborted === true && !sawTerminal)) {
        yield { type: 'done', stopReason: 'aborted', usage }
        return
      }
      if (!sawTerminal) {
        yield { type: 'error', message: 'Experiential connection ended before the reply finished.' }
        return
      }
      const calls = tools.calls()
      if (calls.length > 0) yield { type: 'tool_calls', toolCalls: calls }
      yield { type: 'done', stopReason: finishReason, usage }
    },
  }
}
