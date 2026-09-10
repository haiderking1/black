import { describe, expect, it } from 'bun:test'

import { mintToken, tokenMatches } from '../backend/server/token'

describe('mintToken', () => {
  it('produces a URL-safe token with real entropy', () => {
    const token = mintToken()
    expect(token.length).toBeGreaterThanOrEqual(32)
    expect(/^[A-Za-z0-9_-]+$/.test(token)).toBe(true)
  })

  it('never repeats across runs', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 200; i++) seen.add(mintToken())
    expect(seen.size).toBe(200)
  })
})

describe('tokenMatches', () => {
  const token = mintToken()

  it('accepts the exact token', () => {
    expect(tokenMatches(token, token)).toBe(true)
  })

  it('rejects a different token of the same length', () => {
    const other = 'x'.repeat(token.length)
    expect(tokenMatches(token, other)).toBe(false)
  })

  it('rejects a candidate of the wrong length without throwing', () => {
    // timingSafeEqual throws on a length mismatch, so the length is checked first.
    expect(() => tokenMatches(token, 'short')).not.toThrow()
    expect(tokenMatches(token, 'short')).toBe(false)
    expect(tokenMatches(token, token + 'x')).toBe(false)
  })

  it('rejects missing and empty candidates', () => {
    expect(tokenMatches(token, undefined)).toBe(false)
    expect(tokenMatches(token, '')).toBe(false)
  })
})
