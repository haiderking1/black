import { describe, expect, it } from 'bun:test'
import { arch, platform, release } from 'node:os'

import { createCodexProvider } from '../backend/providers/codex'
import { buildRequestBody } from '../backend/providers/codex/body'
import { listCodexModels, thinkingFor, imagesFor, contextWindowFor } from '../backend/providers/codex/catalog'
import { resolveCodexModelsUrl, resolveCodexUrl } from '../backend/providers/codex/endpoints'
import { CODEX_CLIENT_VERSION } from '../backend/providers/codex/remoteCatalog'
import { buildCodexHeaders, userAgent } from '../backend/providers/codex/headers'
import { convertMessages, convertTools } from '../backend/providers/codex/messages'
import { ORIGINATOR } from '../backend/providers/codex/oauth/constants'
import { createStreamingClient } from '../backend/providers/codex/stream'
import { createProvider } from '../backend/providers/create'
import { PROVIDER_DESCRIPTORS } from '../backend/providers/descriptors'

function accessToken(accountId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: accountId } }),
  ).toString('base64url')
  return 'hdr.' + payload + '.sig'
}

function sse(events: unknown[]): string {
  return events.map((event) => 'data: ' + JSON.stringify(event)).join('\n\n') + '\n\n'
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('Codex catalog', () => {
  it('lists the ChatGPT Codex models this client can actually send', () => {
    const ids = listCodexModels().map((model) => model.id)
    expect(ids).toContain('gpt-5.5')
    expect(ids).toContain('gpt-5.6-sol')
    expect(ids).toContain('gpt-6-astra')
    expect(ids).toContain('gpt-5.3-codex-spark')
  })

  it('discovers newly released models from the authenticated Codex catalog', async () => {
    let requestedUrl = ''
    let requestedHeaders: Headers | undefined
    const provider = createCodexProvider({
      baseUrl: 'https://chatgpt.test/backend-api',
      apiKey: accessToken('acct'),
      fetchImpl: async (input, init) => {
        requestedUrl = input
        requestedHeaders = new Headers(init?.headers)
        return jsonResponse({
          models: [
            {
              slug: 'gpt-7-codex',
              display_name: 'GPT-7 Codex',
              visibility: 'list',
              supported_in_api: true,
              context_window: 256_000,
              minimal_client_version: '0.155.0',
              supported_reasoning_levels: [{ effort: 'medium' }, { effort: 'high' }, { effort: 'xhigh' }, { effort: 'ultra' }],
              shell_type: 'shell_command',
              input_modalities: ['text', 'image'],
            },
          ],
        })
      },
    })

    const models = await provider.listModels()
    expect(models).toContainEqual({
      id: 'gpt-7-codex',
      ownedBy: 'openai',
      created: 0,
      name: 'GPT-7 Codex',
    })
    expect(new URL(requestedUrl).pathname).toBe('/backend-api/codex/models')
    expect(new URL(requestedUrl).searchParams.get('client_version')).toBe(CODEX_CLIENT_VERSION)
    expect(CODEX_CLIENT_VERSION).toBe('0.155.0')
    expect(requestedHeaders?.get('chatgpt-account-id')).toBe('acct')
    expect(await provider.contextWindowFor('gpt-7-codex')).toBe(256_000)
    expect(await provider.thinkingFor('gpt-7-codex')).toEqual({
      reasoning: true,
      kind: 'effort',
      levels: ['medium', 'high', 'xhigh', 'ultra'],
    })
    expect(await provider.supportsImages('gpt-7-codex')).toBe(true)
    expect(await provider.supportsToolCalls('gpt-7-codex')).toBe(true)
  })

  it('surfaces model-discovery failures instead of silently returning the bundled list', async () => {
    const provider = createCodexProvider({
      apiKey: accessToken('acct'),
      fetchImpl: async () => jsonResponse({ message: 'models endpoint denied this token' }, 403),
    })

    await expect(provider.listModels()).rejects.toThrow('models endpoint denied this token')
  })

  it('exposes effort levels the Responses API accepts', () => {
    expect(thinkingFor('gpt-5.5')).toEqual({
      reasoning: true,
      kind: 'effort',
      levels: ['low', 'medium', 'high', 'xhigh'],
    })
    expect(thinkingFor('gpt-5.6-sol').levels).toContain('max')
    expect(imagesFor('gpt-5.3-codex-spark')).toBe(false)
    expect(contextWindowFor('gpt-5.3-codex-spark')).toBe(128_000)
    expect(thinkingFor('not-a-model').kind).toBe('unknown')
  })
})

describe('Codex descriptors', () => {
  it('registers Codex as an OAuth provider', () => {
    const descriptor = PROVIDER_DESCRIPTORS.find((entry) => entry.id === 'openai-codex')
    expect(descriptor).toMatchObject({
      id: 'openai-codex',
      name: 'OpenAI Codex',
      authKind: 'oauth',
      baseUrl: 'https://chatgpt.com/backend-api',
    })
    expect(createProvider('openai-codex', accessToken('acct'))?.id).toBe('openai-codex')
  })
})

describe('Codex request conversion', () => {
  it('lifts the first system message into instructions and keeps later turns as input', () => {
    const converted = convertMessages([
      { role: 'system', content: 'Be terse.' },
      { role: 'user', content: 'Hello', images: [{ mimeType: 'image/png', data: 'aaa' }] },
      {
        role: 'assistant',
        content: 'Hi',
        thinkingSignature: JSON.stringify({ type: 'reasoning', id: 'rs_1', encrypted_content: 'enc' }),
        toolCalls: [{ id: 'call_1|fc_1', name: 'bash', arguments: '{"cmd":"ls"}' }],
      },
      { role: 'tool', content: 'ok', toolCallId: 'call_1|fc_1' },
    ])
    expect(converted.instructions).toBe('Be terse.')
    expect(converted.input[0]).toEqual({
      role: 'user',
      content: [
        { type: 'input_text', text: 'Hello' },
        { type: 'input_image', detail: 'auto', image_url: 'data:image/png;base64,aaa' },
      ],
    })
    expect(converted.input).toEqual(
      expect.arrayContaining([
        { type: 'reasoning', id: 'rs_1', encrypted_content: 'enc' },
        expect.objectContaining({ type: 'function_call', call_id: 'call_1', id: 'fc_1', name: 'bash' }),
        { type: 'function_call_output', call_id: 'call_1', output: 'ok' },
      ]),
    )
  })

  it('converts completions-shaped tools into Responses functions', () => {
    expect(
      convertTools([
        { type: 'function', function: { name: 'bash', description: 'Run', parameters: { type: 'object' } } },
      ]),
    ).toEqual([
      { type: 'function', name: 'bash', description: 'Run', parameters: { type: 'object' }, strict: false },
    ])
  })

  it('sends reasoning effort and a prompt cache key', () => {
    const body = buildRequestBody({
      model: 'gpt-5.5',
      messages: [{ role: 'user', content: 'Hi' }],
      reasoningEffort: 'xhigh',
      sessionId: 'session-1',
    })
    expect(body.reasoning).toEqual({ effort: 'xhigh', summary: 'auto' })
    expect(body.prompt_cache_key).toBe('session-1')
    expect(body.include).toEqual(['reasoning.encrypted_content'])
    expect(body.store).toBe(false)
    expect(body.stream).toBe(true)
  })

  it('omits maxTokens because the Codex Responses endpoint rejects max_output_tokens', () => {
    const body = buildRequestBody({
      model: 'gpt-6-luna',
      messages: [{ role: 'user', content: 'Summarize this conversation.' }],
      maxTokens: 20_000,
    })
    expect(body).not.toHaveProperty('max_output_tokens')
  })

  it('maps minimal effort to low and omits off', () => {
    expect(
      buildRequestBody({
        model: 'gpt-5.5',
        messages: [{ role: 'user', content: 'Hi' }],
        reasoningEffort: 'minimal',
      }).reasoning,
    ).toEqual({ effort: 'low', summary: 'auto' })
    expect(
      buildRequestBody({
        model: 'gpt-5.5',
        messages: [{ role: 'user', content: 'Hi' }],
        reasoningEffort: 'off',
      }).reasoning,
    ).toBeUndefined()
  })
})

describe('Codex headers and URL', () => {
  it('points at the ChatGPT Responses and model catalog endpoints', () => {
    expect(resolveCodexUrl()).toBe('https://chatgpt.com/backend-api/codex/responses')
    expect(resolveCodexUrl('https://chatgpt.com/backend-api/')).toBe(
      'https://chatgpt.com/backend-api/codex/responses',
    )
    expect(resolveCodexModelsUrl()).toBe('https://chatgpt.com/backend-api/codex/models')
    expect(resolveCodexModelsUrl('https://chatgpt.com/backend-api/codex/responses')).toBe(
      'https://chatgpt.com/backend-api/codex/models',
    )
  })

  it('sends the account id, experimental beta, and originator', () => {
    const headers = buildCodexHeaders({
      accessToken: 'tok',
      accountId: 'acct',
      sessionId: 'sess',
    })
    expect(headers.get('Authorization')).toBe('Bearer tok')
    expect(headers.get('chatgpt-account-id')).toBe('acct')
    expect(headers.get('originator')).toBe(ORIGINATOR)
    expect(headers.get('OpenAI-Beta')).toBe('responses=experimental')
    expect(headers.get('session-id')).toBe('sess')
    expect(headers.get('User-Agent')).toBe(userAgent())
    expect(userAgent()).toBe(ORIGINATOR + ' (' + platform() + ' ' + release() + '; ' + arch() + ')')
  })
})

describe('Codex stream', () => {
  it('streams text, thinking signatures, and tool calls from Responses SSE', async () => {
    const token = accessToken('acct_stream')
    const payload = sse([
      {
        type: 'response.output_item.added',
        output_index: 0,
        item: { type: 'function_call', id: 'fc_1', call_id: 'call_1', name: 'bash', arguments: '' },
      },
      { type: 'response.reasoning_summary_text.delta', delta: 'plan' },
      {
        type: 'response.output_item.done',
        output_index: 1,
        item: { type: 'reasoning', id: 'rs_1', encrypted_content: 'enc', summary: [{ text: 'plan' }] },
      },
      { type: 'response.output_text.delta', delta: 'Hello' },
      { type: 'response.function_call_arguments.delta', output_index: 0, delta: '{"c":' },
      {
        type: 'response.output_item.done',
        output_index: 0,
        item: { type: 'function_call', id: 'fc_1', call_id: 'call_1', name: 'bash', arguments: '{"c":"ls"}' },
      },
      {
        type: 'response.completed',
        response: {
          status: 'completed',
          usage: { input_tokens: 5, output_tokens: 3, total_tokens: 8 },
        },
      },
    ])

    const streaming = createStreamingClient({
      baseUrl: 'https://chatgpt.com/backend-api',
      apiKey: token,
      fetchImpl: async (url, init) => {
        expect(url).toBe('https://chatgpt.com/backend-api/codex/responses')
        const headers = init?.headers instanceof Headers ? init.headers : new Headers()
        expect(headers.get('chatgpt-account-id')).toBe('acct_stream')
        expect(headers.get('Authorization')).toBe('Bearer ' + token)
        return new Response(payload, { status: 200, headers: { 'content-type': 'text/event-stream' } })
      },
    })

    const events = []
    for await (const event of streaming.stream({ model: 'gpt-5.5', messages: [{ role: 'user', content: 'Hi' }] })) {
      events.push(event)
    }

    expect(events.some((event) => event.type === 'text' && event.text === 'Hello')).toBe(true)
    expect(events.some((event) => event.type === 'thinking' && event.thinkingSignature?.includes('rs_1'))).toBe(true)
    const tools = events.find((event) => event.type === 'tool_calls')
    expect(tools?.toolCalls).toEqual([{ id: 'call_1|fc_1', name: 'bash', arguments: '{"c":"ls"}' }])
    expect(events.at(-1)).toMatchObject({ type: 'done', stopReason: 'stop', usage: { input: 5, output: 3, total: 8 } })
  })

  it('turns a ChatGPT usage limit body into a readable error', async () => {
    const streaming = createStreamingClient({
      baseUrl: 'https://chatgpt.com/backend-api',
      apiKey: accessToken('acct'),
      fetchImpl: async () =>
        jsonResponse(
          {
            error: {
              code: 'usage_limit_reached',
              message: 'limit',
              plan_type: 'plus',
              resets_at: Math.floor(Date.now() / 1000) + 120,
            },
          },
          429,
        ),
    })
    const events = []
    for await (const event of streaming.stream({ model: 'gpt-5.5', messages: [] })) events.push(event)
    expect(events[0]?.type).toBe('error')
    expect(events[0]?.message).toMatch(/ChatGPT usage limit \(plus plan\)/)
    expect(events[0]?.errorStatus).toBe(429)
  })

  it('surfaces validation details from a rejected summary or chat request', async () => {
    const streaming = createStreamingClient({
      baseUrl: 'https://chatgpt.com/backend-api',
      apiKey: accessToken('acct'),
      fetchImpl: async () => jsonResponse({ detail: [{ loc: ['body', 'max_output_tokens'], msg: 'value is too large' }] }, 400),
    })
    const events = []
    for await (const event of streaming.stream({ model: 'gpt-6-luna', messages: [] })) events.push(event)
    expect(events[0]).toMatchObject({ type: 'error', errorStatus: 400, message: 'value is too large' })
  })

  it('preserves a plain-text provider rejection instead of showing only its status', async () => {
    const streaming = createStreamingClient({
      baseUrl: 'https://chatgpt.com/backend-api',
      apiKey: accessToken('acct'),
      fetchImpl: async () => new Response('invalid max_output_tokens', { status: 400 }),
    })
    const events = []
    for await (const event of streaming.stream({ model: 'gpt-6-luna', messages: [] })) events.push(event)
    expect(events[0]).toMatchObject({ type: 'error', errorStatus: 400, message: 'invalid max_output_tokens' })
  })

  it('reports truncated EOF rather than completing a partial answer', async () => {
    const streaming = createStreamingClient({
      baseUrl: 'https://chatgpt.com/backend-api',
      apiKey: accessToken('acct'),
      fetchImpl: async () =>
        new Response('data: ' + JSON.stringify({ type: 'response.output_text.delta', delta: 'Partial' }) + '\n\n', {
          status: 200,
        }),
    })
    const events = []
    for await (const event of streaming.stream({ model: 'gpt-5.5', messages: [] })) events.push(event)
    expect(events.some((event) => event.type === 'text' && event.text === 'Partial')).toBe(true)
    expect(events.at(-1)).toMatchObject({
      type: 'error',
      message: 'Provider connection ended before the reply finished.',
    })
  })

  it('collects a non-streamed reply through the provider chat path', async () => {
    const provider = createCodexProvider({
      apiKey: accessToken('acct'),
      fetchImpl: async () =>
        new Response(
          sse([
            { type: 'response.output_text.delta', delta: 'Done' },
            {
              type: 'response.completed',
              response: { status: 'completed', usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } },
            },
          ]),
          { status: 200 },
        ),
    })
    const result = await provider.chat({ model: 'gpt-5.5', messages: [{ role: 'user', content: 'Hi' }] })
    expect(result).toMatchObject({ text: 'Done', stopReason: 'stop', usage: { total: 2 } })
  })
})
