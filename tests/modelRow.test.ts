import { describe, expect, it } from 'bun:test'

import type { ModelInfo } from '../contracts/providers'
import {
  SHORTCUT_COUNT,
  familyOf,
  filterModels,
  groupModels,
  shortcutLabel,
} from '../frontend/composer/modelRow'

function model(id: string, overrides: Partial<ModelInfo> = {}): ModelInfo {
  return { id, ownedBy: 'opencode', created: 0, ...overrides }
}

const catalog: ModelInfo[] = [
  model('glm-5.3', { thinkingKind: 'effort', thinkingLevels: ['low', 'high', 'max'], reasoning: true }),
  model('kimi-k3', { thinkingKind: 'effort', thinkingLevels: ['max'], reasoning: true }),
  model('grok-4.5', { thinkingKind: 'toggle', reasoning: true }),
  model('minimax-m3', { thinkingKind: 'none', reasoning: true }),
  model('mystery-1'),
]

describe('familyOf', () => {
  it('takes the part before the first separator', () => {
    expect(familyOf('glm-5.3')).toBe('glm')
    expect(familyOf('qwen3.6-plus')).toBe('qwen3')
    expect(familyOf('kimi_k3')).toBe('kimi')
  })

  it('returns the id when there is no separator', () => {
    expect(familyOf('solo')).toBe('solo')
  })

  it('does not fall over on a leading separator', () => {
    expect(familyOf('-weird')).toBe('-weird')
    expect(familyOf('')).toBe('')
  })
})

describe('shortcutLabel', () => {
  it('numbers the bound rows from one', () => {
    expect(shortcutLabel(0)).toBe('Ctrl+1')
    expect(shortcutLabel(8)).toBe('Ctrl+9')
  })

  it('gives no label past the bound rows', () => {
    // A label for a key nothing handles would be a lie on the row.
    expect(shortcutLabel(SHORTCUT_COUNT)).toBeNull()
    expect(shortcutLabel(40)).toBeNull()
  })
})

describe('groupModels', () => {
  it('separates models the catalog knows from those it does not', () => {
    const groups = groupModels(catalog)
    expect(groups.primary.map((m) => m.id)).toEqual(['glm-5.3', 'kimi-k3', 'grok-4.5', 'minimax-m3'])
    expect(groups.unlisted.map((m) => m.id)).toEqual(['mystery-1'])
  })

  it('treats an explicit unknown kind as unlisted too', () => {
    const groups = groupModels([model('x', { thinkingKind: 'unknown' })])
    expect(groups.primary).toEqual([])
    expect(groups.unlisted).toHaveLength(1)
  })

  it('loses nothing', () => {
    const groups = groupModels(catalog)
    expect(groups.primary.length + groups.unlisted.length).toBe(catalog.length)
  })

  it('copes with an empty catalog', () => {
    expect(groupModels([])).toEqual({ primary: [], unlisted: [] })
  })
})

describe('filterModels', () => {
  it('returns everything for an empty query', () => {
    expect(filterModels(catalog, '')).toHaveLength(5)
    expect(filterModels(catalog, '   ')).toHaveLength(5)
  })

  it('matches on the id', () => {
    expect(filterModels(catalog, 'glm-5').map((m) => m.id)).toEqual(['glm-5.3'])
  })

  it('matches on the family, so a bare vendor name finds its models', () => {
    expect(filterModels(catalog, 'glm').map((m) => m.id)).toEqual(['glm-5.3'])
  })

  it('ignores case and surrounding space', () => {
    expect(filterModels(catalog, '  KIMI ').map((m) => m.id)).toEqual(['kimi-k3'])
  })

  it('returns nothing when nothing matches, rather than everything', () => {
    expect(filterModels(catalog, 'nope')).toEqual([])
  })
});
