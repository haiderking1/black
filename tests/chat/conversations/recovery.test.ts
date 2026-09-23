import { describe, expect, it } from 'bun:test'

import { recoverConversations, recordRecovery } from '../../../frontend/chat/conversations/recovery'
import type { Message } from '../../../frontend/chat/types'

function message(id: string, role: Message['role']): Message {
  return { id, role, content: id, timestamp: '00:00' }
}

function memoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value) },
    removeItem: (key) => { values.delete(key) },
    clear: () => values.clear(),
    key: (index) => [...values.keys()][index] ?? null,
    get length() { return values.size }
  }
}

describe('conversation recovery ordering', () => {
  it('replays a late assistant reply after its queued user message', () => {
    const storage = memoryStorage()
    const sessionId = 'recovery-queue-order'
    recordRecovery({ kind: 'message', sessionId, message: message('u1', 'user'), afterId: null }, storage)
    recordRecovery({ kind: 'message', sessionId, message: message('a1', 'assistant'), afterId: 'u1' }, storage)
    recordRecovery({ kind: 'message', sessionId, message: message('u2', 'user'), afterId: 'a1' }, storage)
    recordRecovery({ kind: 'message', sessionId, message: message('u3', 'user'), afterId: 'u2' }, storage)
    recordRecovery({ kind: 'message', sessionId, message: message('a2', 'assistant'), afterId: 'u2' }, storage)

    const restored = recoverConversations({}, storage)
    expect(restored[sessionId]?.map((item) => item.id)).toEqual(['u1', 'a1', 'u2', 'a2', 'u3'])
  })
})
