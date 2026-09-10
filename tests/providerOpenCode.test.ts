import { describe, expect, it } from 'bun:test'

import { ProviderError, type ProviderErrorCode } from '../backend/providers/errors'
import { createCatalog } from '../backend/providers/opencode/catalog'
import { createChatClient } from '../backend/providers/opencode/client'
import { joinUrl } from '../backend/providers/opencode/endpoints'

const BASE = 'https://example.test/zen/go/v1'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function listBody(ids: string[]): unknown {
  return { object: 'list', data: ids.map((id) => ({ id, object: 'model', created: 1, owned_by: 'opencode' })) }
}

describe('joinUrl', () => {
  it('joins without doubling or dropping the separator', () => {
    expect(joinUrl('https://a.test/v1', '/models')).toBe('https://a.test/v1/models')
    expect(joinUrl('https://a.test/v1/', 'models')).toBe('https://a.test/v1/models')
  })
})

describe('catalog', () => {
  it('reads the model list from the vendor and caches it', async () => {
    let calls = 0
    const catalog = createCatalog({
      providerId: 'opencode-go',
      baseUrl: BASE,
      ttlMs: 1000,
      now: () => 0,
      fetchImpl: async () => {
        calls++
        return jsonResponse(listBody(['glm-5.3', 'kimi-k3']))
      },
    })

    const models = await catalog.list()
    expect(models.map((m) => m.id)).toEqual(['glm-5.3', 'kimi-k3'])
    expect(models[0]?.ownedBy).toBe('opencode')
    await catalog.list()
    expect(calls).toBe(1)
  })

  it('parses the real model-list shape and drops entries with no id', async () => {
    const catalog = createCatalog({
      providerId: 'opencode-go',
      baseUrl: BASE,
      fetchImpl: async () =>
        jsonResponse({
          object: 'list',
          data: [
            { id: 'good', object: 'model', created: 7, owned_by: 'vendor' },
            { object: 'model', created: 7 },
            { id: '', object: 'model' },
            'not-an-object',
          ],
        }),
    })

    expect(await catalog.list()).toEqual([{ id: 'good', ownedBy: 'vendor', created: 7 }])
  })

  it('refuses an empty catalog rather than returning nothing', async () => {
    const catalog = createCatalog({
      providerId: 'opencode-go',
      baseUrl: BASE,
      fetchImpl: async () => jsonResponse({ object: 'list', data: [] }),
    })
    await expect(catalog.list()).rejects.toThrow('empty')
  })

  it('maps HTTP failures onto provider codes', async () => {
    const rateLimited = createCatalog({
      providerId: 'opencode-go',
      baseUrl: BASE,
      fetchImpl: async () => jsonResponse({ error: { message: 'slow down' } }, 429),
    })
    await expect(rateLimited.list()).rejects.toThrow('slow down')

    try {
      await rateLimited.list()
    } catch (error) {
      expect(error).toBeInstanceOf(ProviderError)
      expect((error as ProviderError).code).toBe('rate_limit')
    }
  })

  it('reports a transport failure as a network error', async () => {
    const catalog = createCatalog({
      providerId: 'opencode-go',
      baseUrl: BASE,
      fetchImpl: async () => {
        throw new Error('dns exploded')
      },
    })
    try {
      await catalog.list()
    } catch (error) {
      expect((error as ProviderError).code).toBe('network')
    }
  })
})

describe('chat client', () => {
  function completion(text: string, finish = 'stop'): unknown {
    return {
      id: 'x',
      choices: [{ message: { role: 'assistant', content: text }, finish_reason: finish }],
      usage: { prompt_tokens: 11, completion_tokens: 5, total_tokens: 16 },
    }
  }

  it('sends the bearer token and the request body, then reads the completion', async () => {
    let seenUrl = ''
    let seenInit: RequestInit | undefined
    const client = createChatClient({
      providerId: 'opencode-go',
      baseUrl: BASE,
      apiKey: 'secret-key',
      fetchImpl: async (input, init) => {
        seenUrl = String(input)
        seenInit = init
        return jsonResponse(completion('hello'))
      },
    })

    const result = await client.chat({
      model: 'glm-5.3',
      messages: [{ role: 'user', content: 'hi' }],
      maxTokens: 64,
    })

    expect(seenUrl).toBe(BASE + '/chat/completions')
    expect((seenInit?.headers as Record<string, string>)['Authorization']).toBe('Bearer secret-key')
    expect(JSON.parse(String(seenInit?.body))).toEqual({
      model: 'glm-5.3',
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 64,
    })
    expect(result.text).toBe('hello')
    expect(result.usage).toEqual({ input: 11, output: 5, total: 16 })
    expect(result.stopReason).toBe('stop')
  })

  it('reports a length stop so a truncated answer is not mistaken for a complete one', async () => {
    const client = createChatClient({
      providerId: 'opencode-go',
      baseUrl: BASE,
      apiKey: 'k',
      fetchImpl: async () => jsonResponse(completion('half', 'length')),
    })
    expect((await client.chat({ model: 'm', messages: [] })).stopReason).toBe('length')
  })

  it('maps status codes onto provider error codes', async () => {
    const cases: Array<[number, ProviderErrorCode]> = [
      [401, 'auth'],
      [403, 'auth'],
      [429, 'rate_limit'],
      [500, 'server'],
      [503, 'server'],
      [400, 'bad_request'],
    ]

    for (const [status, code] of cases) {
      const client = createChatClient({
        providerId: 'opencode-go',
        baseUrl: BASE,
        apiKey: 'k',
        fetchImpl: async () => jsonResponse({ error: { message: 'nope' } }, status),
      })
      try {
        await client.chat({ model: 'm', messages: [] })
        throw new Error('expected a failure for status ' + status)
      } catch (error) {
        expect((error as ProviderError).code).toBe(code)
      }
    }
  })

  it('treats an error envelope returned with status 200 as a failure', async () => {
    const client = createChatClient({
      providerId: 'opencode-go',
      baseUrl: BASE,
      apiKey: 'k',
      fetchImpl: async () => jsonResponse({ type: 'error', error: { type: 'AuthError', message: 'Invalid API key.' } }),
    })
    await expect(client.chat({ model: 'm', messages: [] })).rejects.toThrow('Invalid API key.')
  })

  it('rejects a response with no choices instead of returning empty text', async () => {
    const client = createChatClient({
      providerId: 'opencode-go',
      baseUrl: BASE,
      apiKey: 'k',
      fetchImpl: async () => jsonResponse({ id: 'x', choices: [] }),
    })
    try {
      await client.chat({ model: 'm', messages: [] })
    } catch (error) {
      expect((error as ProviderError).code).toBe('malformed_response')
    }
  })

  it('reports an abort as an aborted result rather than a failure', async () => {
    const controller = new AbortController()
    const client = createChatClient({
      providerId: 'opencode-go',
      baseUrl: BASE,
      apiKey: 'k',
      fetchImpl: async () => {
        controller.abort()
        throw new Error('aborted')
      },
    })
    const result = await client.chat({ model: 'm', messages: [], signal: controller.signal })
    expect(result.stopReason).toBe('aborted')
    expect(result.text).toBe('')
  })
})
