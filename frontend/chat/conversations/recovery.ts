import type { Message } from '../types'
import { isMessage } from './validation'

export const RECOVERY_KEY = 'black_conversation_recovery_v1'
type Conversations = Record<string, Message[]>
type Change =
  | { kind: 'message'; sessionId: string; message: Message; afterId: string | null }
  | { kind: 'remove'; sessionId: string; messageId: string }
  | { kind: 'session'; sessionId: string; messages: Message[] | null }
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function valid(value: unknown): value is Change {
  if (!value || typeof value !== 'object') return false
  const x = value as Record<string, unknown>
  if (typeof x.sessionId !== 'string' || !x.sessionId) return false
  if (x.kind === 'message') return isMessage(x.message) && (x.afterId === null || typeof x.afterId === 'string')
  if (x.kind === 'remove') return typeof x.messageId === 'string'
  return x.kind === 'session' && (x.messages === null || Array.isArray(x.messages) && x.messages.every(isMessage))
}

function read(store: Store): Change[] {
  try {
    const raw = store.getItem(RECOVERY_KEY)
    if (raw === null) return []
    const data: unknown = JSON.parse(raw)
    if (!data || typeof data !== 'object') return []
    const envelope = data as Record<string, unknown>
    return envelope.version === 1 && Array.isArray(envelope.changes) ? envelope.changes.filter(valid) : []
  } catch { return [] }
}

/** Only changed messages are copied, never the unrelated conversation history. */
export function recordRecovery(change: Change, store?: Store): boolean {
  try {
    store ??= localStorage
    const id = change.kind === 'message' ? change.message.id : change.kind === 'remove' ? change.messageId : undefined
    const changes = read(store).filter(previous => {
      if (previous.sessionId !== change.sessionId) return true
      if (change.kind === 'session') return false
      if (previous.kind === 'session') return true
      return (previous.kind === 'message' ? previous.message.id : previous.messageId) !== id
    })
    changes.push(change)
    store.setItem(RECOVERY_KEY, JSON.stringify({ version: 1, changes }))
    return true
  } catch (error) {
    console.error('Could not save conversation recovery. Keep this window open to retain unsaved progress.', error)
    return false
  }
}

export function recoverConversations(base: Conversations, store: Store = localStorage): Conversations {
  const restored = { ...base }
  for (const change of read(store)) {
    const id = change.sessionId
    if (change.kind === 'session') {
      if (change.messages === null) delete restored[id]
      else Object.defineProperty(restored, id, { value: [...change.messages], enumerable: true, writable: true, configurable: true })
      continue
    }
    const messages = Object.hasOwn(restored, id) ? [...restored[id]!] : []
    const messageId = change.kind === 'message' ? change.message.id : change.messageId
    const index = messages.findIndex(message => message.id === messageId)
    if (change.kind === 'remove') { if (index !== -1) messages.splice(index, 1) }
    else if (index !== -1) messages[index] = change.message
    else {
      const anchor = change.afterId === null ? -1 : messages.findIndex(message => message.id === change.afterId)
      const insertion = change.afterId !== null && anchor === -1 ? messages.length : anchor + 1
      messages.splice(insertion, 0, change.message)
    }
    Object.defineProperty(restored, id, { value: messages, enumerable: true, writable: true, configurable: true })
  }
  return restored
}

/** Called only after the full snapshot has been written successfully. */
export function clearRecovery(store: Store = localStorage): void {
  try { store.removeItem(RECOVERY_KEY) } catch { /* Replaying the same saved changes is idempotent. */ }
}
