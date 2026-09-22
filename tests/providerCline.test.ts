import { describe, expect, it } from 'bun:test'

import { createClineProvider } from '../backend/providers/cline'
import { createCatalog } from '../backend/providers/cline/catalog'
import type { ModelLimits } from '../backend/providers/cline/limits'
import { createMemoryCatalogStore } from '../backend/providers/cline/catalogStore'
import { buildChatBody, createChatClient } from '../backend/providers/cline/client'
import { CLINE_API_BASE_URL, joinUrl, MODELS_PATH, RECOMMENDED_MODELS_PATH } from '../backend/providers/cline/endpoints'
import { CLINE_CLIENT_TYPE, clineAuthHeaders, formatClineBearer } from '../backend/providers/cline/headers'
import { PROVIDER_ID } from '../backend/providers/cline/oauth/constants'
import { feedFingerprint, parseClineFreeFeed, parseClinePassFeed } from '../backend/providers/cline/recommended'
import { createStreamingClient } from '../backend/providers/cline/stream'
import { createProvider } from '../backend/providers/create'
import { PROVIDER_DESCRIPTORS } from '../backend/providers/descriptors'
import { ProviderError } from '../backend/providers/errors'

const BASE = CLINE_API_BASE_URL

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function modelRow(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { id, name: extra['name'] ?? id, created: 1, context_length: 200_000, ...extra }
}

describe('Cline descriptor', () => {
  it('registers Cline as an OAuth provider pointed at api.cline.bot', () => {
    const descriptor = PROVIDER_DESCRIPTORS.find((entry) => entry.id === PROVIDER_ID)
    expect(descriptor).toMatchObject({
      id: 'cline',
      name: 'ClinePass',
      authKind: 'oauth',
      baseUrl: CLINE_API_BASE_URL,
    })
    expect(createProvider('cline', 'tok')?.id).toBe('cline')
    expect(createProvider('cline', 'tok')?.name).toBe('ClinePass')
  })
})

