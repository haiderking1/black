import { describe, expect, it } from 'bun:test'

import { createStreamingClient, type ChatStreamEvent } from '../backend/providers/opencode/stream'

const BASE = 'https://example.test/zen/go/v1'

/** A response whose body arrives as the given chunks, so boundaries are exercised. */
function sseResponse(chunks: string[], status = 200): Response {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
  return new Response(body, { status, headers: { 'Content-Type': 'text/event-stream' } })
}

function frame(payload: unknown): string {
  return 'data: ' + JSON.stringify(payload) + '\n\n'
}

function delta(content: string, extra: Record<string, unknown> = {}): string {
  return frame({ choices: [{ delta: { content, ...extra }, finish_reason: null }] })
}

async function collect(chunks: string[], status = 200): Promise<ChatStreamEvent[]> {
  const client = createStreamingClient({
    baseUrl: BASE,
    apiKey: 'k',
    fetchImpl: async () => sseResponse(chunks, status),
  })
  const events: ChatStreamEvent[] = []
  for await (const event of client.stream({ model: 'm', messages: [] })) events.push(event)
  return events
}

describe('streaming completions', () => {
  it('emits text deltas in order and finishes with usage', async () => {
    const events = await collect([
      delta('Hel'),
      delta('lo'),
      frame({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 } }),
      'data: [DONE]\n\n',
    ])

    expect(events.filter((event) => event.type === 'text').map((event) => event.text)).toEqual(['Hel', 'lo'])
    const done = events.at(-1)
    expect(done?.type).toBe('done')
    expect(done?.stopReason).toBe('stop')
    expect(done?.usage).toEqual({ input: 3, output: 2, total: 5 })
  })

  it('separates reasoning from the answer', async () => {
    const events = await collect([
      frame({ choices: [{ delta: { reasoning_content: 'thinking hard' }, finish_reason: null }] }),
      delta('the answer'),
      frame({ choices: [{ delta: {}, finish_reason: 'stop' }] }),
    ])

    expect(events.filter((event) => event.type === 'thinking').map((event) => event.text)).toEqual(['thinking hard'])
    expect(events.filter((event) => event.type === 'text').map((event) => event.text)).toEqual(['the answer'])
  })

  it('reassembles a frame split across chunk boundaries', async () => {
    // The middle of a JSON payload is where a naive splitter loses data.
    const events = await collect(['data: {"choices":[{"delta":{"con', 'tent":"split"},"finish_reason":null}]}\n\n'])
    expect(events.filter((event) => event.type === 'text').map((event) => event.text)).toEqual(['split'])
  })

  it('reads a final line that has no trailing newline', async () => {
    const events = await collect([delta('a'), 'data: {"choices":[{"delta":{"content":"b"},"finish_reason":"stop"}]}'])
    expect(events.filter((event) => event.type === 'text').map((event) => event.text)).toEqual(['a', 'b'])
    expect(events.at(-1)?.stopReason).toBe('stop')
  })

  it('skips malformed frames instead of dropping the answer', async () => {
    const events = await collect([delta('a'), 'data: {not json}\n\n', delta('b')])
    expect(events.filter((event) => event.type === 'text').map((event) => event.text)).toEqual(['a', 'b'])
  })

  it('reports a length stop so a truncated answer is visible', async () => {
    const events = await collect([delta('half'), frame({ choices: [{ delta: {}, finish_reason: 'length' }] })])
    expect(events.at(-1)?.stopReason).toBe('length')
  })

  it('surfaces an error frame mid-stream and stops', async () => {
    const events = await collect([delta('a'), frame({ error: { message: 'quota exhausted' } })])
    expect(events.at(-1)?.type).toBe('error')
    expect(events.at(-1)?.message).toContain('quota exhausted')
    // Nothing after the error, including no done event.
    expect(events.some((event) => event.type === 'done')).toBe(false)
  })

  it('reports an HTTP failure as a single error event', async () => {
    const events = await collect([''], 429)
    expect(events).toHaveLength(1)
    expect(events[0]?.type).toBe('error')
  })

  it('reports a transport failure without throwing', async () => {
    const client = createStreamingClient({
      baseUrl: BASE,
      apiKey: 'k',
      fetchImpl: async () => {
        throw new Error('dns exploded')
      },
    })
    const events: ChatStreamEvent[] = []
    for await (const event of client.stream({ model: 'm', messages: [] })) events.push(event)
    expect(events[0]?.type).toBe('error')
    expect(events[0]?.message).toContain('dns exploded')
  })

  it('sends stream, usage, session, and the reasoning level when set', async () => {
    let sent: Record<string, unknown> = {}
    let headers: Record<string, string> = {}
    const client = createStreamingClient({
      baseUrl: BASE,
      apiKey: 'secret',
      fetchImpl: async (_input, init) => {
        sent = JSON.parse(String(init?.body))
        headers = init?.headers as Record<string, string>
        return sseResponse(['data: [DONE]\n\n'])
      },
    })

    for await (const _event of client.stream({
      model: 'glm-5.3',
      messages: [{ role: 'user', content: 'hi' }],
      reasoningEffort: 'high',
      sessionId: 'thread-1',
    })) {
      void _event
    }

    expect(sent['stream']).toBe(true)
    expect(sent['stream_options']).toEqual({ include_usage: true })
    expect(sent['reasoning_effort']).toBe('high')
    expect(headers['x-opencode-session']).toBe('thread-1')
    expect(headers['Authorization']).toBe('Bearer secret')
  })

  it('omits the reasoning parameter for the default sentinel', async () => {
    let sent: Record<string, unknown> = {}
    const client = createStreamingClient({
      baseUrl: BASE,
      apiKey: 'k',
      fetchImpl: async (_input, init) => {
        sent = JSON.parse(String(init?.body))
        return sseResponse(['data: [DONE]\n\n'])
      },
    })

    for await (const _event of client.stream({ model: 'm', messages: [], reasoningEffort: 'default' })) {
      void _event
    }
    expect('reasoning_effort' in sent).toBe(false)
  })
})
