import type { Message } from './types'

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
