import { describe, expect, it } from 'bun:test'

import { ProviderError, type ProviderErrorCode, providerErrorIdentifier } from '../backend/providers/errors'
import { createProvider } from '../backend/providers/create'
import { createOpenCodeProvider } from '../backend/providers/opencode'
import { createCatalog } from '../backend/providers/openrouter/catalog'
import { createChatClient, buildChatBody } from '../backend/providers/openrouter/client'
import { createOpenRouterProvider } from '../backend/providers/openrouter'
import { createHostLists } from '../backend/providers/openrouter/hosts'
import { parseEndpoints, routingBody } from '../backend/providers/openrouter/routing'
import { endpointsPath, joinUrl } from '../backend/providers/openrouter/endpoints'
import { createStreamingClient } from '../backend/providers/openrouter/stream'
import { retryableModelError } from '../backend/chat/retry/classify'

const BASE = 'https://openrouter.ai/api/v1'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function modelRow(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { id, name: extra['name'] ?? id, created: 1, context_length: 200_000, ...extra }
}

describe('openrouter endpoints path', () => {
  it('splits author/slug without doubling slashes', () => {
    expect(joinUrl(BASE, '/models')).toBe(BASE + '/models')
    expect(endpointsPath('anthropic/claude-sonnet-4')).toBe('/models/anthropic/claude-sonnet-4/endpoints')
  })

  it('rejects ids that are not author/slug', () => {
    expect(() => endpointsPath('glm-5.3')).toThrow(/author\/slug/)
  })
})

