import { expect, test } from 'bun:test'
import { retryableModelError } from '../../backend/chat/retry/classify'
import { providerErrorIdentifier } from '../../backend/providers/errors'

test('retries transient HTTP and network failures', () => {
  for (const errorStatus of [408, 409, 429, 500, 502, 503, 504]) expect(retryableModelError({ errorStatus, message: 'failure' })).toBe(true)
  for (const message of ['fetch failed', 'ECONNRESET', 'WebSocket connection closed', 'Provider connection ended before the round finished.']) expect(retryableModelError({ message })).toBe(true)
})

test('fails fast for auth, bad requests, context overflow and subscription limits', () => {
  for (const errorStatus of [400, 401, 403, 404, 422]) expect(retryableModelError({ errorStatus, message: 'failure' })).toBe(false)
  for (const message of ['Monthly usage limit reached', 'insufficient_quota', 'context window exceeded', 'billing required', 'quota exceeded']) expect(retryableModelError({ errorStatus: 429, message })).toBe(false)
  const errorCode = providerErrorIdentifier({ error: { type: 'GoUsageLimitError', message: 'limit' } })
  expect(retryableModelError({ errorStatus: 429, errorCode, message: 'limit' })).toBe(false)
  expect(retryableModelError({ message: 'Unexpected application bug' })).toBe(false)
})