describe('Cline catalog', () => {
  it('loads ClinePass slugs after sign-in and drops routed lab models', async () => {
    const seen: string[] = []
    const catalog = createCatalog({
      providerId: PROVIDER_ID,
      baseUrl: BASE,
      apiKey: 'oauth-access',
      fetchImpl: async (input, init) => {
        seen.push(String(input))
        const headers = new Headers(init?.headers)
        expect(headers.get('Authorization')).toBe('Bearer workos:oauth-access')
        expect(headers.get('X-CLIENT-TYPE')).toBe(CLINE_CLIENT_TYPE)
        const url = String(input)
        if (url.endsWith(RECOMMENDED_MODELS_PATH)) {
          return jsonResponse({
            recommended: [{ id: 'anthropic/claude-sonnet-4.6', name: 'Claude Sonnet 4.6' }],
            free: [],
            clinePass: [{ id: 'cline-pass/qwen3.7-max', name: 'Qwen 3.7 Max' }],
          })
        }
        return jsonResponse({
          data: [
            modelRow('anthropic/claude-sonnet-4.6', { name: 'Claude Sonnet 4.6' }),
            modelRow('openai/gpt-5', { name: 'GPT-5' }),
            modelRow('cline-pass/qwen3.7-max', {
              name: 'Qwen 3.7 Max',
              architecture: { modality: 'text+image' },
              supported_parameters: ['tools', 'include_reasoning', 'reasoning'],
              reasoning: { supported_efforts: ['low', 'high'] },
            }),
            modelRow('cline-pass/glm-5.2', {
              name: 'GLM 5.2',
              supported_parameters: ['tools'],
            }),
            { object: 'model' },
            { id: '' },
          ],
        })
      },
    })

    const models = await catalog.list()
    expect(seen).toContain(joinUrl(BASE, MODELS_PATH))
    expect(seen).toContain(joinUrl(BASE, RECOMMENDED_MODELS_PATH))
    expect(models.map((model) => model.id)).toEqual(['cline-pass/qwen3.7-max', 'cline-pass/glm-5.2'])
    expect(models).toEqual([
      { id: 'cline-pass/qwen3.7-max', name: 'Qwen 3.7 Max', ownedBy: 'cline-pass', created: 1 },
      { id: 'cline-pass/glm-5.2', name: 'GLM 5.2', ownedBy: 'cline-pass', created: 1 },
    ])

    const thinking = await catalog.get('cline-pass/qwen3.7-max')
    expect(thinking?.context).toBe(200_000)
    expect(thinking?.thinking).toEqual({ reasoning: true, kind: 'effort', levels: ['low', 'high'] })
    expect(thinking?.images).toBe(true)
    expect(thinking?.tools).toBe(true)
    expect((await catalog.get('cline-pass/glm-5.2'))?.thinking).toEqual({
      reasoning: false,
      kind: 'none',
      levels: [],
    })
    expect(await catalog.get('anthropic/claude-sonnet-4.6')).toBeUndefined()
    expect(await catalog.get('openai/gpt-5')).toBeUndefined()
  })

  it('treats reasoning_effort without a published list as Cline effort levels', async () => {
    const catalog = createCatalog({
      providerId: PROVIDER_ID,
      baseUrl: BASE,
      apiKey: 'k',
      fetchImpl: async () =>
        jsonResponse({
          data: [
            modelRow('cline-pass/kimi-k3', {
              supported_parameters: ['tools', 'include_reasoning', 'reasoning', 'reasoning_effort'],
            }),
          ],
        }),
    })
    expect((await catalog.get('cline-pass/kimi-k3'))?.thinking).toEqual({
      reasoning: true,
      kind: 'effort',
      levels: ['none', 'low', 'medium', 'high', 'xhigh'],
    })
  })

  it('treats include_reasoning without an effort list as listed thinking with no control', async () => {
    const catalog = createCatalog({
      providerId: PROVIDER_ID,
      baseUrl: BASE,
      apiKey: 'k',
      fetchImpl: async () =>
        jsonResponse({
          data: [modelRow('cline-pass/thinker', { supported_parameters: ['include_reasoning'] })],
        }),
    })
    expect((await catalog.get('cline-pass/thinker'))?.thinking).toEqual({
      reasoning: true,
      kind: 'none',
      levels: [],
    })
  })

  it('refuses a router-only catalog instead of inventing ClinePass models', async () => {
    const catalog = createCatalog({
      providerId: PROVIDER_ID,
      baseUrl: BASE,
      apiKey: 'k',
      fetchImpl: async (input) => {
        if (String(input).endsWith(RECOMMENDED_MODELS_PATH)) {
          return jsonResponse({
            recommended: [{ id: 'anthropic/claude-sonnet-4.6' }],
            clinePass: [{ id: 'anthropic/claude-sonnet-4.6' }],
          })
        }
        return jsonResponse({
          data: [modelRow('anthropic/claude-sonnet-4.6'), modelRow('openai/gpt-5')],
        })
      },
    })
    await expect(catalog.list()).rejects.toThrow('empty')
  })

  it('refuses an empty catalog instead of inventing models', async () => {
    const catalog = createCatalog({
      providerId: PROVIDER_ID,
      baseUrl: BASE,
      apiKey: 'k',
      fetchImpl: async () => jsonResponse({ data: [] }),
    })
    await expect(catalog.list()).rejects.toThrow('empty')
  })

  it('includes the live free promo feed and hydrates Kimi from the router row', async () => {
    const catalog = createCatalog({
      providerId: PROVIDER_ID,
      baseUrl: BASE,
      apiKey: 'k',
      fetchImpl: async (input) => {
        if (String(input).endsWith(RECOMMENDED_MODELS_PATH)) {
          return jsonResponse({
            recommended: [{ id: 'anthropic/claude-opus-5', name: 'Claude Opus 5' }],
            free: [
              { id: 'cline-free/kimi-k3', name: 'Kimi K3' },
              { id: 'z-ai/glm-5.3-flash', name: 'glm-5.3-flash' },
            ],
            clinePass: [{ id: 'cline-pass/kimi-k3' }],
          })
        }
        return jsonResponse({
          data: [
            modelRow('moonshotai/kimi-k3', {
              name: 'MoonshotAI: Kimi K3',
              supported_parameters: ['tools', 'include_reasoning', 'reasoning', 'reasoning_effort'],
            }),
            modelRow('z-ai/glm-5.3-flash', { name: 'GLM 5.3 Flash', supported_parameters: ['tools'] }),
            modelRow('anthropic/claude-opus-5', { name: 'Claude Opus 5' }),
          ],
        })
      },
    })

    const models = await catalog.list()
    expect(models.map((model) => model.id)).toEqual([
      'cline-pass/kimi-k3',
      'cline-free/kimi-k3',
      'z-ai/glm-5.3-flash',
    ])
    expect(models.find((model) => model.id === 'cline-pass/kimi-k3')?.name).toBe('MoonshotAI: Kimi K3')
    expect(models.find((model) => model.id === 'cline-free/kimi-k3')?.name).toBe('MoonshotAI: Kimi K3 (free)')
    expect(await catalog.get('anthropic/claude-opus-5')).toBeUndefined()
    expect((await catalog.get('cline-pass/kimi-k3'))?.thinking).toEqual({
      reasoning: true,
      kind: 'effort',
      levels: ['none', 'low', 'medium', 'high', 'xhigh'],
    })
    expect((await catalog.get('cline-free/kimi-k3'))?.thinking).toEqual({
      reasoning: true,
      kind: 'effort',
      levels: ['none', 'low', 'medium', 'high', 'xhigh'],
    })
  })

  it('adds a live ClinePass feed model that the router list omitted', async () => {
    const catalog = createCatalog({
      providerId: PROVIDER_ID,
      baseUrl: BASE,
      apiKey: 'k',
      fetchImpl: async (input) => {
        if (String(input).endsWith(RECOMMENDED_MODELS_PATH)) {
          return jsonResponse({
            clinePass: [
              { id: 'cline-pass/qwen3.8-max', name: 'Qwen 3.8 Max' },
              { id: 'openai/gpt-5', name: 'should drop' },
            ],
          })
        }
        return jsonResponse({ data: [modelRow('openai/gpt-5')] })
      },
    })
    expect(await catalog.list()).toEqual([
      { id: 'cline-pass/qwen3.8-max', name: 'Qwen 3.8 Max', ownedBy: 'cline-pass', created: 0 },
    ])
    expect((await catalog.get('cline-pass/qwen3.8-max'))?.thinking).toEqual({
      reasoning: false,
      kind: 'none',
      levels: [],
    })
    expect((await catalog.get('cline-pass/qwen3.8-max'))?.context).toBe(128_000)
  })

  it('hydrates an omitted ClinePass slug from models.dev instead of a 128k stub', async () => {
    const published: ModelLimits = {
      context: 1_000_000,
      thinking: { reasoning: true, kind: 'effort', levels: ['minimal', 'low', 'medium', 'high', 'xhigh'] },
      images: true,
      tools: true,
    }
    const catalog = createCatalog({
      providerId: PROVIDER_ID,
      baseUrl: BASE,
      apiKey: 'k',
      limits: {
        get: async () => published,
        contextWindowFor: async () => published.context,
        thinkingFor: async () => published.thinking,
        imagesFor: async () => published.images,
        toolsFor: async () => published.tools,
        all: async () => new Map([['cline-pass/qwen3.8-max', published]]),
        refresh: async () => new Map([['cline-pass/qwen3.8-max', published]]),
      },
      fetchImpl: async (input) => {
        if (String(input).endsWith(RECOMMENDED_MODELS_PATH)) {
          return jsonResponse({ clinePass: [{ id: 'cline-pass/qwen3.8-max', name: 'Qwen 3.8 Max' }] })
        }
        return jsonResponse({ data: [modelRow('openai/gpt-5')] })
      },
    })
    const model = await catalog.get('cline-pass/qwen3.8-max')
    expect(model?.context).toBe(1_000_000)
    expect(model?.thinking).toEqual({
      reasoning: true,
      kind: 'effort',
      levels: ['minimal', 'low', 'medium', 'high', 'xhigh'],
    })
    expect(model?.images).toBe(true)
    expect(model?.tools).toBe(true)
  })

  it('gives Cline effort controls when models.dev only marks a pass stub as reasoning', async () => {
    const published: ModelLimits = {
      context: 1_000_000,
      thinking: { reasoning: true, kind: 'none', levels: [] },
      images: false,
      tools: true,
    }
    const catalog = createCatalog({
      providerId: PROVIDER_ID,
      baseUrl: BASE,
      apiKey: 'k',
      limits: {
        get: async () => published,
        contextWindowFor: async () => published.context,
        thinkingFor: async () => published.thinking,
        imagesFor: async () => published.images,
        toolsFor: async () => published.tools,
        all: async () => new Map([['cline-pass/qwen3.8-max', published]]),
        refresh: async () => new Map([['cline-pass/qwen3.8-max', published]]),
      },
      fetchImpl: async (input) => {
        if (String(input).endsWith(RECOMMENDED_MODELS_PATH)) {
          return jsonResponse({ clinePass: [{ id: 'cline-pass/qwen3.8-max', name: 'Qwen 3.8 Max' }] })
        }
        return jsonResponse({ data: [] })
      },
    })
    expect((await catalog.get('cline-pass/qwen3.8-max'))?.thinking).toEqual({
      reasoning: true,
      kind: 'effort',
      levels: ['none', 'low', 'medium', 'high', 'xhigh'],
    })
  })

  it('keeps ClinePass slugs when the recommended feed is down', async () => {
    const catalog = createCatalog({
      providerId: PROVIDER_ID,
      baseUrl: BASE,
      apiKey: 'k',
      fetchImpl: async (input) => {
        if (String(input).endsWith(RECOMMENDED_MODELS_PATH)) {
          return jsonResponse({ error: 'nope' }, 503)
        }
        return jsonResponse({ data: [modelRow('cline-pass/glm-5.2', { name: 'GLM 5.2' })] })
      },
    })
    expect(await catalog.list()).toEqual([
      { id: 'cline-pass/glm-5.2', name: 'GLM 5.2', ownedBy: 'cline-pass', created: 1 },
    ])
  })

  it('refuses a malformed catalog payload', async () => {
    const catalog = createCatalog({
      providerId: PROVIDER_ID,
      baseUrl: BASE,
      apiKey: 'k',
      fetchImpl: async () => jsonResponse({ data: 'nope' }),
    })
    await expect(catalog.list()).rejects.toThrow('empty')
  })

  it('fails closed on images and tools for unlisted models', async () => {
    const provider = createClineProvider({
      apiKey: 'k',
      fetchImpl: async () =>
        jsonResponse({
          data: [modelRow('cline-pass/plain', { supported_parameters: ['temperature'] })],
        }),
    })
    expect(await provider.supportsImages('cline-pass/plain')).toBe(false)
    expect(await provider.supportsToolCalls('cline-pass/plain')).toBe(false)
    expect(await provider.supportsImages('missing/model')).toBe(false)
    expect(await provider.supportsToolCalls('missing/model')).toBe(false)
    expect((await provider.thinkingFor('missing/model')).kind).toBe('unknown')
  })

  it('lets catalog load failures surface instead of inventing a model', async () => {
    const catalog = createCatalog({
      providerId: PROVIDER_ID,
      baseUrl: BASE,
      apiKey: 'k',
      fetchImpl: async () => jsonResponse({ data: [] }),
    })
    await expect(catalog.get('cline-pass/kimi-k3')).rejects.toThrow('empty')
  })

  it('skips the router list when a stored picker matches the live feed', async () => {
    const store = createMemoryCatalogStore()
    let routerHits = 0
    const fetchImpl = async (input: string) => {
      if (String(input).endsWith(RECOMMENDED_MODELS_PATH)) {
        return jsonResponse({
          clinePass: [{ id: 'cline-pass/kimi-k3', name: 'Kimi K3' }],
          free: [{ id: 'cline-free/kimi-k3', name: 'Kimi K3' }],
        })
      }
      routerHits += 1
      return jsonResponse({
        data: [
          modelRow('moonshotai/kimi-k3', {
            name: 'MoonshotAI: Kimi K3',
            supported_parameters: ['reasoning_effort'],
          }),
        ],
      })
    }
    const first = createCatalog({
      providerId: PROVIDER_ID,
      baseUrl: BASE,
      apiKey: 'k',
      fetchImpl,
      store,
      ttlMs: 0,
      now: () => 1,
    })
    expect((await first.list()).map((model) => model.id)).toEqual([
      'cline-pass/kimi-k3',
      'cline-free/kimi-k3',
    ])
    expect(routerHits).toBe(1)

    const second = createCatalog({
      providerId: PROVIDER_ID,
      baseUrl: BASE,
      apiKey: 'k',
      fetchImpl,
      store,
      ttlMs: 0,
      now: () => 1,
    })
    expect((await second.list()).map((model) => model.id)).toEqual([
      'cline-pass/kimi-k3',
      'cline-free/kimi-k3',
    ])
    expect(routerHits).toBe(1)
    expect((await second.get('cline-pass/kimi-k3'))?.thinking.kind).toBe('effort')
  })

  it('does not hit the network while a stored picker is still fresh', async () => {
    const store = createMemoryCatalogStore()
    let hits = 0
    const fetchImpl = async (input: string) => {
      hits += 1
      if (String(input).endsWith(RECOMMENDED_MODELS_PATH)) {
        return jsonResponse({ clinePass: [{ id: 'cline-pass/glm-5.2', name: 'GLM 5.2' }] })
      }
      return jsonResponse({ data: [modelRow('cline-pass/glm-5.2', { name: 'GLM 5.2' })] })
    }
    await createCatalog({
      providerId: PROVIDER_ID,
      baseUrl: BASE,
      apiKey: 'k',
      fetchImpl,
      store,
      ttlMs: 60_000,
      now: () => 0,
    }).list()
    expect(hits).toBe(2)

    await createCatalog({
      providerId: PROVIDER_ID,
      baseUrl: BASE,
      apiKey: 'k',
      fetchImpl,
      store,
      ttlMs: 60_000,
      now: () => 1_000,
    }).list()
    expect(hits).toBe(2)
  })

  it('refetches the router list when the live feed changes', async () => {
    const store = createMemoryCatalogStore()
    let routerHits = 0
    let passId = 'cline-pass/kimi-k3'
    const fetchImpl = async (input: string) => {
      if (String(input).endsWith(RECOMMENDED_MODELS_PATH)) {
        return jsonResponse({ clinePass: [{ id: passId, name: passId }] })
      }
      routerHits += 1
      return jsonResponse({
        data: [modelRow(passId === 'cline-pass/kimi-k3' ? 'moonshotai/kimi-k3' : 'z-ai/glm-5.3', { name: passId })],
      })
    }
    await createCatalog({
      providerId: PROVIDER_ID,
      baseUrl: BASE,
      apiKey: 'k',
      fetchImpl,
      store,
      ttlMs: 0,
      now: () => 1,
    }).list()
    expect(routerHits).toBe(1)
    passId = 'cline-pass/glm-5.3'
    const next = await createCatalog({
      providerId: PROVIDER_ID,
      baseUrl: BASE,
      apiKey: 'k',
      fetchImpl,
      store,
      ttlMs: 0,
      now: () => 1,
    }).list()
    expect(routerHits).toBe(2)
    expect(next.map((model) => model.id)).toEqual(['cline-pass/glm-5.3'])
  })
})

