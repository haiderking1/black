import type { ChatMessage as WireMessage } from '../../contracts/chat'
import type { ChatMessage } from '../providers/types'
import type { TranscriptMessage } from './transcript'

export function wireTranscript(messages: readonly WireMessage[]): TranscriptMessage[] {
  return messages.map((message, index) => ({ ...message, id: message.id ?? 'turn-' + index }))
}

/** Explicit adapter: UI grouping ids never become provider fields. */
export function providerHistory(messages: readonly TranscriptMessage[]): ChatMessage[] {
  return messages.map(message => ({
    role: message.role, content: message.content,
    ...(message.images === undefined ? {} : { images: [...message.images] }),
    ...(message.toolCalls === undefined ? {} : { toolCalls: [...message.toolCalls] }),
    ...(message.toolCallId === undefined ? {} : { toolCallId: message.toolCallId }),
    ...(message.thinkingSignature === undefined ? {} : { thinkingSignature: message.thinkingSignature })
  }))
}
