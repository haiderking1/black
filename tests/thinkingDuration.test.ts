import { describe, expect, it } from 'bun:test'

import { formatThinkingDuration, thinkingLabel } from '../frontend/thinking/formatDuration'

describe('formatThinkingDuration', () => {
  it('reads in seconds under a minute', () => {
    expect(formatThinkingDuration(4400)).toBe('4s')
    expect(formatThinkingDuration(59000)).toBe('59s')
  })

  it('reports sub-second reasoning as a second rather than a fraction', () => {
    // The number decorates a disclosure control. "0.4s" is noise.
    expect(formatThinkingDuration(0)).toBe('1s')
    expect(formatThinkingDuration(400)).toBe('1s')
  })

  it('switches to minutes past a minute', () => {
    expect(formatThinkingDuration(60000)).toBe('1m')
    expect(formatThinkingDuration(65000)).toBe('1m 5s')
    expect(formatThinkingDuration(125000)).toBe('2m 5s')
  })

  it('drops the seconds when they are zero', () => {
    expect(formatThinkingDuration(120000)).toBe('2m')
  })

  it('survives a nonsense duration', () => {
    // A clock that moved backwards should not render "Thought for NaNs".
    expect(formatThinkingDuration(Number.NaN)).toBe('a moment')
    expect(formatThinkingDuration(Number.POSITIVE_INFINITY)).toBe('a moment')
    expect(formatThinkingDuration(-5)).toBe('a moment')
  })
})

describe('thinkingLabel', () => {
  it('says Thinking while it is still arriving', () => {
    expect(thinkingLabel(true, undefined)).toBe('Thinking')
    // A duration is ignored mid-stream even if one somehow exists.
    expect(thinkingLabel(true, 3000)).toBe('Thinking')
  })

  it('reports the duration once finished', () => {
    expect(thinkingLabel(false, 4200)).toBe('Thought for 4s')
  })

  it('falls back when the duration was never recorded', () => {
    // A stream that ended before any timing was captured still gets a label.
    expect(thinkingLabel(false, undefined)).toBe('Thought')
  })
})