describe('Cline request identity', () => {
  it('asks as the Desktop client so the live Desktop free promo is in the feed', () => {
    expect(CLINE_CLIENT_TYPE).toBe('cline-desktop')
    expect(clineAuthHeaders('tok')['X-CLIENT-TYPE']).toBe('cline-desktop')
    expect(clineAuthHeaders('tok')['Authorization']).toBe('Bearer workos:tok')
  })

  it('prefixes a raw access token with workos and does not double-prefix', () => {
    expect(formatClineBearer('raw-access')).toBe('workos:raw-access')
    expect(formatClineBearer('workos:raw-access')).toBe('workos:raw-access')
    expect(formatClineBearer('WORKOS:raw-access')).toBe('WORKOS:raw-access')
  })
})

describe('ClinePass recommended feed', () => {
  it('keeps cline-pass ids and drops the router buckets', () => {
    const body = {
      recommended: [{ id: 'anthropic/claude-sonnet-4.6' }],
      free: [{ id: 'cline-free/kimi-k3', name: 'Kimi K3' }, { id: 'z-ai/glm-5.3-flash' }],
      clinePass: [
        { id: 'cline-pass/kimi-k3', name: 'Kimi K3' },
        { id: 'anthropic/claude-sonnet-4.6' },
        { id: '' },
        12,
      ],
    }
    expect(parseClinePassFeed(body)).toEqual([{ id: 'cline-pass/kimi-k3', name: 'Kimi K3' }])
    expect(parseClineFreeFeed(body)).toEqual([
      { id: 'cline-free/kimi-k3', name: 'Kimi K3' },
      { id: 'z-ai/glm-5.3-flash' },
    ])
    expect(feedFingerprint(parseClinePassFeed(body), parseClineFreeFeed(body))).toBe(
      'cline-pass/kimi-k3\tKimi K3\n--\ncline-free/kimi-k3\tKimi K3\nz-ai/glm-5.3-flash\t',
    )
  })
})

