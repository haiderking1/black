import { describe, expect, it } from 'bun:test'
import { serializeConversation, TOOL_RESULT_MAX_CHARS } from '../backend/compaction/serialization'
import type { Message } from '../backend/sessions/types'

describe('serializeConversation', () => {
  it('renders user and assistant text with role labels', () => {
    const messages: Message[] = [
      { role: 'user', content: 'find the bug', timestamp: 1 },
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'looking now' }],
        api: 'test',
        provider: 'test',
        model: 'test',
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        stopReason: 'stop',
        timestamp: 2,
      },
    ]
    expect(serializeConversation(messages)).toBe('[User]: find the bug\n\n[Assistant]: looking now')
  })

  it('renders thinking blocks and tool calls', () => {
    const messages: Message[] = [
      {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'checking the parser' },
          { type: 'toolCall', id: 't1', name: 'read', arguments: { path: '/a.ts', limit: 10 } },
        ],
        api: 'test',
        provider: 'test',
        model: 'test',
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        stopReason: 'stop',
        timestamp: 1,
      },
    ]
    const text = serializeConversation(messages)
    expect(text).toContain('[Assistant thinking]: checking the parser')
    expect(text).toContain('[Assistant tool calls]: read(path="/a.ts", limit=10)')
  })

  it('renders tool results and truncates long ones', () => {
    const long = 'x'.repeat(TOOL_RESULT_MAX_CHARS + 500)
    const messages: Message[] = [
      {
        role: 'toolResult',
        toolCallId: 't1',
        toolName: 'read',
        content: [{ type: 'text', text: long }],
        isError: false,
        timestamp: 1,
      },
    ]
    const text = serializeConversation(messages)
    expect(text.startsWith('[Tool result]: ' + 'x'.repeat(TOOL_RESULT_MAX_CHARS))).toBe(true)
    expect(text).toContain('[... 500 more characters truncated]')
  })

  it('keeps short tool results whole', () => {
    const messages: Message[] = [
      {
        role: 'toolResult',
        toolCallId: 't1',
        toolName: 'read',
        content: [{ type: 'text', text: 'short' }],
        isError: false,
        timestamp: 1,
      },
    ]
    expect(serializeConversation(messages)).toBe('[Tool result]: short')
  })

  it('skips empty content instead of emitting bare labels', () => {
    const messages: Message[] = [
      { role: 'user', content: '', timestamp: 1 },
      { role: 'user', content: [], timestamp: 2 },
    ]
    expect(serializeConversation(messages)).toBe('')
  })

  it('tolerates malformed content', () => {
    const messages = [
      { role: 'user', content: null, timestamp: 1 },
      { role: 'assistant', content: 'not-an-array', timestamp: 2 },
    ] as unknown as Message[]
    expect(() => serializeConversation(messages)).not.toThrow()
    expect(serializeConversation(messages)).toBe('')
  })

  it('survives arguments that cannot be serialized', () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    const messages: Message[] = [
      {
        role: 'assistant',
        content: [{ type: 'toolCall', id: 't1', name: 'read', arguments: circular }],
        api: 'test',
        provider: 'test',
        model: 'test',
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        stopReason: 'stop',
        timestamp: 1,
      },
    ]
    expect(serializeConversation(messages)).toContain('[unserializable]')
  })
})