describe('openrouter catalog', () => {
  it('reads name, author, context, thinking, images and tools from the vendor list', async () => {
    const catalog = createCatalog({
      providerId: 'openrouter',
      baseUrl: BASE,
      apiKey: 'k',
      fetchImpl: async () => jsonResponse({
        data: [
          modelRow('anthropic/claude-sonnet-4', {
            name: 'Claude Sonnet 4',
            architecture: { input_modalities: ['text', 'image'] },
            supported_parameters: ['tools', 'reasoning'],
            reasoning: { supported_efforts: ['high', 'medium', 'low'] },
          }),
          { object: 'model' },
          { id: '' },
        ],
      }),
    })

    const models = await catalog.list()
    expect(models).toEqual([
      { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4', ownedBy: 'anthropic', created: 1 },
    ])
    const entry = await catalog.get('anthropic/claude-sonnet-4')
    expect(entry?.context).toBe(200_000)
    expect(entry?.thinking).toEqual({ reasoning: true, kind: 'effort', levels: ['high', 'medium', 'low'] })
    expect(entry?.images).toBe(true)
    expect(entry?.tools).toBe(true)
  })

  it('treats a reasoning model with no effort list as unknown', async () => {
    const catalog = createCatalog({
      providerId: 'openrouter',
      baseUrl: BASE,
      apiKey: 'k',
      fetchImpl: async () => jsonResponse({
        data: [modelRow('deepseek/deepseek-r1', { supported_parameters: ['reasoning'] })],
      }),
    })
    expect((await catalog.get('deepseek/deepseek-r1'))?.thinking).toEqual({
      reasoning: true, kind: 'unknown', levels: [],
    })
  })

  it('treats a model that never mentions reasoning as none', async () => {
    const catalog = createCatalog({
      providerId: 'openrouter',
      baseUrl: BASE,
      apiKey: 'k',
      fetchImpl: async () => jsonResponse({
        data: [modelRow('openai/gpt-4o', { supported_parameters: ['tools'] })],
      }),
    })
    expect((await catalog.get('openai/gpt-4o'))?.thinking).toEqual({
      reasoning: false, kind: 'none', levels: [],
    })
  })

  it('refuses an empty catalog', async () => {
    const catalog = createCatalog({
      providerId: 'openrouter',
      baseUrl: BASE,
      apiKey: 'k',
      fetchImpl: async () => jsonResponse({ data: [] }),
    })
    await expect(catalog.list()).rejects.toThrow('empty')
  })

  it('refuses a malformed catalog payload', async () => {
    const catalog = createCatalog({
      providerId: 'openrouter',
      baseUrl: BASE,
      apiKey: 'k',
      fetchImpl: async () => jsonResponse({ data: 'nope' }),
    })
    await expect(catalog.list()).rejects.toThrow('empty')
  })

  it('fails closed on images and listed-without-tools, and open on unlisted tools', async () => {
    const provider = createOpenRouterProvider({
      apiKey: 'k',
      fetchImpl: async () => jsonResponse({
        data: [modelRow('openai/gpt-4o', { supported_parameters: ['temperature'] })],
      }),
    })
    expect(await provider.supportsImages('openai/gpt-4o')).toBe(false)
    expect(await provider.supportsToolCalls('openai/gpt-4o')).toBe(false)
    expect(await provider.supportsImages('missing/model')).toBe(false)
    expect(await provider.supportsToolCalls('missing/model')).toBe(true)
  })
})

describe('openrouter chat body', () => {
  it('sends reasoning.effort and default latency routing, not reasoning_effort', () => {
    const body = buildChatBody({
      model: 'anthropic/claude-sonnet-4',
      messages: [{ role: 'user', content: 'hi' }],
      reasoningEffort: 'high',
    })
    expect(body['reasoning']).toEqual({ effort: 'high' })
    expect('reasoning_effort' in body).toBe(false)
    expect(body['provider']).toEqual({ sort: 'latency' })
  })

  it('omits reasoning for default and off', () => {
    for (const reasoningEffort of ['default', 'off'] as const) {
      const body = buildChatBody({ model: 'm', messages: [], reasoningEffort })
      expect('reasoning' in body).toBe(false)
    }
  })

  it('pins a host and requires parameters when tools are present', () => {
    const body = buildChatBody({
      model: 'm',
      messages: [],
      route: { only: 'anthropic' },
      tools: [{ type: 'function', function: { name: 'compute' } }],
    })
    expect(body['provider']).toEqual({
      only: ['anthropic'],
      allow_fallbacks: false,
      require_parameters: true,
    })
  })

  it('sends vendor none as reasoning.effort rather than omitting it', () => {
    const body = buildChatBody({
      model: 'm',
      messages: [],
      reasoningEffort: 'none',
    })
    expect(body['reasoning']).toEqual({ effort: 'none' })
  })
})

describe('openrouter routing parse', () => {
  it('reads tags, latency and context from a wrapped endpoints payload', () => {
    const endpoints = parseEndpoints({
      data: {
        id: 'anthropic/claude-sonnet-4',
        endpoints: [
          {
            tag: 'anthropic',
            provider_name: 'Anthropic',
            context_length: 200_000,
            latency_last_30m: { p50: 120 },
            throughput_last_30m: { p50: 40 },
            uptime_last_30m: 99.5,
            quantization: 'fp8',
            pricing: { prompt: '0.000003', completion: '0.000015', discount: 0.2 },
            status: 0,
          },
          { provider_name: 'Google' },
        ],
      },
    })
    expect(endpoints[0]).toMatchObject({
      tag: 'anthropic',
      providerName: 'Anthropic',
      contextLength: 200_000,
      latencyMs: 120,
      throughput: 40,
      promptPrice: 0.000003,
      completionPrice: 0.000015,
      discount: 0.2,
      quantization: 'fp8',
    })
    expect(endpoints[1]?.tag).toBe('google')
  })

  it('defaults sort to latency and pins with no fallbacks', () => {
    expect(routingBody(undefined, false)).toEqual({ sort: 'latency' })
    expect(routingBody({ sort: 'throughput' }, false)).toEqual({ sort: 'throughput' })
    expect(routingBody({ only: 'anthropic' }, false)).toEqual({
      only: ['anthropic'],
      allow_fallbacks: false,
    })
  })
})

describe('openrouter chat errors', () => {
  it('maps 402 to credits and 403 to auth', async () => {
    const cases: Array<[number, ProviderErrorCode]> = [
      [402, 'credits'],
      [403, 'auth'],
      [429, 'rate_limit'],
      [503, 'server'],
    ]
    for (const [status, code] of cases) {
      const client = createChatClient({
        providerId: 'openrouter',
        baseUrl: BASE,
        apiKey: 'k',
        fetchImpl: async () => jsonResponse({ error: { message: 'nope', code: status } }, status),
      })
      try {
        await client.chat({ model: 'm', messages: [] })
        throw new Error('expected failure for ' + status)
      } catch (error) {
        expect((error as ProviderError).code).toBe(code)
      }
    }
  })
})

describe('openrouter retry covering', () => {
  it('does not retry credits, guardrails, or a routing miss', () => {
    expect(retryableModelError({ errorStatus: 402, errorCode: 'credits', message: 'Insufficient credits' })).toBe(false)
    expect(retryableModelError({ errorCode: 'credits', message: 'payment required' })).toBe(false)
    expect(retryableModelError({ errorStatus: 403, message: 'Request blocked: guardrail' })).toBe(false)
    expect(retryableModelError({ errorStatus: 503, message: 'No available provider that meets your routing requirements' })).toBe(false)
  })

  it('retries 429 and 502', () => {
    expect(retryableModelError({ errorStatus: 429, message: 'Rate limit exceeded' })).toBe(true)
    expect(retryableModelError({ errorStatus: 502, message: 'Provider returned error' })).toBe(true)
  })

  it('reads error_type from metadata', () => {
    expect(providerErrorIdentifier({
      error: { code: 429, message: 'slow', metadata: { error_type: 'rate_limit_exceeded' } },
    })).toContain('rate_limit_exceeded')
  })
})

describe('openrouter provider windows', () => {
  it('uses a pinned host context length when that tag exists', async () => {
    const provider = createOpenRouterProvider({
      apiKey: 'k',
      fetchImpl: async (input) => {
        const url = String(input)
        if (url.endsWith('/models')) {
          return jsonResponse({ data: [modelRow('anthropic/claude-sonnet-4', { context_length: 200_000 })] })
        }
        if (url.includes('/endpoints')) {
          return jsonResponse({
            data: {
              endpoints: [
                { tag: 'anthropic', provider_name: 'Anthropic', context_length: 200_000 },
                { tag: 'google', provider_name: 'Google', context_length: 100_000 },
              ],
            },
          })
        }
        return jsonResponse({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] })
      },
    })

    expect(await provider.contextWindowFor('anthropic/claude-sonnet-4')).toBe(200_000)
    expect(await provider.contextWindowFor('anthropic/claude-sonnet-4', { only: 'google' })).toBe(100_000)
  })
})