describe('Cline chat body', () => {
  it('sends reasoning and include_reasoning without OpenRouter host routing', () => {
    const body = buildChatBody(
      {
        model: 'cline-pass/qwen3.7-max',
        messages: [{ role: 'user', content: 'hi' }],
        reasoningEffort: 'high',
      },
      { includeReasoning: true },
    )
    expect(body['reasoning']).toEqual({ effort: 'high' })
    expect(body['include_reasoning']).toBe(true)
    expect('provider' in body).toBe(false)
    expect('reasoning_effort' in body).toBe(false)
  })

  it('omits reasoning for default and off', () => {
    for (const reasoningEffort of ['default', 'off'] as const) {
      const body = buildChatBody({ model: 'm', messages: [], reasoningEffort })
      expect('reasoning' in body).toBe(false)
    }
  })
})

describe('Cline chat errors', () => {
  it('maps 401 to auth', async () => {
    const client = createChatClient({
      providerId: PROVIDER_ID,
      baseUrl: BASE,
      apiKey: 'k',
      fetchImpl: async () => jsonResponse({ error: { message: 'nope' } }, 401),
    })
    try {
      await client.chat({ model: 'm', messages: [] })
      throw new Error('expected failure')
    } catch (error) {
      expect((error as ProviderError).code).toBe('auth')
    }
  })
})

