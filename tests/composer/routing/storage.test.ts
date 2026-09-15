import { describe, expect, it } from 'bun:test'

import { defaultRoute, readRoute, toChatRoute, writeRoute, type RouteStorage } from '../../../frontend/composer/routing/storage'
import { resolvedRoute } from '../../../frontend/composer/routing/RoutePicker'
import type { ModelEndpoint } from '../../../contracts/providers'

function memory(): RouteStorage {
  const values = new Map<string, string>()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value) },
    removeItem: (key) => { values.delete(key) },
  }
}

const anthropic: ModelEndpoint = {
  tag: 'anthropic',
  providerName: 'Anthropic',
  contextLength: 200_000,
  status: 0,
}

describe('openrouter route storage', () => {
  it('defaults to latency sort', () => {
    expect(readRoute('anthropic/claude-sonnet-4', memory())).toEqual({ sort: 'latency' })
    expect(toChatRoute(defaultRoute())).toEqual({ sort: 'latency' })
  })

  it('round-trips a pinned host', () => {
    const storage = memory()
    writeRoute('anthropic/claude-sonnet-4', { only: 'anthropic' }, storage)
    expect(readRoute('anthropic/claude-sonnet-4', storage)).toEqual({ only: 'anthropic' })
    expect(toChatRoute({ only: 'anthropic' })).toEqual({ only: 'anthropic' })
  })

  it('falls back to fastest when a pinned tag disappears', () => {
    expect(resolvedRoute({ only: 'together' }, [anthropic])).toEqual({ sort: 'latency' })
    expect(resolvedRoute({ only: 'anthropic' }, [anthropic])).toEqual({ only: 'anthropic' })
  })

  it('keeps a pin while the host list is still loading, then drops it if the list comes back empty', () => {
    expect(resolvedRoute({ only: 'together' }, [])).toEqual({ only: 'together' })
    expect(resolvedRoute({ only: 'together' }, [], true)).toEqual({ sort: 'latency' })
  })
})
