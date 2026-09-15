import type { Message } from '../types'
import { hydrateMessage } from '../../working/hydrate'
import { isMessage } from './validation'
import { clearRecovery, recoverConversations } from './recovery'

const CONVERSATIONS_KEY = 'black_conversations_v1'

export function loadConversations(): Record<string, Message[]> {
  try {
    let parsed: unknown
    try { parsed = JSON.parse(localStorage.getItem(CONVERSATIONS_KEY) ?? '{}') } catch { parsed = {} }
    const base: Record<string, Message[]> = {}
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      for (const [id, messages] of Object.entries(parsed)) {
        if (id && Array.isArray(messages)) Object.defineProperty(base, id, {
          value: messages.filter(isMessage), enumerable: true, writable: true, configurable: true,
        })
      }
    }
    const recovered = recoverConversations(base)
    return Object.fromEntries(Object.entries(recovered)
      .filter(([, messages]) => messages.length > 0)
      .map(([id, messages]) => [id, messages.map(hydrateMessage)]))
  } catch { return {} }
}

export function saveConversations(conversations: Record<string, Message[]>): void {
  try {
    localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(conversations))
    clearRecovery()
  } catch (error) {
    // Keep the recovery copy if the full snapshot cannot be committed.
    console.error('Could not save conversation history. Recovery records were retained.', error)
  }
}
