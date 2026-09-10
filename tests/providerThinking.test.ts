import { describe, expect, it } from 'bun:test'

import { createChatClient } from '../backend/providers/opencode/client'
import { extractContent } from '../backend/providers/opencode/reasoning'

const BASE = 'https://example.test/zen/go/v1'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function completionWith(message: unknown): unknown {
  return { choices: [{ message, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } }
}

describe('extractContent', () => {
  it('reads a plain string message', () => {
    expect(extractContent('hello')).toEqual({ text: 'hello', thinking: '' })
  })

  it('reads each sibling field a gateway uses for reasoning', () => {
    for (const field of ['reasoning', 'reasoning_content', 'reasoning_text']) {
      const result = extractContent({ content: 'answer', [field]: 'thought' })
      expect(result.text).toBe('answer')
      expect(result.thinking).toBe('thought')
    }
  })

  it('reads thinking out of a content block array', () => {
    const result = extractContent({
      content: [
        { type: 'thinking', thinking: 'weighing options' },
        { type: 'text', text: 'the answer' },
      ],
    })
    expect(result.thinking).toBe('weighing options')
    expect(result.text).toBe('the answer')
  })

  it('reads an anthropic-style thinking block and keeps its signature', () => {
    const result = extractContent({
      content: [
        { type: 'thinking', thinking: 'reasoned', signature: 'sig-abc' },
        { type: 'text', text: 'done' },
      ],
    })
    expect(result.thinking).toBe('reasoned')
    expect(result.text).toBe('done')
    // The signature is the continuity payload, so it must not be dropped.
    expect(result.thinkingSignature).toBe('sig-abc')
  })

  it('collects several block signatures into one replay payload', () => {
    const result = extractContent({
      content: [
        { type: 'thinking', thinking: 'one', signature: 'sig-1' },
        { type: 'thinking', thinking: 'two', signature: 'sig-2' },
        { type: 'text', text: 'done' },
      ],
    })
    expect(result.thinking).toBe('onetwo')
    expect(result.thinkingSignature).toBe('["sig-1","sig-2"]')
  })

  it('accepts a top-level thinking string', () => {
    expect(extractContent({ content: 'a', thinking: 'b' }).thinking).toBe('b')
  })

  it('serializes reasoning_details into a replay signature', () => {
    const result = extractContent({
      content: 'answer',
      reasoning_details: [{ type: 'reasoning.text', text: 'kept' }],
    })
    expect(result.text).toBe('answer')
    expect(result.thinkingSignature).toBe('[{"type":"reasoning.text","text":"kept"}]')
  })

  it('omits an empty or unreadable signature', () => {
    expect(extractContent({ content: 'a', reasoning_details: [] }).thinkingSignature).toBe(undefined)
    const circular: Record<string, unknown> = { content: 'a' }
    circular['reasoning_details'] = circular
    expect(extractContent(circular).thinkingSignature).toBe(undefined)
  })

  it('tolerates malformed blocks and non-objects', () => {
    expect(extractContent(null)).toEqual({ text: '', thinking: '' })
    expect(extractContent({ content: [null, 42, { type: 'text' }] })).toEqual({ text: '', thinking: '' })
  })
})

describe('chat client thinking', () => {
  function client(response: () => Response) {
    return createChatClient({
      providerId: 'opencode-go',
      baseUrl: BASE,
      apiKey: 'k',
      fetchImpl: async () => response(),
    })
  }

  it('returns reasoning alongside the answer', async () => {
    const result = await client(() =>
      jsonResponse(completionWith({ content: 'the answer', reasoning_content: 'the thinking' })),
    ).chat({ model: 'glm-5.3', messages: [{ role: 'user', content: 'hi' }] })

    expect(result.text).toBe('the answer')
    expect(result.thinking).toBe('the thinking')
    expect(result.stopReason).toBe('stop')
  })

  it('returns empty thinking for a model that does not think out loud', async () => {
    const result = await client(() => jsonResponse(completionWith({ content: 'plain' }))).chat({
      model: 'm',
      messages: [],
    })
    expect(result.thinking).toBe('')
    expect(result.thinkingSignature).toBe(undefined)
  })

  it('hands a previous turn\'s reasoning back on the next request', async () => {
    let sent: unknown
    const chat = createChatClient({
      providerId: 'opencode-go',
      baseUrl: BASE,
      apiKey: 'k',
      fetchImpl: async (_input, init) => {
        sent = JSON.parse(String(init?.body))
        return jsonResponse(completionWith({ content: 'ok' }))
      },
    })

    await chat.chat({
      model: 'm',
      messages: [
        { role: 'user', content: 'first' },
        {
          role: 'assistant',
          content: 'earlier answer',
          thinkingSignature: '[{"type":"reasoning.text","text":"earlier thought"}]',
        },
        { role: 'user', content: 'second' },
      ],
    })

    const messages = (sent as { messages: Array<Record<string, unknown>> }).messages
    expect(messages[1]?.['reasoning_details']).toEqual([{ type: 'reasoning.text', text: 'earlier thought' }])
    // User turns never carry replay metadata.
    expect(messages[0]?.['reasoning_details']).toBe(undefined)
  })

  it('drops an unreadable signature instead of sending garbage', async () => {
    let sent: unknown
    const chat = createChatClient({
      providerId: 'opencode-go',
      baseUrl: BASE,
      apiKey: 'k',
      fetchImpl: async (_input, init) => {
        sent = JSON.parse(String(init?.body))
        return jsonResponse(completionWith({ content: 'ok' }))
      },
    })

    await chat.chat({
      model: 'm',
      messages: [{ role: 'assistant', content: 'a', thinkingSignature: 'not json' }],
    })

    const messages = (sent as { messages: Array<Record<string, unknown>> }).messages
    expect(messages[0]?.['reasoning_details']).toBe(undefined)
  })
})