describe('openrouter hosts list', () => {
  it('fetches endpoints for author/slug', async () => {
    let seen = ''
    const hosts = createHostLists({
      providerId: 'openrouter',
      baseUrl: BASE,
      apiKey: 'k',
      fetchImpl: async (input) => {
        seen = String(input)
        return jsonResponse({ endpoints: [{ tag: 'anthropic', provider_name: 'Anthropic', context_length: 1 }] })
      },
    })
    const listed = await hosts.list('anthropic/claude-sonnet-4')
    expect(seen).toBe(BASE + '/models/anthropic/claude-sonnet-4/endpoints')
    expect(listed[0]?.tag).toBe('anthropic')
  })
})

describe('openrouter stream', () => {
  function sseResponse(chunks: string[], status = 200): Response {
    const encoder = new TextEncoder()
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
        controller.close()
      },
    })
    return new Response(body, { status, headers: { 'Content-Type': 'text/event-stream' } })
  }

  it('surfaces a plain-text HTTP error body', async () => {
    const client = createStreamingClient({
      baseUrl: BASE,
      apiKey: 'k',
      fetchImpl: async () => new Response('unsupported parameter: max_output_tokens', { status: 400 }),
    })
    const events = []
    for await (const event of client.stream({ model: 'm', messages: [] })) events.push(event)
    expect(events[0]).toMatchObject({
      type: 'error',
      message: 'unsupported parameter: max_output_tokens',
      errorStatus: 400,
    })
  })

  it('carries mid-stream error_type and status', async () => {
    const client = createStreamingClient({
      baseUrl: BASE,
      apiKey: 'k',
      fetchImpl: async () => sseResponse([
        'data: {"choices":[{"delta":{"content":"a"},"finish_reason":null}]}\n\n',
        'data: {"error":{"code":429,"message":"Rate limit exceeded","metadata":{"error_type":"rate_limit_exceeded"}},"choices":[{"delta":{"content":""},"finish_reason":"error"}]}\n\n',
      ]),
    })
    const events = []
    for await (const event of client.stream({ model: 'm', messages: [] })) events.push(event)
    const error = events.find((event) => event.type === 'error')
    expect(error?.message).toContain('Rate limit exceeded')
    expect(error?.errorStatus).toBe(429)
    expect(error?.errorCode).toContain('rate_limit_exceeded')
  })

  it('sends reasoning and provider on the stream body, without a session header', async () => {
    let sent: Record<string, unknown> = {}
    let headers: Record<string, string> = {}
    const client = createStreamingClient({
      baseUrl: BASE,
      apiKey: 'secret',
      fetchImpl: async (_input, init) => {
        sent = JSON.parse(String(init?.body))
        headers = init?.headers as Record<string, string>
        return sseResponse(['data: [DONE]\n\n'])
      },
    })
    for await (const _event of client.stream({
      model: 'openai/o3-mini',
      messages: [{ role: 'user', content: 'hi' }],
      reasoningEffort: 'high',
      route: { sort: 'throughput' },
    })) {
      void _event
    }
    expect(sent['reasoning']).toEqual({ effort: 'high' })
    expect(sent['provider']).toEqual({ sort: 'throughput' })
    expect('reasoning_effort' in sent).toBe(false)
    expect(headers['x-opencode-session']).toBeUndefined()
  })
})

