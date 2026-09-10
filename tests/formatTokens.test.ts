import { describe, expect, it } from 'bun:test'

import { formatTokens } from '../frontend/format/tokens'

describe('formatTokens', () => {
  it('leaves small counts alone', () => {
    expect(formatTokens(0)).toBe('0')
    expect(formatTokens(999)).toBe('999')
  })

  it('reads thousands with a k', () => {
    expect(formatTokens(1000)).toBe('1k')
    expect(formatTokens(128400)).toBe('128.4k')
    expect(formatTokens(200000)).toBe('200k')
  })

  it('switches to millions rather than counting thousands of thousands', () => {
    // The whole point: a million token window must not read as "1000k".
    expect(formatTokens(1_000_000)).toBe('1M')
    expect(formatTokens(2_000_000)).toBe('2M')
    expect(formatTokens(1_500_000)).toBe('1.5M')
  })

  it('keeps a decimal only when it carries something', () => {
    expect(formatTokens(2_000_000)).toBe('2M')
    expect(formatTokens(250_000)).toBe('250k')
  })

  it('copes with a nonsense count rather than rendering NaN', () => {
    expect(formatTokens(Number.NaN)).toBe('0')
    expect(formatTokens(-5)).toBe('0')
    expect(formatTokens(Number.POSITIVE_INFINITY)).toBe('0')
  })
})
