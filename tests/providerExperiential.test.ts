import { describe, expect, it } from 'bun:test'
import { createExperientialProvider } from '../backend/providers/experiential'
import { createProvider } from '../backend/providers/create'
import { parseMetadata } from '../backend/providers/experiential/catalog'
import { findDescriptor } from '../backend/providers/descriptors'
import { thinkingOptionsFor } from '../frontend/composer/thinkingOptions'

const BASE = 'https://example.test/v1'
const CATALOG = 'https://example.test/api/models'
const callable = { data: [
  { id: 'alpha', owned_by: 'lab', created: 12 },
  { id: 'jev-latest', owned_by: 'typesafe', created: 13 },
  { id: 'beta', owned_by: 'lab', created: 14 },
  { id: 'alpha:free', canonical_slug: 'alpha', owned_by: 'lab', created: 15 },
] }
const metadata = (slug: string) => ({
  model: { slug, display_name: slug.toUpperCase(), context_window: 256000,
    input_modalities: ['text', 'image'], supported_params: { tools: true, reasoning: true } },
  providers: [{ status: 'active', routable: true,
    capabilities: { supported_reasoning_efforts: ['low', 'high'] } }],
})
const json = (value: unknown, status = 200): Response => new Response(JSON.stringify(value), {
  status, headers: { 'content-type': 'application/json' },
})
const responseStream = (events: unknown[]): Response => new Response(
  events.map(event => 'data: ' + JSON.stringify(event) + '\n\n').join('') + 'data: [DONE]\n\n',
  { headers: { 'content-type': 'text/event-stream' } },
)

function stub(fetchImpl: (input: string, init?: RequestInit) => Promise<Response>) {
  return createExperientialProvider({ apiKey: 'test-only', baseUrl: BASE, catalogUrl: CATALOG, fetchImpl })
}

