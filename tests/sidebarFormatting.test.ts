import { describe, expect, it } from 'bun:test'
import { formatRelativeTime } from '../frontend/sidebar/formatTime'
import { formatModelName } from '../frontend/sidebar/formatModel'

describe('sidebar formatting utilities', () => {
  describe('formatRelativeTime', () => {
    const fixedNow = 1700000000000

    it('returns "now" for timestamps under 60 seconds ago', () => {
      expect(formatRelativeTime(fixedNow - 30 * 1000, fixedNow)).toBe('now')
      expect(formatRelativeTime(fixedNow - 2 * 1000, fixedNow)).toBe('now')
    })

    it('formats minutes, hours, and days cleanly', () => {
      expect(formatRelativeTime(fixedNow - 12 * 60 * 1000, fixedNow)).toBe('12m')
      expect(formatRelativeTime(fixedNow - 3 * 60 * 60 * 1000, fixedNow)).toBe('3h')
      expect(formatRelativeTime(fixedNow - 2 * 24 * 60 * 60 * 1000, fixedNow)).toBe('2d')
    })

    it('handles empty or zero timestamps without crashing', () => {
      expect(formatRelativeTime(0)).toBe('')
      expect(formatRelativeTime(Number.NaN)).toBe('')
    })
  })

  describe('formatModelName', () => {
    it('uses the catalog display name when provided', () => {
      expect(formatModelName('openai/gpt-4o', 'GPT-4o')).toBe('GPT-4o')
      expect(formatModelName('anthropic/claude-3-7-sonnet', 'Claude 3.7 Sonnet')).toBe('Claude 3.7 Sonnet')
    })

    it('cleans vendor prefix from raw model IDs', () => {
      expect(formatModelName('anthropic/claude-sonnet')).toBe('claude-sonnet')
      expect(formatModelName('openai/gpt-5')).toBe('gpt-5')
      expect(formatModelName('meta-llama/llama-3.1-70b')).toBe('llama-3.1-70b')
    })

    it('strips date version stamps from model IDs', () => {
      expect(formatModelName('claude-3-5-sonnet-20241022')).toBe('claude-3-5-sonnet')
    })

    it('returns fallback for empty inputs', () => {
      expect(formatModelName('')).toBe('model')
      expect(formatModelName(undefined)).toBe('model')
    })
  })
})
