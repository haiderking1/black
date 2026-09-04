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

export interface UseConversationsResult {
  getMessages: (sessionId: string) => Message[]
  appendMessage: (sessionId: string, message: Message) => void
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

  const deleteConversations = useCallback((sessionIds: string[]): void => {
    setConversations((prev) => removeConversationsBySessionIds(prev, sessionIds))
  }, [])

  return { getMessages, appendMessage, deleteConversations }
}
