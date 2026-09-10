import { describe, expect, it } from 'bun:test'

import { applyMessageUpdate } from '../frontend/chat/useConversations'
import type { Message } from '../frontend/chat/types'

function message(id: string, content: string): Message {
  return { id, role: 'assistant', content, timestamp: '00:00' }
}

const conversations: Record<string, Message[]> = {
  s1: [message('m1', 'hello'), message('m2', 'wor')],
}

describe('applyMessageUpdate', () => {
  it('grows a streaming reply in place', () => {
    const grown = applyMessageUpdate(conversations, 's1', 'm2', (previous) => previous + 'ld')
    expect(grown['s1']?.[1]?.content).toBe('world')
    expect(grown['s1']?.[0]?.content).toBe('hello')
  })

  it('returns the same object when nothing changed, so a quiet event does not re-render', () => {
    // A streaming loop fires on every event, including ones carrying no text.
    const same = applyMessageUpdate(conversations, 's1', 'm2', (previous) => previous)
    expect(same).toBe(conversations)
  })

  it('returns the same object for an unknown session or message', () => {
    expect(applyMessageUpdate(conversations, 'nope', 'm1', (p) => p + 'x')).toBe(conversations)
    expect(applyMessageUpdate(conversations, 's1', 'nope', (p) => p + 'x')).toBe(conversations)
  })

  it('replaces the text entirely, which is how an error lands', () => {
    const replaced = applyMessageUpdate(conversations, 's1', 'm2', () => 'the stream failed')
    expect(replaced['s1']?.[1]?.content).toBe('the stream failed')
  })

  it('leaves other sessions untouched', () => {
    const two: Record<string, Message[]> = { ...conversations, s2: [message('x', 'other')] }
    const updated = applyMessageUpdate(two, 's1', 'm1', () => 'changed')
    expect(updated['s2']).toBe(two['s2'])
  })
})
