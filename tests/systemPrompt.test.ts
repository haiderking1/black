import { describe, expect, it } from 'bun:test'

import { SYSTEM_PROMPT, withSystemPrompt } from '../backend/chat/systemPrompt'

describe('withSystemPrompt', () => {
  it('prepends a system message', () => {
    const messages = withSystemPrompt([{ role: 'user' as const, content: 'hi' }])
    expect(messages).toHaveLength(2)
    expect(messages[0]?.role).toBe('system')
    expect(messages[0]?.content).toBe(SYSTEM_PROMPT)
    expect(messages[1]?.content).toBe('hi')
  })

  it('keeps conversation order intact', () => {
    const messages = withSystemPrompt([
      { role: 'user' as const, content: 'a' },
      { role: 'assistant' as const, content: 'b' },
      { role: 'user' as const, content: 'c' },
    ])
    expect(messages.map((m) => m.content)).toEqual([SYSTEM_PROMPT, 'a', 'b', 'c'])
  })

  it('does not mutate the input', () => {
    const original = [{ role: 'user' as const, content: 'hi' }]
    withSystemPrompt(original)
    expect(original).toHaveLength(1)
  })

  it('orders a caller system message after the identity prompt, so identity cannot be replaced', () => {
    const messages = withSystemPrompt([
      { role: 'system' as const, content: 'Answer only in haiku.' },
      { role: 'user' as const, content: 'hi' },
    ])
    expect(messages[0]?.content).toBe(SYSTEM_PROMPT)
    expect(messages[1]?.content).toBe('Answer only in haiku.')
  })

  it('names the products the model must not claim to be running in', () => {
    // The exact failure this was written for: a model announcing it was
    // "running inside OpenCode" with no such thing ever being sent.
    expect(SYSTEM_PROMPT).toContain('black')
    expect(SYSTEM_PROMPT).toContain('OpenCode')
  })

  it('states the limits honestly, so the model does not promise what it cannot do', () => {
    expect(SYSTEM_PROMPT).toContain('no filesystem access')
    expect(SYSTEM_PROMPT).toContain('no project metadata')
  })
})
