import { describe, expect, it } from 'bun:test'

import type { ModelInfo } from '../contracts/providers'
import {
  clampThinkingLevel,
  fallbackChoices,
  thinkingOptionsFor,
  THINKING_DEFAULT,
} from '../frontend/composer/thinkingOptions'

function model(overrides: Partial<ModelInfo> = {}): ModelInfo {
  return { id: 'test-model', ownedBy: 'opencode', created: 1, ...overrides }
}

function valuesFor(input: ModelInfo | null): string[] {
  return thinkingOptionsFor(input).choices.map((choice) => choice.value)
}

describe('thinkingOptionsFor', () => {
  it('offers only the levels the model actually accepts', () => {
    const glm = model({ id: 'glm-5.3', thinkingKind: 'effort', thinkingLevels: ['low', 'high', 'max'] })
    // No 'medium', no 'minimal', no 'xhigh': sending those is rejected.
    expect(valuesFor(glm)).toEqual(['default', 'low', 'high', 'max'])
    expect(thinkingOptionsFor(glm).disabled).toBe(false)
  })

  it('offers a single level when that is all the model takes', () => {
    const kimi = model({ id: 'kimi-k3', thinkingKind: 'effort', thinkingLevels: ['max'] })
    expect(valuesFor(kimi)).toEqual(['default', 'max'])
  })

  it('passes through vendor levels that are not in our own list', () => {
    const luna = model({ id: 'gpt-5.6-luna', thinkingKind: 'effort', thinkingLevels: ['none', 'low', 'xhigh'] })
    // 'none' is the vendor's, and is distinct from our 'default': sending it is
    // a real request, not an omission.
    expect(valuesFor(luna)).toEqual(['default', 'none', 'low', 'xhigh'])
  })

  it('disables the picker for a toggle-only model and says why', () => {
    const toggle = model({ id: 'glm-5.1', thinkingKind: 'toggle' })
    expect(valuesFor(toggle)).toEqual([THINKING_DEFAULT])
    expect(thinkingOptionsFor(toggle).disabled).toBe(true)
    expect(thinkingOptionsFor(toggle).note).toContain('glm-5.1')
  })

  it('disables the picker when the model exposes no control', () => {
    const bare = model({ id: 'minimax-m3', thinkingKind: 'none' })
    expect(valuesFor(bare)).toEqual([THINKING_DEFAULT])
    expect(thinkingOptionsFor(bare).disabled).toBe(true)
  })

  it('disables the picker for a model that does not reason', () => {
    const plain = model({ id: 'plain', reasoning: false })
    expect(valuesFor(plain)).toEqual([THINKING_DEFAULT])
    expect(thinkingOptionsFor(plain).disabled).toBe(true)
  })

  it('offers the full set for an unlisted model, with a warning', () => {
    const unknown = model({ id: 'deepseek-flash', thinkingKind: 'unknown' })
    expect(valuesFor(unknown)).toEqual(fallbackChoices().map((choice) => choice.value))
    expect(thinkingOptionsFor(unknown).disabled).toBe(false)
    expect(thinkingOptionsFor(unknown).note).toContain('unknown')
  })

  it('offers the full set before any model is known', () => {
    expect(valuesFor(null)).toEqual(fallbackChoices().map((choice) => choice.value))
  })

  it('falls back rather than emptying when effort is declared with no values', () => {
    const empty = model({ id: 'weird', thinkingKind: 'effort', thinkingLevels: [] })
    expect(valuesFor(empty)).toEqual([THINKING_DEFAULT])
    expect(thinkingOptionsFor(empty).disabled).toBe(true)
  })
})

describe('clampThinkingLevel', () => {
  it('keeps a level the model accepts', () => {
    const choices = thinkingOptionsFor(model({ thinkingKind: 'effort', thinkingLevels: ['low', 'max'] })).choices
    expect(clampThinkingLevel('low', choices)).toBe('low')
  })

  it('moves an unsupported level to the lowest one the model takes', () => {
    // The bug this exists for: 'medium' is the default and GLM-5.3 rejects it.
    // Landing on the model's lowest level is predictable and never silently
    // spends more reasoning than the user asked for.
    const choices = thinkingOptionsFor(
      model({ thinkingKind: 'effort', thinkingLevels: ['low', 'high', 'max'] })
    ).choices
    expect(clampThinkingLevel('medium', choices)).toBe('low')
  })

  it('clamps to the model floor when it does not go low at all', () => {
    const choices = thinkingOptionsFor(model({ thinkingKind: 'effort', thinkingLevels: ['high', 'max'] })).choices
    expect(clampThinkingLevel('minimal', choices)).toBe('high')
    expect(clampThinkingLevel('max', choices)).toBe('max')
  })

  it('migrates a level saved before the sentinel was renamed', () => {
    const choices = thinkingOptionsFor(
      model({ thinkingKind: 'effort', thinkingLevels: ['low', 'high'] })
    ).choices
    // Not clamped into 'low': that would start reasoning for someone who asked
    // for none.
    expect(clampThinkingLevel('off', choices)).toBe(THINKING_DEFAULT)
    expect(clampThinkingLevel(THINKING_DEFAULT, choices)).toBe(THINKING_DEFAULT)
  })

  it('falls back to default when nothing else is available', () => {
    expect(clampThinkingLevel('high', thinkingOptionsFor(model({ thinkingKind: 'toggle' })).choices)).toBe(
      THINKING_DEFAULT
    )
    expect(clampThinkingLevel('high', [])).toBe(THINKING_DEFAULT)
  })

  it('does not add a duplicate default when the vendor lists its own off value', () => {
    const vendorOff = model({ id: 'vendor-off', thinkingKind: 'effort', thinkingLevels: ['off', 'low'] })
    expect(valuesFor(vendorOff)).toEqual(['off', 'low'])
  })
})
