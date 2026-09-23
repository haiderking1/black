import { createHash } from 'node:crypto'

import type { ChatMessage, ChatRequest } from '../types'

const VALID_CALL_ID = /^[A-Za-z0-9_-]{1,64}$/

/** Upstream Responses routes cap call_id at 64 characters. Keep the local id unchanged for tool dispatch. */
function wireCallId(id: string): string {
  if (VALID_CALL_ID.test(id)) return id
  // Hash the whole id, not its first 64 characters: different tool calls must
  // stay distinct, and a tool result must name the same call on every retry.
  return 'call_black_' + createHash('sha256').update(id).digest('hex').slice(0, 48)
}

function wireMessage(message: ChatMessage): ChatMessage {
  if (message.toolCalls === undefined && message.toolCallId === undefined) return message
  return {
    ...message,
    ...(message.toolCalls === undefined ? {} : { toolCalls: message.toolCalls.map(call => ({
      ...call, id: wireCallId(call.id),
    })) }),
    ...(message.toolCallId === undefined ? {} : { toolCallId: wireCallId(message.toolCallId) }),
  }
}

/** Only Experiential's outgoing messages are adapted; saved history keeps the vendor's original IDs. */
export function withExperientialToolIds(request: ChatRequest): ChatRequest {
  return { ...request, messages: request.messages.map(wireMessage) }
}
