import { useCallback, useEffect, useRef, useState } from 'react'
import type { Message } from './types'
import { hydrateMessage } from '../working/hydrate'

const CONVERSATIONS_KEY = 'black_conversations_v1'
const MAX_MESSAGES_PER_SESSION = 200

function isMessage(value: unknown): value is Message {
  if (typeof value !== 'object' || value === null) return false
  const m = value as Record<string, unknown>
  if (typeof m.id !== 'string' || m.id === '') return false
  if (m.role !== 'user' && m.role !== 'assistant') return false
  if (typeof m.content !== 'string') return false
  if (typeof m.timestamp !== 'string') return false
  return true
}

export function loadConversations(): Record<string, Message[]> {
  try {
    const raw = localStorage.getItem(CONVERSATIONS_KEY)
    if (raw === null) return {}

    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}

    const restored: Record<string, Message[]> = {}
    for (const [sessionId, messages] of Object.entries(parsed as Record<string, unknown>)) {
      if (sessionId === '' || !Array.isArray(messages)) continue
      const valid = messages.filter(isMessage).slice(-MAX_MESSAGES_PER_SESSION).map(hydrateMessage)
      if (valid.length === 0) continue
      restored[sessionId] = valid
    }
    return restored
  } catch {
    return {}
  }
}

export function saveConversations(conversations: Record<string, Message[]>): void {
  try {
    localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(conversations))
  } catch {
    // Quota exceeded or serialization failure: in-memory state stays usable
  }
}

export function removeConversationsBySessionIds(
  conversations: Record<string, Message[]>,
  sessionIds: string[]
): Record<string, Message[]> {
  if (sessionIds.length === 0) return conversations

  const idsToRemove = new Set(sessionIds)
  let changed = false
  const next: Record<string, Message[]> = {}
  for (const [sessionId, messages] of Object.entries(conversations)) {
    if (idsToRemove.has(sessionId)) {
      changed = true
      continue
    }
    next[sessionId] = messages
  }
  return changed ? next : conversations
}

/**
 * Rewrite one message.
 *
 * The updater returns the message unchanged to signal that nothing moved, and
 * the previous state object is returned in that case. A streaming reply fires on
 * every event, including ones that carry no usable text, and re-rendering the
 * whole transcript for those is wasted work.
 */
export function applyMessageUpdate(
  conversations: Record<string, Message[]>,
  sessionId: string,
  messageId: string,
  update: (previous: Message) => Message
): Record<string, Message[]> {
  const existing = conversations[sessionId]
  if (existing === undefined) return conversations

  let changed = false
  const next = existing.map((message) => {
    if (message.id !== messageId) return message
    const updated = update(message)
    if (updated === message) return message
    changed = true
    return updated
  })

  return changed ? { ...conversations, [sessionId]: next } : conversations
}

/**
 * Drop one message.
 *
 * A queued turn appends its message before it is sent, so dismissing the queued
 * turn has to take the message back out. Leaving it behind would show a question
 * in the transcript that nothing is ever going to answer.
 */
export function removeMessage(
  conversations: Record<string, Message[]>,
  sessionId: string,
  messageId: string
): Record<string, Message[]> {
  const existing = conversations[sessionId]
  if (existing === undefined) return conversations

  const next = existing.filter((message) => message.id !== messageId)
  // The same object when nothing matched, so an unrelated dismiss does not
  // re-render the transcript.
  if (next.length === existing.length) return conversations

  return { ...conversations, [sessionId]: next }
}

export interface UseConversationsResult {
  getMessages: (sessionId: string) => Message[]
  appendMessage: (sessionId: string, message: Message) => void
  /**
   * Rewrite one message. Used to grow a streaming reply in place, to append
   * reasoning beside it, and to replace it with an error without leaving a blank
   * bubble behind.
   */
  updateMessage: (sessionId: string, messageId: string, update: (previous: Message) => Message) => void
  /** Replace a whole conversation, used when a checkpoint is applied. */
  replaceMessages: (sessionId: string, messages: Message[]) => void
  /** Remove one message, used when a queued turn is taken back. */
  deleteMessage: (sessionId: string, messageId: string) => void
  deleteConversations: (sessionIds: string[]) => void
}

export function useConversations(): UseConversationsResult {
  const [conversations, setConversations] = useState<Record<string, Message[]>>(loadConversations)

  // Stream callbacks and queue draining can share one React batch. The next
  // request must see the last event now, not after the next render's effect.
  const current = useRef(conversations)
  const publish = useCallback((update: (previous: Record<string, Message[]>) => Record<string, Message[]>): void => {
    const next = update(current.current)
    if (next === current.current) return
    current.current = next
    setConversations(next)
  }, [])

  useEffect(() => {
    saveConversations(conversations)
  }, [conversations])

  const getMessages = useCallback(
    (sessionId: string): Message[] => current.current[sessionId] ?? [],
    []
  )

  const appendMessage = useCallback((sessionId: string, message: Message): void => {
    publish((prev) => {
      const existing = prev[sessionId] ?? []
      return { ...prev, [sessionId]: [...existing, message] }
    })
  }, [publish])

  const updateMessage = useCallback(
    (sessionId: string, messageId: string, update: (previous: Message) => Message): void => {
      publish((prev) => applyMessageUpdate(prev, sessionId, messageId, update))
    },
    [publish]
  )

  const replaceMessages = useCallback((sessionId: string, messages: Message[]): void => {
    publish((prev) => ({ ...prev, [sessionId]: messages }))
  }, [publish])

  const deleteMessage = useCallback((sessionId: string, messageId: string): void => {
    publish((prev) => removeMessage(prev, sessionId, messageId))
  }, [publish])

  const deleteConversations = useCallback((sessionIds: string[]): void => {
    publish((prev) => removeConversationsBySessionIds(prev, sessionIds))
  }, [publish])

  return {
    getMessages,
    appendMessage,
    updateMessage,
    replaceMessages,
    deleteMessage,
    deleteConversations
  }
}
