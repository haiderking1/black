import { describe, expect, it } from 'bun:test'

import { applyMessageUpdate, insertMessageAfter } from '../frontend/chat/useConversations'
import { historyBefore, orderMessagesForSend } from '../frontend/chat/history'
import type { Message } from '../frontend/chat/types'

function message(id: string, content: string): Message {
  return { id, role: 'assistant', content, timestamp: '00:00' }
}

function userMessage(id: string, content: string): Message {
  return { id, role: 'user', content, timestamp: '00:00' }
}

const conversations: Record<string, Message[]> = {
  s1: [message('m1', 'hello'), message('m2', 'wor')],
}

describe('insertMessageAfter', () => {
  it('places a queued reply before later queued user messages', () => {
    const queued: Record<string, Message[]> = {
      s1: [userMessage('u1', 'first'), message('a1', 'answer'), userMessage('u2', 'second'), userMessage('u3', 'third')]
    }
    const ordered = insertMessageAfter(queued, 's1', 'u2', message('a2', 'second answer'))
    expect(ordered['s1']?.map((item) => item.id)).toEqual(['u1', 'a1', 'u2', 'a2', 'u3'])
    expect(historyBefore(ordered['s1']!, 'u3').map((item) => item.id)).toEqual(['u1', 'a1', 'u2', 'a2'])
  })

  it('orders steered sends before waiting prompts and carries their replies into later history', () => {
    const submitted: Record<string, Message[]> = {
      s1: [userMessage('u1', 'first'), message('a1', 'answer'), userMessage('u2', 'second'), userMessage('u3', 'third')]
    }
    const steered = orderMessagesForSend(submitted['s1']!, 'u3', ['u2'])
    expect(steered.map((item) => item.id)).toEqual(['u1', 'a1', 'u3', 'u2'])
    expect(historyBefore(steered, 'u3').map((item) => item.id)).toEqual(['u1', 'a1'])

    const withReply = insertMessageAfter({ s1: [...steered] }, 's1', 'u3', message('a3', 'third answer'))['s1']!
    const nextSend = orderMessagesForSend(withReply, 'u2', [])
    expect(historyBefore(nextSend, 'u2').map((item) => item.id)).toEqual(['u1', 'a1', 'u3', 'a3'])
  })

  it('does not insert the same reply twice', () => {
    const ordered = insertMessageAfter(conversations, 's1', 'm1', message('m2', 'duplicate'))
    expect(ordered).toBe(conversations)
  })
})

describe('applyMessageUpdate', () => {
  it('grows a streaming reply in place', () => {
    const grown = applyMessageUpdate(conversations, 's1', 'm2', (m) => ({ ...m, content: m.content + 'ld' }))
    expect(grown['s1']?.[1]?.content).toBe('world')
    expect(grown['s1']?.[0]?.content).toBe('hello')
  })

  it('appends reasoning beside the answer without touching it', () => {
    const thought = applyMessageUpdate(conversations, 's1', 'm2', (m) => ({
      ...m,
      thinking: (m.thinking ?? '') + 'weighing options',
    }))
    expect(thought['s1']?.[1]?.thinking).toBe('weighing options')
    expect(thought['s1']?.[1]?.content).toBe('wor')
  })

  it('records how long reasoning took without disturbing either field', () => {
    const timed = applyMessageUpdate(conversations, 's1', 'm2', (m) => ({ ...m, thinkingMs: 4200 }))
    expect(timed['s1']?.[1]?.thinkingMs).toBe(4200)
    expect(timed['s1']?.[1]?.content).toBe('wor')
  })

  it('returns the same object when the updater hands the message back', () => {
    // A streaming loop fires on every event, including ones carrying no text.
    expect(applyMessageUpdate(conversations, 's1', 'm2', (m) => m)).toBe(conversations)
  })

  it('returns the same object for an unknown session or message', () => {
    expect(applyMessageUpdate(conversations, 'nope', 'm1', (m) => ({ ...m, content: 'x' }))).toBe(conversations)
    expect(applyMessageUpdate(conversations, 's1', 'nope', (m) => ({ ...m, content: 'x' }))).toBe(conversations)
  })

  it('replaces the text entirely, which is how an error lands', () => {
    const replaced = applyMessageUpdate(conversations, 's1', 'm2', (m) => ({ ...m, content: 'the stream failed' }))
    expect(replaced['s1']?.[1]?.content).toBe('the stream failed')
  })

  it('leaves other sessions untouched', () => {
    const two: Record<string, Message[]> = { ...conversations, s2: [message('x', 'other')] }
    const updated = applyMessageUpdate(two, 's1', 'm1', (m) => ({ ...m, content: 'changed' }))
    expect(updated['s2']).toBe(two['s2'])
  })
})
