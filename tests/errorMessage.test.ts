import { describe, expect, it } from 'bun:test'

import { describeError } from '../contracts/errorMessage'

describe('describeError', () => {
  it('reads tagged RPC errors', () => {
    expect(describeError({ _tag: 'ProviderConfigError', message: 'The model rejected the request.' }))
      .toBe('The model rejected the request.')
  })

  it('uses a nested cause when the wrapper message is generic', () => {
    expect(describeError(new Error('An error has occurred', { cause: { message: 'HTTP 400: invalid model' } })))
      .toBe('HTTP 400: invalid model')
  })

  it('unwraps generic fetch failures to their concrete network cause', () => {
    expect(describeError(new Error('fetch failed', { cause: new Error('getaddrinfo ENOTFOUND api.test') })))
      .toBe('getaddrinfo ENOTFOUND api.test')
    expect(describeError(new Error('fetch failed'))).toBe('fetch failed')
  })

  it('handles structured errors instead of rendering [object Object]', () => {
    expect(describeError({ cause: { errors: [{ msg: 'bad input' }, { message: 'missing model' }] } }))
      .toBe('bad input; missing model')
  })

  it('uses an explicit fallback when no diagnostic exists', () => {
    expect(describeError(new Error('Unknown error'), 'No provider details were returned.'))
      .toBe('No provider details were returned.')
  })

  it('bounds messages from provider responses', () => {
    expect(describeError('x'.repeat(2500))).toHaveLength(2000)
  })
})
