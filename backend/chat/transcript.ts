import type { AgentMessage, SessionMessageEntry } from '../sessions/types'
import { zeroUsage } from '../compaction'

/** A turn as the wire carries it. */
export interface TranscriptMessage {
  id: string
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
}

/** One entry in the chain compaction reasons about. */
export type TranscriptEntry = SessionMessageEntry

function toAgentMessage(message: TranscriptMessage): AgentMessage {
  if (message.role === 'assistant') {
    return {
      role: 'assistant',
      content: [{ type: 'text', text: message.content }],
      // Nothing downstream reads these: compaction counts tokens and serializes
      // text. They exist because the entry format requires them.
      api: 'chat',
      provider: 'unknown',
      model: 'unknown',
      usage: zeroUsage(),
      stopReason: 'stop',
      timestamp: 0
    }
  }

  // A tool result and a system note are both text as far as compaction is
  // concerned: it counts tokens and serializes text, and neither carries
  // anything it needs to preserve separately.
  return { role: 'user', content: message.content, timestamp: 0 }
}

/**
 * Turn a wire transcript into the entry chain compaction expects.
 *
 * The ids come from the wire rather than being assigned here. A cut point has to
 * be nameable afterwards, so the id the transcript survives with has to be the
 * same id the cut pointed at. Assigning them at this level would make every turn
 * produce different ids for the same history, and the cut would never resolve.
 *
 * parentId is chained in order. Compaction walks the array linearly, but the
 * chain is what a session file would carry, so it is built correctly here rather
 * than left as a field that lies.
 */
export function toEntries(messages: readonly TranscriptMessage[]): TranscriptEntry[] {
  return messages.map((message, index) => ({
    type: 'message',
    id: message.id,
    parentId: index === 0 ? null : (messages[index - 1]?.id ?? null),
    timestamp: new Date(index).toISOString(),
    message: toAgentMessage(message)
  }))
}

/**
 * The messages from a kept entry onward.
 *
 * A cut that names an entry no longer present returns everything rather than
 * nothing. Sending the whole transcript is a request that may be too large;
 * sending none of it is a conversation the model has never seen.
 */
export function messagesFrom(
  messages: readonly TranscriptMessage[],
  firstKeptId: string
): TranscriptMessage[] {
  const index = messages.findIndex((message) => message.id === firstKeptId)
  if (index === -1) return [...messages]
  return messages.slice(index)
}

/** The block a summary is presented to the model in. */
export function summaryBlock(summary: string): string {
  return 'Earlier in this conversation, before the context was trimmed:\n\n' + summary
}