describe('Experiential Labs provider', () => {
  it('registers as a distinct chat provider with a local key', () => {
    expect(findDescriptor('experiential')).toMatchObject({ authKind: 'api_key', role: 'chat', baseUrl: 'https://api.experientiallabs.ai/v1' })
    expect(createProvider('experiential', 'test-only')?.id).toBe('experiential')
  })

  it('uses the authenticated callable list, filters Jev and reads real capabilities', async () => {
    const requests: string[] = []
    const provider = stub(async (url, init) => {
      requests.push(url)
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer test-only')
      if (url === BASE + '/models') return json(callable)
      if (url === CATALOG + '?limit=1000&offset=0') return json({ models: [metadata('alpha'), metadata('jev-latest')], total: 2 })
      throw new Error('Unexpected URL: ' + url)
    })
    expect((await provider.listModels()).map(m => m.id)).toEqual(['alpha', 'beta', 'alpha:free'])
    expect((await provider.listModels())[0]?.name).toBe('ALPHA')
    expect(await provider.contextWindowFor('alpha')).toBe(256000)
    expect(await provider.contextWindowFor('alpha:free')).toBe(256000)
    expect((await provider.listModels()).at(-1)?.name).toBe('ALPHA (Free)')
    expect(await provider.supportsImages('alpha')).toBe(true)
    expect(await provider.supportsToolCalls('alpha')).toBe(true)
    expect(await provider.supportsToolCalls('beta')).toBe(false)
    expect(await provider.thinkingFor('alpha')).toEqual({ reasoning: true, kind: 'effort', levels: ['low', 'high'] })
    expect(requests).toEqual([BASE + '/models', CATALOG + '?limit=1000&offset=0'])
  })

  it('paginates metadata and refetches when asked to refresh', async () => {
    let callableReads = 0
    let metadataReads = 0
    const provider = createExperientialProvider({
      apiKey: 'test-only', baseUrl: BASE, catalogUrl: CATALOG,
      fetchImpl: async (url) => {
        if (url === BASE + '/models') {
          callableReads++
          return json({ data: [{ id: 'last', created: 1, owned_by: 'lab' }] })
        }
        metadataReads++
        if (url.endsWith('offset=0')) return json({ models: Array.from({ length: 1000 }, (_, i) => metadata('other-' + i)), total: 1001 })
        if (url.endsWith('offset=1000')) return json({ models: [metadata('last')], total: 1001 })
        throw new Error('Unexpected URL: ' + url)
      },
    })
    expect((await provider.listModels())[0]?.name).toBe('LAST')
    expect(await provider.contextWindowFor('last')).toBe(256000)
    expect(metadataReads).toBe(2)
    await provider.refreshModels()
    expect(callableReads).toBe(2)
    expect(metadataReads).toBe(4)
  })

  it('shows GPT-6 Luna effort variants published by its live route even when the model flag is stale', async () => {
    const luna = { model: { slug: 'gpt-6-luna', display_name: 'GPT-6 Luna',
      supported_params: { tools: true, reasoning: false } },
      providers: [{ status: 'active', routable: true, capabilities: {
        supports_reasoning: true,
        supported_reasoning_efforts: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
      } }] }
    const bodies: Array<Record<string, unknown>> = []
    const provider = stub(async (url, init) => {
      if (url === BASE + '/models') return json({ data: [{ id: 'gpt-6-luna', owned_by: 'openai' }] })
      if (url.startsWith(CATALOG)) return json({ models: [luna], total: 1 })
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
      return responseStream([{ type: 'response.output_text.delta', delta: 'ok' },
        { type: 'response.completed', response: { status: 'completed', usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } } }])
    })
    const model = (await provider.listModels())[0]!
    const thinking = await provider.thinkingFor(model.id)
    expect(thinking).toEqual({ reasoning: true, kind: 'effort', levels: ['none', 'low', 'medium', 'high', 'xhigh', 'max'] })
    const picker = thinkingOptionsFor({ ...model, reasoning: thinking.reasoning,
      thinkingKind: thinking.kind, thinkingLevels: thinking.levels })
    expect(picker.disabled).toBe(false)
    expect(picker.choices.map(choice => choice.value)).toEqual(['default', 'none', 'low', 'medium', 'high', 'xhigh', 'max'])
    for (const effort of ['none', 'high', 'default']) {
      for await (const _event of provider.streamChat({ model: 'gpt-6-luna', messages: [{ role: 'user', content: 'hi' }], reasoningEffort: effort })) { /* Drain. */ }
    }
    expect(bodies.map(body => (body.reasoning as Record<string, unknown>).effort)).toEqual(['none', 'high', undefined])
    expect(bodies.every(body => JSON.stringify(body.include) === '["reasoning.encrypted_content"]')).toBe(true)
    expect(bodies.every(body => (body.reasoning as Record<string, unknown>).summary === 'auto')).toBe(true)
  })

  it('does not offer an effort unless every active route supports it', () => {
    expect(parseMetadata({ model: { supported_params: { reasoning: true } }, providers: [
      { capabilities: { supported_reasoning_efforts: ['low', 'high'] } },
      { capabilities: { supported_reasoning_efforts: ['high', 'max'] } },
    ] }).thinking).toEqual({ reasoning: true, kind: 'effort', levels: ['high'] })
  })

  it('uses Responses and streams readable reasoning summaries, answers, tools, and usage', async () => {
    const bodies: Record<string, unknown>[] = []
    const provider = stub(async (url, init) => {
      if (url === BASE + '/models') return json(callable)
      if (url.startsWith(CATALOG)) return json({ models: [metadata('alpha')], total: 1 })
      expect(url).toBe(BASE + '/responses')
      const headers = init?.headers as Record<string, string>
      expect(headers.Authorization).toBe('Bearer test-only')
      expect(headers['x-opencode-session']).toBeUndefined()
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>
      bodies.push(body)
      return responseStream([
        { type: 'response.reasoning_summary_text.delta', delta: 'Check the multiplication. ' },
        { type: 'response.reasoning_summary_text.done', text: 'Check the multiplication.' },
        { type: 'response.output_item.done', output_index: 1,
          item: { type: 'reasoning', id: 'rs_1', encrypted_content: 'opaque', summary: [{ type: 'summary_text', text: 'Check the multiplication.' }] } },
        { type: 'response.output_item.added', output_index: 0,
          item: { type: 'function_call', call_id: 'call_a', name: 'read', arguments: '' } },
        { type: 'response.function_call_arguments.delta', output_index: 0, delta: '{}' },
        { type: 'response.output_item.done', output_index: 0,
          item: { type: 'function_call', call_id: 'call_a', name: 'read', arguments: '{}' } },
        { type: 'response.output_text.delta', delta: 'hello' },
        { type: 'response.completed', response: { status: 'completed', usage: { input_tokens: 4, output_tokens: 2, total_tokens: 6 } } },
      ])
    })
    const tools = [{ type: 'function', function: { name: 'read', parameters: {} } }]
    const request = { model: 'alpha', sessionId: 'conversation', messages: [{ role: 'user' as const, content: 'hi' }],
      reasoningEffort: 'high', tools }
    expect((await provider.chat(request)).text).toBe('hello')
    const events = []
    for await (const event of provider.streamChat(request)) events.push(event)
    expect(events).toContainEqual({ type: 'thinking', text: 'Check the multiplication. ' })
    expect(events.filter(event => event.type === 'thinking' && event.text !== '').map(event => event.type === 'thinking' ? event.text : '')).toEqual(['Check the multiplication. '])
    expect(events.some(event => event.type === 'thinking' && event.thinkingSignature?.includes('opaque'))).toBe(true)
    expect(events).toContainEqual({ type: 'text', text: 'hello' })
    expect(events).toContainEqual({ type: 'tool_calls', toolCalls: [{ id: 'call_a', name: 'read', arguments: '{}' }] })
    expect(events.at(-1)).toEqual({ type: 'done', stopReason: 'stop', usage: { input: 4, output: 2, total: 6 } })
    for (const body of bodies) {
      expect(body.model).toBe('alpha')
      expect(body.tools).toEqual([{ type: 'function', name: 'read', parameters: {}, strict: false }])
      expect(body.reasoning).toEqual({ summary: 'auto', effort: 'high' })
      expect(body.include).toEqual(['reasoning.encrypted_content'])
      expect(body.store).toBe(false)
      expect((body.input as unknown[])[0]).toEqual({ role: 'user', content: [{ type: 'input_text', text: 'hi' }] })
    }
  })

  it('bounds old tool IDs consistently for both chat and streaming, without changing saved history', async () => {
    const originalId = 'call_' + 'a'.repeat(78)
    const secondId = 'call_' + 'a'.repeat(77) + 'b'
    const codexId = 'call_3|fc_3'
    const messages = [
      { role: 'assistant' as const, content: '', toolCalls: [
        { id: originalId, name: 'compute', arguments: '{}' },
        { id: secondId, name: 'compute', arguments: '{}' },
        { id: codexId, name: 'compute', arguments: '{}' },
      ] },
      { role: 'tool' as const, toolCallId: originalId, content: 'first' },
      { role: 'tool' as const, toolCallId: secondId, content: 'second' },
      { role: 'tool' as const, toolCallId: codexId, content: 'third' },
      { role: 'user' as const, content: 'continue' },
    ]
    const sent: Array<Array<string | undefined>> = []
    const provider = stub(async (url, init) => {
      if (url === BASE + '/models') return json(callable)
      if (url.startsWith(CATALOG)) return json({ models: [metadata('alpha')], total: 1 })
      expect(url).toBe(BASE + '/responses')
      const body = JSON.parse(String(init?.body)) as { input: Array<{ type?: string; call_id?: string }> }
      const calls = body.input.filter(item => item.type === 'function_call').map(item => item.call_id)
      const results = body.input.filter(item => item.type === 'function_call_output').map(item => item.call_id)
      expect(results).toEqual(calls)
      expect(new Set(calls).size).toBe(3)
      for (const id of calls) expect(id).toMatch(/^[A-Za-z0-9_-]{1,64}$/)
      sent.push(calls)
      return responseStream([{ type: 'response.output_text.delta', delta: 'ok' },
        { type: 'response.completed', response: { status: 'completed', usage: { input_tokens: 1, output_tokens: 1 } } }])
    })
    expect((await provider.chat({ model: 'alpha', messages })).text).toBe('ok')
    const events = []
    for await (const event of provider.streamChat({ model: 'alpha', messages })) events.push(event)
    expect(events.at(-1)?.type).toBe('done')
    expect(sent).toHaveLength(2)
    expect(sent[0]).toEqual(sent[1])
    expect(messages[0]?.toolCalls?.map(call => call.id)).toEqual([originalId, secondId, codexId])
    expect(messages[1]?.toolCallId).toBe(originalId)
  })

  it('replays valid encrypted reasoning items on the Responses input', async () => {
    const bodies: Record<string, unknown>[] = []
    const provider = stub(async (url, init) => {
      if (url === BASE + '/models') return json(callable)
      if (url.startsWith(CATALOG)) return json({ models: [metadata('alpha')], total: 1 })
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>
      bodies.push(body)
      return responseStream([{ type: 'response.output_text.delta', delta: 'ok' },
        { type: 'response.completed', response: { status: 'completed', usage: { input_tokens: 1, output_tokens: 1 } } }])
    })
    const messages = [
      { role: 'assistant' as const, content: 'previous',
        thinkingSignature: '{"type":"reasoning","id":"rs_1"}' },
      { role: 'user' as const, content: 'continue' },
    ]
    expect((await provider.chat({ model: 'alpha', messages })).text).toBe('ok')
    const events = []
    for await (const event of provider.streamChat({ model: 'alpha', messages })) events.push(event)
    expect(events).toContainEqual({ type: 'text', text: 'ok' })
    expect(events.at(-1)?.type).toBe('done')
    expect(bodies).toHaveLength(2)
    for (const body of bodies) {
      expect(body.input).toContainEqual({ type: 'reasoning', id: 'rs_1' })
    }
  })

  it('surfaces auth errors and refuses malformed callable catalogs', async () => {
    const denied = stub(async () => json({ error: { code: 'invalid_key', message: 'Invalid key' } }, 401))
    await expect(denied.listModels()).rejects.toThrow('Invalid key')
    const malformed = stub(async () => json({ data: 'not an array' }))
    await expect(malformed.listModels()).rejects.toThrow('missing data')
  })
})
