import { describe, expect, it } from 'bun:test'

import { formatDiscount, formatLatency, formatPricePair, formatTps, formatUsdPerMillion } from '../../../frontend/composer/routing/format'

describe('openrouter host formatting', () => {
  it('shows throughput as tokens per second', () => {
    expect(formatTps(45.2)).toBe('45 tps')
    expect(formatTps(4.26)).toBe('4.3 tps')
  })

  it('shows latency in ms, or seconds when it is that slow', () => {
    expect(formatLatency(180)).toBe('180ms')
    expect(formatLatency(1500)).toBe('1.5s')
    expect(formatLatency(0.25)).toBe('250ms')
  })

  it('converts per-token prices into dollars per million', () => {
    expect(formatUsdPerMillion(0.000003)).toBe('$3')
    expect(formatUsdPerMillion(0.000015)).toBe('$15')
    expect(formatPricePair(0.000003, 0.000015)).toBe('$3 / $15')
    expect(formatPricePair(0, 0)).toBe('Free')
    expect(formatPricePair()).toBeNull()
  })

  it('renders OpenRouter fractional discounts', () => {
    expect(formatDiscount(undefined)).toBeNull()
    expect(formatDiscount(0)).toBeNull()
    expect(formatDiscount(0.2)).toBe('\u221220%')
    expect(formatDiscount(1)).toBe('Free')
  })
})
