import type { AgentMessage, SessionMessageEntry } from '../sessions/types'
import type { ChatImage, ToolCall } from '../providers/types'
import { zeroUsage } from '../compaction'

/** A turn as the wire carries it. */
export interface TranscriptMessage {
  id: string
  turnId?: string
  toolCalls?: readonly ToolCall[]
  toolCallId?: string
  thinkingSignature?: string
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  /**
   * Images sent with this turn.
   *
   * Carried through compaction rather than dropped at the door. A checkpoint
   * keeps the recent turns verbatim, and a pasted screenshot on one of those
   * turns is part of the question being asked. Losing it would leave the model
   * answering about a picture it can no longer see.
   *
   * They count for nothing when measuring. Estimating an image in tokens is a
   * guess, and a guess that undercounts is the one that overflows.
   */
  images?: readonly ChatImage[]
}

/** One entry in the chain compaction reasons about. */
export type TranscriptEntry = SessionMessageEntry

function toAgentMessage(message: TranscriptMessage): AgentMessage {
  if (message.role === 'assistant') {
    return {
      role: 'assistant',
      content: [
        { type: 'text', text: message.content },
        ...(message.toolCalls ?? []).map(call => ({ type: 'toolCall' as const, id: call.id, name: call.name,
          arguments: parseArgumentsForSummary(call.arguments) }))
      ],
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

  if (message.role === 'tool') return {
    role: 'toolResult', toolCallId: message.toolCallId ?? '', toolName: 'tool',
    content: [{ type: 'text', text: message.content }], isError: false, timestamp: 0
  }

  // A system note is text as far as compaction is
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
    ...(message.turnId === undefined ? {} : { turnId: message.turnId }),
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

/** Invalid arguments still belong in the summary; never silently omit a failed call. */
function parseArgumentsForSummary(text: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(text)
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  } catch { /* Preserve the provider's original malformed payload below. */ }
  return { rawArguments: text }
}
