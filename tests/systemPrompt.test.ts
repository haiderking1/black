import { describe, expect, it } from 'bun:test'

import { SYSTEM_PROMPT, withSystemPrompt, workingDirectoryLine } from '../backend/chat/systemPrompt'

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
    expect(messages[0]?.content).toContain(SYSTEM_PROMPT)
    expect(messages[1]?.content).toBe('Answer only in haiku.')
  })

  it('names the products the model must not claim to be running in', () => {
    // The failure this was written for: a model announcing it was running inside
    // another product, with no such thing ever being sent.
    expect(SYSTEM_PROMPT).toContain('black')
    expect(SYSTEM_PROMPT).toContain('OpenCode')
  })

  it('states the limits honestly, so the model does not promise what it cannot do', () => {
    expect(SYSTEM_PROMPT).toContain('compute is the only callable tool')
    expect(SYSTEM_PROMPT).toContain('When no tool is supplied')
  })

  it('includes concise prose guidance without applying it to code or quotations', () => {
    const prompt = withSystemPrompt([{ role: 'user' as const, content: 'hi' }])[0]!.content
    expect(prompt).toContain('Write plainly and directly.')
    expect(prompt).toContain('Sound natural and conversational, not scripted or corporate.')
    expect(prompt).toContain('Lead with the point, keep sentences easy to follow, and explain unfamiliar jargon when needed.')
    expect(prompt).toContain('Keep technical terms precise.')
    expect(prompt).toContain('Apply these style rules to prose, not code or quoted text.')
  })

  it('carries no directory when none was given', () => {
    const messages = withSystemPrompt([{ role: 'user' as const, content: 'hi' }])
    expect(messages[0]?.content).not.toContain('Current working directory')
  })

  it('names the working directory when one is given', () => {
    const messages = withSystemPrompt([{ role: 'user' as const, content: 'hi' }], '/home/soka/code/black')
    expect(messages[0]?.content).toContain('Current working directory: /home/soka/code/black')
  })

  it('treats an empty directory as none, rather than claiming an empty path', () => {
    // A prompt saying the working directory is "" is worse than one saying
    // nothing, because the model will repeat it back.
    const messages = withSystemPrompt([{ role: 'user' as const, content: 'hi' }], '')
    expect(messages[0]?.content).toBe(SYSTEM_PROMPT)
  })
})

describe('workingDirectoryLine', () => {
  it('normalizes backslashes so a Windows path is not read as escapes', () => {
    expect(workingDirectoryLine('C:\\Users\\soka\\code')).toBe(
      'Current working directory: C:/Users/soka/code'
    )
  })

  it('leaves a posix path alone', () => {
    expect(workingDirectoryLine('/home/soka/code')).toBe('Current working directory: /home/soka/code')
  })

  it('copes with a path that is only separators', () => {
    expect(workingDirectoryLine('\\\\')).toBe('Current working directory: //')
  })
})
