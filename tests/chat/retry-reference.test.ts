import { expect, test } from 'bun:test'
import { retryableModelError } from '../../backend/chat/retry/classify'
import { retryAssistantCall, retryDelayMs } from '../../backend/chat/retry/reference/retry'
import type { ChatResult } from '../../backend/providers/types'

test('uses the reference catalog for previously missing provider failures', () => {
  for (const message of [
    'Provider returned error', 'exceeded request buffer limit while retrying upstream',
    'upstream connect error', 'reset before headers', 'other side closed',
    'The socket connection was closed unexpectedly', 'getaddrinfo failed',
    'WebSocket closed', 'WebSocket error', 'terminated',
    'stream ended without a response', 'Anthropic stream ended before message_stop',
    'stream ended before a terminal response event', 'http2 request did not get a response',
    'retry delay exceeds limit', 'You can retry your request', 'Try your request again',
    'Please retry your request', 'ResourceExhausted',
  ]) expect(retryableModelError({ message })).toBe(true)
  for (const errorCode of ['GoUsageLimitError', 'FreeUsageLimitError']) {
    expect(retryableModelError({ errorStatus: 429, errorCode, message: 'Please retry your request' })).toBe(false)
  }
})

test('ports the capped backoff and callback helper intact', async () => {
  expect(retryDelayMs({ baseDelayMs: 5000 }, 3)).toBe(20000)
  expect(retryDelayMs({ baseDelayMs: 5000, maxAgentDelayMs: 5000 }, 4)).toBe(5000)
  const events: string[] = []
  let calls = 0
  const result = await retryAssistantCall(async (): Promise<ChatResult> => ({
    text: '', thinking: '', usage: { input: 0, output: 0, total: 0 },
    stopReason: ++calls === 1 ? 'error' : 'stop', errorMessage: 'overloaded',
  }), { enabled: true, maxRetries: 4, baseDelayMs: 0 }, undefined, {
    onRetryScheduled: () => { events.push('scheduled') },
    onRetryAttemptStart: () => { events.push('started') },
    onRetryFinished: success => { events.push(String(success)) },
  })
  expect(result.stopReason).toBe('stop')
  expect(events).toEqual(['scheduled', 'started', 'true'])
})
