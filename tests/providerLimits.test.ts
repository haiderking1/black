import { describe, expect, it } from 'bun:test'

import { ProviderError } from '../backend/providers/errors'
import {
  createLimitsSource,
  FALLBACK_CONTEXT_WINDOW,
  MODELS_DEV_URL,
} from '../backend/providers/opencode/limits'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const CATALOG = {
  opencode: {
    models: {
      'glm-5.3': { limit: { context: 200_000, output: 64_000 } },
      'kimi-k3': { limit: { context: 262_144 } },
      nolimit: { id: 'nolimit' },
      zeroed: { limit: { context: 0 } },
    },
  },
}

describe('limits source', () => {
  it('resolves a published context window', async () => {
    const limits = createLimitsSource({ fetchImpl: async () => jsonResponse(CATALOG) })
    expect(await limits.get('glm-5.3')).toEqual({
      context: 200_000,
      output: 64_000,
      thinking: { reasoning: false, kind: 'none', levels: [] },
    })
    expect(await limits.contextWindowFor('kimi-k3')).toBe(262_144)
  })

  it('falls back to a conservative window for an unknown model', async () => {
    const limits = createLimitsSource({ fetchImpl: async () => jsonResponse(CATALOG) })
    expect(await limits.get('not-a-model')).toBe(undefined)
    // Compacting early is recoverable; overflowing is not.
    expect(await limits.contextWindowFor('not-a-model')).toBe(FALLBACK_CONTEXT_WINDOW)
  })

  it('reads reasoning support instead of assuming every model takes every level', async () => {
    const limits = createLimitsSource({
      fetchImpl: async () =>
        jsonResponse({
          opencode: {
            models: {
              'effort-model': {
                limit: { context: 1000 },
                reasoning: true,
                reasoning_options: [{ type: 'effort', values: ['low', 'high', 'max'] }],
              },
              'toggle-model': {
                limit: { context: 1000 },
                reasoning: true,
                reasoning_options: [{ type: 'toggle' }],
              },
              'budget-model': {
                limit: { context: 1000 },
                reasoning: true,
                reasoning_options: [{ type: 'budget_tokens', max: 81920 }],
              },
              'no-knobs': { limit: { context: 1000 }, reasoning: true, reasoning_options: [] },
              'not-reasoning': { limit: { context: 1000 }, reasoning: false },
            },
          },
        }),
    })

    expect(await limits.thinkingFor('effort-model')).toEqual({
      reasoning: true,
      kind: 'effort',
      levels: ['low', 'high', 'max'],
    })
    expect(await limits.thinkingFor('toggle-model')).toEqual({ reasoning: true, kind: 'toggle', levels: [] })
    // A token budget is not an effort value. The model does reason, but there
    // is nothing this client can send for it, so it reports no control rather
    // than a level that would be rejected.
    expect(await limits.thinkingFor('budget-model')).toEqual({ reasoning: true, kind: 'none', levels: [] })
    expect(await limits.thinkingFor('no-knobs')).toEqual({ reasoning: true, kind: 'none', levels: [] })
    expect(await limits.thinkingFor('not-reasoning')).toEqual({ reasoning: false, kind: 'none', levels: [] })
  })

  it('reports an unlisted model as unknown so nothing is sent for it', async () => {
    const limits = createLimitsSource({ fetchImpl: async () => jsonResponse(CATALOG) })
    expect(await limits.thinkingFor('not-in-the-catalog')).toEqual({
      reasoning: false,
      kind: 'unknown',
      levels: [],
    })
  })

  it('ignores entries with no usable context and probes several provider keys', async () => {
    const limits = createLimitsSource({
      fetchImpl: async () =>
        jsonResponse({
          opencode: { models: { 'glm-5.3': { limit: { context: 200_000 } } } },
          'opencode-go': { models: { 'go-only-model': { limit: { context: 131_072 } } } },
        }),
    })
    expect(await limits.contextWindowFor('go-only-model')).toBe(131_072)
    expect(await limits.get('zeroed')).toBe(undefined)
    expect(await limits.get('nolimit')).toBe(undefined)
  })

  it('caches the catalog and refreshes on demand', async () => {
    let calls = 0
    const limits = createLimitsSource({
      ttlMs: 60_000,
      now: () => 0,
      fetchImpl: async () => {
        calls++
        return jsonResponse(CATALOG)
      },
    })

    await limits.get('glm-5.3')
    await limits.get('kimi-k3')
    expect(calls).toBe(1)

    await limits.refresh()
    expect(calls).toBe(2)
  })

  it('reports network and HTTP failures as provider errors', async () => {
    const offline = createLimitsSource({
      fetchImpl: async () => {
        throw new Error('no route to host')
      },
    })
    try {
      await offline.all()
    } catch (error) {
      expect((error as ProviderError).code).toBe('network')
    }

    const failing = createLimitsSource({ fetchImpl: async () => jsonResponse({}, 500) })
    try {
      await failing.all()
    } catch (error) {
      expect((error as ProviderError).code).toBe('server')
    }
  })

  it('refuses a catalog with no limits for this provider', async () => {
    const empty = createLimitsSource({ fetchImpl: async () => jsonResponse({ someOtherProvider: { models: {} } }) })
    await expect(empty.all()).rejects.toThrow('No model limits')
  })
})

describe('limits source live', () => {
  it('reads real context windows from models.dev', async () => {
    const limits = createLimitsSource()
    const glm = await limits.get('glm-5.3')
    expect(MODELS_DEV_URL).toBe('https://models.dev/api.json')
    expect(glm?.context).toBeGreaterThan(0)

    const all = await limits.all()
    // The provider publishes far more than a handful of models.
    expect(all.size).toBeGreaterThan(10)
  }, 60_000)
})
