import { expect, test } from 'bun:test'
import { retryableModelError } from '../../backend/chat/retry/classify'
import { providerErrorIdentifier } from '../../backend/providers/errors'

test('retries transient HTTP and network failures', () => {
  for (const errorStatus of [408, 409, 429, 500, 502, 503, 504]) expect(retryableModelError({ errorStatus, message: 'failure' })).toBe(true)
  for (const message of ['fetch failed', 'ECONNRESET', 'WebSocket connection closed', 'Provider connection ended before the round finished.']) expect(retryableModelError({ message })).toBe(true)
})

test('retries Internal server error through OpenRouter wrappers', () => {
  expect(retryableModelError({ message: 'Internal server error' })).toBe(true)
  expect(retryableModelError({ errorStatus: 500, errorCode: '500 invalid_request_error', message: 'Internal server error' })).toBe(true)
  expect(retryableModelError({ errorStatus: 400, errorCode: 'invalid_request_error', message: 'Internal server error' })).toBe(true)
  expect(retryableModelError({ errorCode: 'internal_server_error', message: 'upstream died' })).toBe(true)
})

test('fails fast for auth, bad requests, context overflow and subscription limits', () => {
  for (const errorStatus of [400, 401, 402, 403, 404, 422]) expect(retryableModelError({ errorStatus, message: 'failure' })).toBe(false)
  for (const message of ['Monthly usage limit reached', 'insufficient_quota', 'context window exceeded', 'billing required', 'quota exceeded']) expect(retryableModelError({ errorStatus: 429, message })).toBe(false)
  const errorCode = providerErrorIdentifier({ error: { type: 'GoUsageLimitError', message: 'limit' } })
  expect(retryableModelError({ errorStatus: 429, errorCode, message: 'limit' })).toBe(false)
  expect(retryableModelError({ message: 'Unexpected application bug' })).toBe(false)
})
