import { describe, expect, it } from 'bun:test'

import { removeMessage } from '../frontend/chat/useConversations'
import type { Message } from '../frontend/chat/types'

function message(id: string, content: string): Message {
  return { id, role: 'user', content, timestamp: '00:00' }
}

const conversations: Record<string, Message[]> = {
  s1: [message('m1', 'first'), message('m2', 'queued'), message('m3', 'later')]
}

describe('removeMessage', () => {
  it('drops just the named message', () => {
    const next = removeMessage(conversations, 's1', 'm2')
    expect(next['s1']?.map((m) => m.id)).toEqual(['m1', 'm3'])
  })

  it('returns the same object when nothing matched', () => {
    // An unrelated dismiss must not re-render the whole transcript.
    expect(removeMessage(conversations, 's1', 'gone')).toBe(conversations)
    expect(removeMessage(conversations, 'nope', 'm1')).toBe(conversations)
  })

  it('leaves other sessions alone', () => {
    const two: Record<string, Message[]> = { ...conversations, s2: [message('x', 'other')] }
    const next = removeMessage(two, 's1', 'm1')
    expect(next['s2']).toBe(two['s2'])
  })

  it('copes with emptying a conversation', () => {
    const single: Record<string, Message[]> = { s1: [message('only', 'hi')] }
    expect(removeMessage(single, 's1', 'only')['s1']).toEqual([])
  })
})
