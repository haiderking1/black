import type { Message } from './types'

/**
 * Reorder queued user rows into the actual send sequence before a request is
 * built. This matters when a queued send is moved ahead of an older one.
 */
export function orderMessagesForSend(
  messages: readonly Message[],
  currentMessageId: string,
  queuedMessageIds: readonly string[]
): readonly Message[] {
  const current = messages.find((message) => message.id === currentMessageId)
  if (current === undefined || current.role !== 'user') return messages

  const messagesById = new Map<string, Message>()
  for (const message of messages) {
    if (!messagesById.has(message.id)) messagesById.set(message.id, message)
  }
  const pending = new Map<string, Message>()
  for (const id of queuedMessageIds) {
    if (id === currentMessageId || pending.has(id)) continue
    const message = messagesById.get(id)
    if (message?.role === 'user') pending.set(id, message)
  }

  const movedIds = new Set([currentMessageId, ...pending.keys()])
  const ordered = [
    ...messages.filter((message) => !movedIds.has(message.id)),
    current,
    ...pending.values()
  ]
  if (ordered.length === messages.length && ordered.every((message, index) => message === messages[index])) {
    return messages as Message[]
  }
  return ordered
}

/**
 * The conversation up to, but not including, one message.
 *
 * A queued turn appends its user message when it is queued but only sends when
 * the reply ahead of it finishes. By then the message is part of the transcript,
 * so reading the whole thing would put the question in the history and then ask
 * it again as the turn.
 *
 * A message that is not in the list returns everything. That keeps a send
 * working if the transcript changed underneath it, rather than sending an empty
 * history.
 */
export function historyBefore(messages: readonly Message[], messageId: string): Message[] {
  const index = messages.findIndex((message) => message.id === messageId)
  if (index === -1) return [...messages]
  return messages.slice(0, index)
}
