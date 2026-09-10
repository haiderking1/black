import { useCallback, useEffect, useState } from 'react'
import type { Message } from './types'

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
      const valid = messages.filter(isMessage).slice(-MAX_MESSAGES_PER_SESSION)
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
 * Rewrite one message's text.
 *
 * Returns the previous object when nothing changed, so a streaming reply does
 * not re-render on every event that carries no text.
 */
export function applyMessageUpdate(
  conversations: Record<string, Message[]>,
  sessionId: string,
  messageId: string,
  update: (previous: string) => string
): Record<string, Message[]> {
  const existing = conversations[sessionId]
  if (existing === undefined) return conversations

  let changed = false
  const next = existing.map((message) => {
    if (message.id !== messageId) return message
    const content = update(message.content)
    if (content === message.content) return message
    changed = true
    return { ...message, content }
  })

  return changed ? { ...conversations, [sessionId]: next } : conversations
}

export interface UseConversationsResult {
  getMessages: (sessionId: string) => Message[]
  appendMessage: (sessionId: string, message: Message) => void
  /**
   * Rewrite one message's text. Used to grow a streaming reply in place, and to
   * replace it with an error without leaving a blank bubble behind.
   */
  updateMessage: (sessionId: string, messageId: string, update: (previous: string) => string) => void
  deleteConversations: (sessionIds: string[]) => void
}

export function useConversations(): UseConversationsResult {
  const [conversations, setConversations] = useState<Record<string, Message[]>>(loadConversations)

  useEffect(() => {
    saveConversations(conversations)
  }, [conversations])

  const getMessages = useCallback(
    (sessionId: string): Message[] => conversations[sessionId] ?? [],
    [conversations]
  )

  const appendMessage = useCallback((sessionId: string, message: Message): void => {
    setConversations((prev) => {
      const existing = prev[sessionId] ?? []
      return { ...prev, [sessionId]: [...existing, message] }
    })
  }, [])

  const updateMessage = useCallback(
    (sessionId: string, messageId: string, update: (previous: string) => string): void => {
      setConversations((prev) => applyMessageUpdate(prev, sessionId, messageId, update))
    },
    []
  )

  const deleteConversations = useCallback((sessionIds: string[]): void => {
    setConversations((prev) => removeConversationsBySessionIds(prev, sessionIds))
  }, [])

  return { getMessages, appendMessage, updateMessage, deleteConversations }
}