describe('openrouter thinking verification', () => {
  it('omits unverified effort and sends a listed vendor none', async () => {
    const bodies: Record<string, unknown>[] = []
    const provider = createOpenRouterProvider({
      apiKey: 'k',
      fetchImpl: async (input, init) => {
        const url = String(input)
        if (url.endsWith('/models')) {
          return jsonResponse({
            data: [modelRow('anthropic/claude-sonnet-4', {
              supported_parameters: ['reasoning'],
              reasoning: { supported_efforts: ['none', 'high'] },
            })],
          })
        }
        bodies.push(JSON.parse(String(init?.body)))
        return jsonResponse({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] })
      },
    })

    await provider.chat({
      model: 'anthropic/claude-sonnet-4',
      messages: [{ role: 'user', content: 'hi' }],
      reasoningEffort: 'medium',
    })
    expect('reasoning' in (bodies[0] ?? {})).toBe(false)

    await provider.chat({
      model: 'anthropic/claude-sonnet-4',
      messages: [{ role: 'user', content: 'hi' }],
      reasoningEffort: 'none',
    })
    expect(bodies[1]?.['reasoning']).toEqual({ effort: 'none' })

    await provider.chat({
      model: 'anthropic/claude-sonnet-4',
      messages: [{ role: 'user', content: 'hi' }],
      reasoningEffort: 'high',
    })
    expect(bodies[2]?.['reasoning']).toEqual({ effort: 'high' })
  })
})

describe('provider factory', () => {
  it('builds OpenRouter and leaves OpenCode without a host list', () => {
    expect(createProvider('openrouter', 'k')?.id).toBe('openrouter')
    expect(createProvider('opencode-go', 'k')?.id).toBe('opencode-go')
    expect(createProvider('nope', 'k')).toBeUndefined()
    expect(createOpenCodeProvider({ apiKey: 'k' }).listEndpoints).toBeUndefined()
  })
})
