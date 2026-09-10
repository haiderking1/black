import { expect, test } from 'bun:test'
import { retryModelStream, MODEL_RETRY_DELAY_MS } from '../../backend/chat/retry/stream'
import type { ChatStreamEvent } from '../../backend/providers/types'

async function collect(stream: AsyncGenerator<ChatStreamEvent>) { const events: ChatStreamEvent[] = []; for await (const event of stream) events.push(event); return events }

test('makes four retries after the initial failure with five second waits configured', async () => {
  let calls = 0
  let waits = 0
  const stream = async function* (): AsyncGenerator<ChatStreamEvent> { calls++; yield { type: 'error', message: 'service unavailable' } }
  const events = await collect(retryModelStream(stream, undefined, async () => { waits++ }))
  expect(calls).toBe(5)
  expect(waits).toBe(4)
  expect(MODEL_RETRY_DELAY_MS).toBe(5000)
  expect(events).toEqual([{ type: 'error', message: 'service unavailable' }])
})

test('recovers from an exception without exposing intermediate errors', async () => {
  let calls = 0
  const stream = async function* (): AsyncGenerator<ChatStreamEvent> {
    if (++calls < 3) throw new Error('network')
    yield { type: 'text', text: 'answer' }; yield { type: 'done', stopReason: 'stop' }
  }
  expect(await collect(retryModelStream(stream, undefined, async () => {}))).toEqual([{ type: 'text', text: 'answer' }, { type: 'done', stopReason: 'stop' }])
  expect(calls).toBe(3)
})

test('does not replay partially streamed content', async () => {
  let waits = 0
  const stream = async function* (): AsyncGenerator<ChatStreamEvent> { yield { type: 'text', text: 'partial' }; throw new Error('lost connection') }
  const events = await collect(retryModelStream(stream, undefined, async () => { waits++ }))
  expect(waits).toBe(0)
  expect(events.at(-1)?.type).toBe('error')
})

test('Stop interrupts the actual retry timer', async () => {
  const controller = new AbortController()
  const stream = async function* (): AsyncGenerator<ChatStreamEvent> { yield { type: 'error', message: 'network' } }
  const timer = setTimeout(() => controller.abort(), 10)
  try { expect(await collect(retryModelStream(stream, controller.signal))).toEqual([{ type: 'done', stopReason: 'aborted' }]) } finally { clearTimeout(timer) }
})
