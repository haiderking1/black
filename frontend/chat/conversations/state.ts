import type { Message } from '../types'

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

/** Insert a reply immediately after the message that started its turn. */
export function insertMessageAfter(
  conversations: Record<string, Message[]>,
  sessionId: string,
  afterMessageId: string,
  message: Message
): Record<string, Message[]> {
  const existing = conversations[sessionId] ?? []
  if (existing.some((item) => item.id === message.id)) return conversations

  const anchorIndex = existing.findIndex((item) => item.id === afterMessageId)
  const insertionIndex = anchorIndex === -1 ? existing.length : anchorIndex + 1
  return {
    ...conversations,
    [sessionId]: [
      ...existing.slice(0, insertionIndex),
      message,
      ...existing.slice(insertionIndex)
    ]
  }
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

