import { afterEach, expect, test } from 'bun:test'
import * as Effect from 'effect/Effect'

import type { ModelInfo } from '../../../contracts/providers'
import { clearResourceCache } from '../../../frontend/rpc/resourceCache'
import {
  invalidateModelCache,
  modelCacheKey,
  readModelCache,
  writeModelCache,
} from '../../../frontend/composer/models/cache'
import {
  catalogsToPrefetch,
  isCatalogWarmed,
  loadProviderModels,
  prefetchCatalogs,
  resetCatalogSession,
  type ModelCatalogClient,
} from '../../../frontend/composer/models/prefetch'

const cline: ModelInfo = {
  id: 'cline-free/kimi-k3',
  ownedBy: 'moonshot',
  created: 1,
  thinkingKind: 'effort',
  thinkingLevels: ['none', 'low', 'medium', 'high', 'xhigh'],
}
const go: ModelInfo = { id: 'glm-5.3', ownedBy: 'opencode', created: 1, thinkingKind: 'none' }

function catalogs(): Record<string, ModelInfo[]> {
  return {
    cline: [cline],
    'opencode-go': [go],
  }
}

function mockClient(onList: (providerId: string) => readonly ModelInfo[] | Promise<readonly ModelInfo[]>): {
  client: ModelCatalogClient
  calls: string[]
} {
  const calls: string[] = []
  return {
    calls,
    client: {
      'providers.listModels': (payload: { providerId: string }) =>
        Effect.tryPromise({
          try: async () => {
            calls.push(payload.providerId)
            return [...(await onList(payload.providerId))]
          },
        }),
    },
  }
}

function clearPersistedCatalogs(): void {
  try {
    if (typeof localStorage === 'undefined') return
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key !== null && key.startsWith('black.modelCatalog.v1:')) keys.push(key)
    }
    for (const key of keys) localStorage.removeItem(key)
  } catch {
    // Tests still run when storage is missing.
  }
}

afterEach(() => {
  resetCatalogSession()
  clearResourceCache()
  clearPersistedCatalogs()
})

test('startup prefetch loads every signed-in enabled catalog once', async () => {
  const { client, calls } = mockClient((id) => catalogs()[id] ?? [])
  await prefetchCatalogs(client, catalogsToPrefetch([
    { id: 'cline', enabled: true, authenticated: true },
    { id: 'opencode-go', enabled: true, authenticated: true },
    { id: 'openrouter', enabled: true, authenticated: false },
    { id: 'openai-codex', enabled: false, authenticated: true },
    { id: 'cline', enabled: true, authenticated: true },
  ]))

  expect(calls).toEqual(['cline', 'opencode-go'])
  expect(readModelCache('cline')).toEqual([cline])
  expect(readModelCache('opencode-go')).toEqual([go])
  expect(isCatalogWarmed('cline')).toBe(true)
  expect(isCatalogWarmed('openrouter')).toBe(false)
})

test('picker-style reload after prefetch does not hit the wire again', async () => {
  const { client, calls } = mockClient((id) => catalogs()[id] ?? [])
  await prefetchCatalogs(client, ['cline', 'opencode-go'])
  expect(calls).toEqual(['cline', 'opencode-go'])

  const again = await Promise.all([
    loadProviderModels(client, 'cline'),
    loadProviderModels(client, 'opencode-go'),
    loadProviderModels(client, 'cline'),
  ])
  expect(again[0]).toEqual([cline])
  expect(again[1]).toEqual([go])
  expect(calls).toEqual(['cline', 'opencode-go'])
})

test('concurrent first loads share one request', async () => {
  let release: (models: readonly ModelInfo[]) => void = () => {}
  const pending = new Promise<readonly ModelInfo[]>((resolve) => {
    release = resolve
  })
  const { client, calls } = mockClient(() => pending)

  const first = loadProviderModels(client, 'cline')
  const second = loadProviderModels(client, 'cline')
  release([cline])
  expect(await first).toEqual([cline])
  expect(await second).toEqual([cline])
  expect(calls).toEqual(['cline'])
})

test('last session disk cache is not treated as this-run warm', async () => {
  writeModelCache('cline', [cline])
  resetCatalogSession()
  expect(readModelCache('cline')).toEqual([cline])
  expect(isCatalogWarmed('cline')).toBe(false)

  const { client, calls } = mockClient(() => [cline])
  await loadProviderModels(client, 'cline')
  expect(calls).toEqual(['cline'])
  expect(isCatalogWarmed('cline')).toBe(true)
  await loadProviderModels(client, 'cline')
  expect(calls).toEqual(['cline'])
})

test('explicit force refresh pays again after a warm catalog', async () => {
  const next: ModelInfo = { ...cline, name: 'Kimi K3 (free)' }
  const { client, calls } = mockClient(() => (calls.length === 1 ? [cline] : [next]))
  await loadProviderModels(client, 'cline')
  expect(await loadProviderModels(client, 'cline', { force: true })).toEqual([next])
  expect(calls).toEqual(['cline', 'cline'])
  expect(readModelCache('cline')).toEqual([next])
})

test('a failed vendor does not block the rest of startup prefetch', async () => {
  const { client, calls } = mockClient((id) => {
    if (id === 'cline') throw new Error('cline down')
    return catalogs()[id] ?? []
  })
  await prefetchCatalogs(client, ['cline', 'opencode-go'])
  expect(calls).toEqual(['cline', 'opencode-go'])
  expect(isCatalogWarmed('cline')).toBe(false)
  expect(isCatalogWarmed('opencode-go')).toBe(true)
  expect(readModelCache('opencode-go')).toEqual([go])
})

test('invalidating credentials forgets warm so the next load pays', async () => {
  const { client, calls } = mockClient(() => [cline])
  await loadProviderModels(client, 'cline')
  invalidateModelCache('cline')
  expect(isCatalogWarmed('cline')).toBe(false)
  expect(readModelCache('cline')).toEqual([])
  expect(typeof localStorage === 'undefined' || localStorage.getItem(modelCacheKey('cline')) === null).toBe(true)
  await loadProviderModels(client, 'cline')
  expect(calls).toEqual(['cline', 'cline'])
})

test('catalogsToPrefetch keeps enabled signed-in ids in list order', () => {
  expect(catalogsToPrefetch([
    { id: '', enabled: true, authenticated: true },
    { id: 'cline', enabled: true, authenticated: true },
    { id: 'skip', enabled: false, authenticated: true },
    { id: 'openrouter', enabled: true, authenticated: false },
    { id: 'opencode-go', enabled: true, authenticated: true },
    { id: 'cline', enabled: true, authenticated: true },
  ])).toEqual(['cline', 'opencode-go'])
})