describe('Cline stream', () => {
  it('shows the Cline HTTP error body when it is plain text', async () => {
    const streaming = createStreamingClient({
      baseUrl: BASE,
      apiKey: 'tok',
      fetchImpl: async () => new Response('model is not available', { status: 404 }),
    })
    const events = []
    for await (const event of streaming.stream({ model: 'm', messages: [] })) events.push(event)
    expect(events[0]).toMatchObject({ type: 'error', message: 'model is not available', errorStatus: 404 })
  })

  it('posts completions to api.cline.bot and yields text', async () => {
    let seen = ''
    let posted: Record<string, unknown> = {}
    const streaming = createStreamingClient({
      baseUrl: BASE,
      apiKey: 'tok',
      fetchImpl: async (input, init) => {
        seen = String(input)
        const headers = new Headers(init?.headers)
        expect(headers.get('X-CLIENT-TYPE')).toBe(CLINE_CLIENT_TYPE)
        expect(headers.get('Authorization')).toBe('Bearer workos:tok')
        posted = JSON.parse(String(init?.body)) as Record<string, unknown>
        const payload =
          'data: ' +
          JSON.stringify({ choices: [{ delta: { content: 'Hello' }, finish_reason: 'stop' }] }) +
          '\n\ndata: [DONE]\n\n'
        return new Response(payload, { status: 200, headers: { 'content-type': 'text/event-stream' } })
      },
    })

    const events = []
    for await (const event of streaming.stream(
      { model: 'cline-pass/qwen3.7-max', messages: [{ role: 'user', content: 'Hi' }] },
      { includeReasoning: true },
    )) {
      events.push(event)
    }

    expect(seen).toBe(joinUrl(BASE, '/api/v1/chat/completions'))
    expect(posted['stream']).toBe(true)
    expect(posted['include_reasoning']).toBe(true)
    expect('provider' in posted).toBe(false)
    expect(events.some((event) => event.type === 'text' && event.text === 'Hello')).toBe(true)
    expect(events.at(-1)).toMatchObject({ type: 'done', stopReason: 'stop' })
  })
})
