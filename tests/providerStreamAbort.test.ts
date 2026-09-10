import { describe, expect, it } from 'bun:test'

import { createStreamingClient } from '../backend/providers/opencode/stream'
import type { ChatStreamEvent, FetchLike } from '../backend/providers/types'

function sseFrame(payload: unknown): string {
  return 'data: ' + JSON.stringify(payload) + '\n\n'
}

function textFrame(text: string): string {
  return sseFrame({ choices: [{ delta: { content: text } }] })
}

describe('a stream that is aborted mid-flight', () => {
  it('ends as aborted rather than as an error', async () => {
    const controller = new AbortController()
    let rejectRead: ((error: unknown) => void) | null = null

    const body = new ReadableStream<Uint8Array>({
      start(streamController) {
        streamController.enqueue(new TextEncoder().encode(textFrame('hello')))
      },
      pull() {
        // Stalls until the abort rejects it, which is what a real response body
        // does when the request is cancelled. Without this the stream would end
        // cleanly and the abort path would never be reached.
        return new Promise<void>((_resolve, reject) => {
          rejectRead = reject
        })
      }
    })

    const fetchImpl = (async (_input: string, init?: { signal?: AbortSignal }) => {
      init?.signal?.addEventListener('abort', () => {
        rejectRead?.(new DOMException('The operation was aborted.', 'AbortError'))
      })
      return new Response(body, { status: 200 })
    }) as unknown as FetchLike

    const client = createStreamingClient({
      baseUrl: 'https://example.test/v1',
      apiKey: 'test-key',
      fetchImpl
    })

    const events: ChatStreamEvent[] = []

    for await (const event of client.stream({
      model: 'test-model',
      sessionId: 'test-session',
      messages: [{ role: 'user', content: 'hi' }],
      signal: controller.signal
    })) {
      events.push(event)
      if (event.type === 'text') controller.abort()
    }

    expect(events[0]).toEqual({ type: 'text', text: 'hello' })

    const last = events[events.length - 1]
    // The whole point: a stop must not look like a failure, or the caller
    // replaces the partial answer with an error message.
    expect(last?.type).toBe('done')
    expect(last?.stopReason).toBe('aborted')
    expect(events.some((event) => event.type === 'error')).toBe(false)
  })
})
